# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Real PostgreSQL contract tests for roles, intake, assignment and delivery."""

from datetime import timedelta
from unittest.mock import patch
from uuid import uuid4

from django.db import transaction
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework.exceptions import ValidationError

from plane.db.models import (
    User,
    Workspace,
    WorkspaceMember,
    Project,
    ProjectMember,
    Notification,
    IzclickWorkspaceRole,
    IzclickProjectCoordination,
    IzclickAssignmentHistory,
    IzclickEmailDelivery,
)
from plane.utils.izclick_assignment import assign_producer
from plane.utils.izclick_lifecycle import project_created, emit
from plane.utils.izclick_access import can_write
from plane.bgtasks.izclick_coordination_email import drain_coordination_outbox


@override_settings(
    IZCLICK_COORDINATION_ENABLED=True,
    WEB_URL="http://localhost:3000",
    CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}},
    CELERY_TASK_ALWAYS_EAGER=False,
)
class WorkflowTests(TestCase):
    def setUp(self):
        self.users = {}
        for role in ("commercial", "coordinator", "producer", "other", "coordinator2", "admin"):
            self.users[role] = User.objects.create(
                email=f"{role}@example.test", username=f"{role}-{uuid4()}", is_active=True, is_superuser=role == "admin"
            )
        self.workspace = Workspace.objects.create(name="Isolated agency", slug="test-agency", owner=self.users["admin"])
        for role, user in self.users.items():
            WorkspaceMember.objects.create(workspace=self.workspace, member=user, role=20 if role == "admin" else 15)
            IzclickWorkspaceRole.objects.create(
                workspace=self.workspace,
                user=user,
                role="producer" if role in ("other", "admin") else "coordinator" if role == "coordinator2" else role,
            )
        self.project = Project.objects.create(workspace=self.workspace, name="Campaign", identifier="CAMP")
        project_created(self.project, self.users["commercial"])
        self.client = APIClient()
        self.prefix = f"/api/workspaces/{self.workspace.slug}/izclick"

    def login(self, role):
        self.client.force_authenticate(self.users[role])

    def assign(self, role="coordinator", producer="producer", expected=None, version=None):
        return assign_producer(
            project=self.project,
            actor=self.users[role],
            producer=self.users[producer],
            expected_producer_id=expected,
            expected_version=version,
        )

    def test_intake_reaches_both_coordinators_once_and_outbox(self):
        project_created(self.project, self.users["commercial"])
        notices = Notification.objects.filter(project=self.project)
        self.assertEqual(
            set(notices.values_list("receiver_id", flat=True)),
            {self.users["coordinator"].pk, self.users["coordinator2"].pk},
        )
        self.assertEqual(IzclickEmailDelivery.objects.count(), 2)
        self.assertEqual(IzclickProjectCoordination.objects.count(), 1)

    def test_shared_queue_and_agency_workload_read(self):
        for role in ("coordinator", "coordinator2"):
            self.login(role)
            response = self.client.get(f"{self.prefix}/coordination/")
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data[0]["project_id"], str(self.project.pk))
        self.login("producer")
        self.assertEqual(self.client.get(f"{self.prefix}/workload/").status_code, 200)

    def test_assignment_and_reassignment_preserve_project_and_history(self):
        row, changed = self.assign()
        self.assertTrue(changed)
        self.assertEqual(row.producer_id, self.users["producer"].pk)
        self.assign(producer="other", expected=self.users["producer"].pk)
        self.assertEqual(IzclickAssignmentHistory.objects.count(), 2)
        self.assertEqual(Project.objects.get(pk=self.project.pk).name, "Campaign")
        self.assertTrue(ProjectMember.objects.filter(project=self.project, member=self.users["producer"]).exists())
        self.assertFalse(can_write(self.users["producer"], self.workspace.slug, self.project.pk))
        self.assertTrue(can_write(self.users["other"], self.workspace.slug, self.project.pk))

    def test_stale_assignment_does_not_overwrite(self):
        self.assign()
        with self.assertRaises(ValidationError):
            self.assign(producer="other")
        self.assertEqual(IzclickAssignmentHistory.objects.count(), 1)

    def test_stale_version_detects_aba_reassignment(self):
        self.assign()
        self.assign(producer="other", expected=self.users["producer"].pk)
        self.assign(producer="producer", expected=self.users["other"].pk)
        with self.assertRaises(ValidationError):
            self.assign(producer="other", expected=self.users["producer"].pk, version=1)

    def test_producer_cannot_assign_even_with_membership(self):
        self.login("producer")
        response = self.client.post(
            f"{self.prefix}/projects/{self.project.pk}/assign/",
            {"producer_id": str(self.users["other"].pk), "expected_producer_id": None},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_assigned_producer_can_update_only_own_work(self):
        self.assign()
        self.login("other")
        url = f"{self.prefix}/projects/{self.project.pk}/"
        self.assertEqual(self.client.patch(url, {"client": "Acme", "version": 1}, format="json").status_code, 403)
        self.login("producer")
        response = self.client.patch(url, {"client": "Acme", "version": 1}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["client"], "Acme")
        self.assertEqual(self.client.patch(url, {"client": "Stale", "version": 1}, format="json").status_code, 409)

    def test_status_and_quote_changes_notify_but_noop_does_not(self):
        self.assign()
        self.login("coordinator")
        url = f"{self.prefix}/projects/{self.project.pk}/"
        data = {"workflow_status": "completed", "quotation_url": "https://example.test/quote/42", "version": 1}
        response = self.client.patch(url, data, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        count = Notification.objects.count()
        data["version"] = 2
        self.assertEqual(self.client.patch(url, data, format="json").status_code, 200)
        self.assertEqual(Notification.objects.count(), count)
        self.assertTrue(Notification.objects.filter(entity_name="izclick.status_changed").exists())
        self.assertTrue(Notification.objects.filter(entity_name="izclick.quotation_link_created").exists())

    def test_comments_persist_and_exclude_author(self):
        self.assign()
        self.login("producer")
        response = self.client.post(
            f"{self.prefix}/projects/{self.project.pk}/comments/", {"body": "Ready"}, format="json"
        )
        self.assertEqual(response.status_code, 201, response.data)
        notices = Notification.objects.filter(entity_name="izclick.comment_created")
        self.assertTrue(notices.exists())
        self.assertFalse(notices.filter(receiver=self.users["producer"]).exists())

    def test_role_change_is_superadmin_only_and_preserves_history(self):
        self.assign()
        self.login("coordinator")
        body = {"user_id": str(self.users["producer"].pk), "role": "commercial"}
        self.assertEqual(self.client.patch(f"{self.prefix}/roles/", body, format="json").status_code, 403)
        self.login("admin")
        self.assertEqual(self.client.patch(f"{self.prefix}/roles/", body, format="json").status_code, 200)
        self.assertEqual(IzclickAssignmentHistory.objects.count(), 1)
        self.assertTrue(ProjectMember.objects.filter(project=self.project, member=self.users["producer"]).exists())

    def test_workload_excludes_completed_and_reports_due_dates(self):
        row, _ = self.assign()
        row.due_date = timezone.localdate() - timedelta(days=1)
        row.save()
        self.login("commercial")
        response = self.client.get(f"{self.prefix}/workload/")
        entry = next(x for x in response.data if x["producer_id"] == str(self.users["producer"].pk))
        self.assertEqual(entry["overdue_count"], 1)
        row.workflow_status = "completed"
        row.save()
        response = self.client.get(f"{self.prefix}/workload/")
        entry = next(x for x in response.data if x["producer_id"] == str(self.users["producer"].pk))
        self.assertEqual(entry["active_count"], 0)

    def test_rollback_removes_events_and_outbox(self):
        count = Notification.objects.count()
        with self.assertRaises(RuntimeError):
            with transaction.atomic():
                emit(self.project, self.users["coordinator"], "status_changed")
                raise RuntimeError("rollback")
        self.assertEqual(Notification.objects.count(), count)
        self.assertEqual(IzclickEmailDelivery.objects.count(), count)

    @patch("plane.bgtasks.izclick_coordination_email.send_delivery")
    def test_email_retry_and_success_are_idempotent(self, send):
        send.side_effect = RuntimeError("unavailable")
        self.assertEqual(drain_coordination_outbox(), 0)
        self.assertEqual(IzclickEmailDelivery.objects.filter(attempts=1, sent_at__isnull=True).count(), 2)
        IzclickEmailDelivery.objects.update(next_attempt_at=timezone.now() - timedelta(seconds=1))
        send.side_effect = None
        self.assertEqual(drain_coordination_outbox(), 2)
        self.assertEqual(drain_coordination_outbox(), 0)
        self.assertEqual(send.call_count, 4)

    def test_cross_workspace_access_rejected(self):
        stranger = User.objects.create(email="stranger@example.test", username=str(uuid4()))
        self.client.force_authenticate(stranger)
        self.assertEqual(self.client.get(f"{self.prefix}/projects/").status_code, 403)

    @override_settings(IZCLICK_COORDINATION_ENABLED=False)
    def test_feature_is_disabled_by_default(self):
        self.login("coordinator")
        self.assertEqual(self.client.get(f"{self.prefix}/projects/").status_code, 404)

    def test_existing_notification_inbox_displays_and_marks_project_alert_read(self):
        self.login("coordinator")
        response = self.client.get(f"/api/workspaces/{self.workspace.slug}/users/notifications/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(response.data), 1)
        notification = Notification.objects.get(receiver=self.users["coordinator"])
        response = self.client.post(
            f"/api/workspaces/{self.workspace.slug}/users/notifications/{notification.pk}/read/"
        )
        self.assertEqual(response.status_code, 200, response.data)
        notification.refresh_from_db()
        self.assertIsNotNone(notification.read_at)

    @patch("plane.app.views.project.base.model_activity.delay")
    def test_session_project_intake_connects_real_endpoint(self, activity):
        self.login("commercial")
        response = self.client.post(
            f"/api/workspaces/{self.workspace.slug}/projects/",
            {
                "name": "Launch",
                "identifier": "LAUNCH",
                "client": "Acme",
                "start_date": "2026-11-16",
                "due_date": "2026-11-30",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        row = IzclickProjectCoordination.objects.get(project_id=response.data["id"])
        self.assertEqual(row.commercial_id, self.users["commercial"].pk)
        self.assertEqual(row.client, "Acme")
        self.assertEqual(Notification.objects.filter(project_id=row.project_id).count(), 2)

    def test_producer_cannot_create_through_legacy_endpoint(self):
        self.login("producer")
        response = self.client.post(
            f"/api/workspaces/{self.workspace.slug}/projects/",
            {"name": "Denied", "identifier": "DENIED"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertFalse(Project.objects.filter(identifier="DENIED").exists())

    def test_retried_event_uuid_does_not_duplicate_either_channel(self):
        self.assign()
        event_id = uuid4()
        emit(self.project, self.users["coordinator"], "status_changed", event_id=event_id)
        notifications = Notification.objects.count()
        deliveries = IzclickEmailDelivery.objects.count()
        emit(self.project, self.users["coordinator"], "status_changed", event_id=event_id)
        self.assertEqual(Notification.objects.count(), notifications)
        self.assertEqual(IzclickEmailDelivery.objects.count(), deliveries)

    def test_regular_project_listing_exposes_assigned_producer_and_secret_projects(self):
        self.assign()
        self.project.network = 0
        self.project.save()
        self.login("other")
        response = self.client.get(f"/api/workspaces/{self.workspace.slug}/projects/details/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.json()[0]["coordination"]["producer_id"], str(self.users["producer"].pk))

    def test_previous_producer_cannot_edit_using_existing_project_membership(self):
        self.assign()
        self.assign(producer="other", expected=self.users["producer"].pk)
        self.login("producer")
        response = self.client.patch(
            f"/api/workspaces/{self.workspace.slug}/projects/{self.project.pk}/",
            {"description": "Unauthorized change"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.project.refresh_from_db()
        self.assertEqual(self.project.description, "")

    def test_smtp_adapter_renders_exact_link_and_stable_message_id(self):
        from django.core import mail
        from django.core.mail.backends.locmem import EmailBackend
        from plane.bgtasks.izclick_coordination_email import send_delivery

        delivery = IzclickEmailDelivery.objects.select_related(
            "notification__receiver", "notification__project"
        ).first()
        with (
            patch(
                "plane.bgtasks.izclick_coordination_email.get_email_configuration",
                return_value=("smtp.test", "user", "secret", 587, "1", "0", "sender@example.test"),
            ),
            patch("plane.bgtasks.izclick_coordination_email.get_connection", return_value=EmailBackend()),
        ):
            send_delivery(delivery)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [delivery.notification.receiver.email])
        self.assertIn(
            f"http://localhost:3000/{self.workspace.slug}/coordination/?project={self.project.pk}",
            mail.outbox[0].alternatives[0].content,
        )
        self.assertIn(str(delivery.pk), mail.outbox[0].extra_headers["Message-ID"])

    def test_invalid_dates_and_unsafe_quotation_do_not_change_project(self):
        self.login("coordinator")
        url = f"{self.prefix}/projects/{self.project.pk}/"
        for values in (
            {"quotation_url": "javascript:alert(1)", "version": 0},
            {"start_date": "2026-12-01", "due_date": "2026-11-01", "version": 0},
        ):
            self.assertEqual(self.client.patch(url, values, format="json").status_code, 400)
        self.assertEqual(IzclickProjectCoordination.objects.get(project=self.project).version, 0)

    def test_role_manifest_dry_run_and_apply_verify_identity(self):
        import json
        from tempfile import TemporaryDirectory
        from pathlib import Path
        from io import StringIO
        from django.core.management import call_command, CommandError
        from plane.db.models import IzclickRoleChange

        with TemporaryDirectory() as directory:
            manifest = Path(directory) / "roles.json"
            user = self.users["producer"]
            entry = {"user_id": str(user.pk), "email": user.email, "role": "commercial"}
            manifest.write_text(json.dumps([entry]), encoding="utf-8")
            call_command("configure_izclick_roles", self.workspace.slug, str(manifest), stdout=StringIO())
            self.assertEqual(IzclickWorkspaceRole.objects.get(user=user).role, "producer")
            call_command("configure_izclick_roles", self.workspace.slug, str(manifest), apply=True, stdout=StringIO())
            self.assertEqual(IzclickWorkspaceRole.objects.get(user=user).role, "commercial")
            self.assertEqual(IzclickRoleChange.objects.get(user=user).previous_role, "producer")
            entry["email"] = "wrong@example.test"
            manifest.write_text(json.dumps([entry]), encoding="utf-8")
            with self.assertRaises(CommandError):
                call_command(
                    "configure_izclick_roles", self.workspace.slug, str(manifest), apply=True, stdout=StringIO()
                )


@override_settings(IZCLICK_COORDINATION_ENABLED=True)
class AssignmentRaceTests(TransactionTestCase):
    def setUp(self):
        self.enqueue = patch("plane.bgtasks.izclick_coordination_email.drain_coordination_outbox.delay").start()
        self.addCleanup(patch.stopall)
        WorkflowTests.setUp(self)

    def test_two_coordinators_cannot_silently_overwrite(self):
        from concurrent.futures import ThreadPoolExecutor
        from threading import Barrier
        from django.db import close_old_connections

        barrier = Barrier(2)

        def attempt(coordinator, producer):
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                assign_producer(
                    project=self.project,
                    actor=self.users[coordinator],
                    producer=self.users[producer],
                    expected_producer_id=None,
                    expected_version=0,
                )
                return "assigned"
            except ValidationError:
                return "conflict"
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(attempt, "coordinator", "producer"), pool.submit(attempt, "coordinator2", "other")]
            results = [future.result(timeout=20) for future in futures]
        self.assertCountEqual(results, ["assigned", "conflict"])
        self.assertEqual(IzclickAssignmentHistory.objects.count(), 1)
