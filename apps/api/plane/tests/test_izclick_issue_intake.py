# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from uuid import uuid4
from django.test import TestCase, TransactionTestCase, override_settings
from rest_framework.test import APIClient
from rest_framework.exceptions import ValidationError
from plane.db.models import (
    User,
    Workspace,
    WorkspaceMember,
    Project,
    ProjectMember,
    State,
    Issue,
    IssueAssignee,
    Notification,
    IzclickEmailDelivery,
    IzclickWorkspaceRole,
    IzclickIssueCoordination,
    IzclickIssueAssignmentHistory,
    IzclickCustomFieldValue,
)
from plane.utils.izclick_issue_intake import assign_issue


class IntakeFixture:
    def prepare(self):
        self.users = {}
        for name in [
            "commercial",
            "coordinator",
            "coordinator2",
            "producer",
            "producer2",
        ]:
            self.users[name] = User.objects.create(
                email=f"{name}-{uuid4()}@example.test", username=str(uuid4())
            )
        self.workspace = Workspace.objects.create(
            name="Agency", slug="task-agency", owner=self.users["commercial"]
        )
        self.project = Project.objects.create(
            name="COTIZACIONES IZANGO", identifier="COT", workspace=self.workspace
        )
        self.state = State.objects.create(
            name="Recibida",
            group="unstarted",
            default=True,
            project=self.project,
            workspace=self.workspace,
        )
        for name, user in self.users.items():
            WorkspaceMember.objects.create(
                workspace=self.workspace, member=user, role=15
            )
            IzclickWorkspaceRole.objects.create(
                workspace=self.workspace,
                user=user,
                role="coordinator"
                if name.startswith("coordinator")
                else "producer"
                if name.startswith("producer")
                else "commercial",
            )
        self.client = APIClient()
        self.native = (
            f"/api/workspaces/{self.workspace.slug}/projects/{self.project.pk}/issues/"
        )
        self.api = f"/api/workspaces/{self.workspace.slug}/izclick/tasks/"

    def create(self):
        self.client.force_authenticate(self.users["commercial"])
        response = self.client.post(
            self.native,
            {
                "name": "Solicitud comercial",
                "state_id": str(self.state.pk),
                "target_date": "2026-12-15",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        return Issue.objects.get(pk=response.data["id"])

    def assign(
        self, issue, actor="coordinator", producer="producer", version=0, previous=None
    ):
        return assign_issue(
            issue_id=issue.pk,
            slug=self.workspace.slug,
            actor=self.users[actor],
            producer_id=self.users[producer].pk,
            expected_version=version,
            expected_producer_id=str(previous) if previous else None,
        )


@override_settings(
    IZCLICK_COORDINATION_ENABLED=True,
    IZCLICK_COORDINATION_WORKSPACES=[],
    CELERY_BROKER_URL="memory://",
)
class NativeIssueIntakeTests(IntakeFixture, TestCase):
    def setUp(self):
        self.prepare()

    def test_real_native_form_creates_pending_shared_intake_and_commercial_identity(
        self,
    ):
        issue = self.create()
        row = IzclickIssueCoordination.objects.get(issue=issue)
        self.assertEqual(row.commercial_id, self.users["commercial"].pk)
        self.assertEqual(row.status, "pending")
        self.assertFalse(IssueAssignee.objects.filter(issue=issue).exists())
        notices = Notification.objects.filter(entity_name="izclick.issue_created")
        self.assertEqual(
            set(notices.values_list("receiver_id", flat=True)),
            {self.users["coordinator"].pk, self.users["coordinator2"].pk},
        )
        self.assertEqual(IzclickEmailDelivery.objects.count(), 2)
        self.assertTrue(
            all(n.data["url"].endswith(f"?task={issue.pk}") for n in notices)
        )
        self.assertEqual(
            IzclickCustomFieldValue.objects.get(
                issue=issue, field__name="Comercial asignado"
            ).value,
            str(self.users["commercial"].pk),
        )
        for actor in ["coordinator", "coordinator2"]:
            self.client.force_authenticate(self.users[actor])
            response = self.client.get(self.api)
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data["tasks"][0]["id"], str(issue.pk))

    def test_commercial_and_producer_cannot_assign(self):
        issue = self.create()
        for actor in ["commercial", "producer"]:
            self.client.force_authenticate(self.users[actor])
            response = self.client.post(
                self.api + f"{issue.pk}/assign/",
                {
                    "producer_id": str(self.users["producer"].pk),
                    "expected_version": 0,
                    "expected_producer_id": None,
                },
                format="json",
            )
            self.assertEqual(response.status_code, 403, response.data)
        self.assertFalse(IzclickIssueAssignmentHistory.objects.exists())

    def test_direct_assignment_in_commercial_creation_is_rejected_without_partial_task(
        self,
    ):
        self.client.force_authenticate(self.users["commercial"])
        response = self.client.post(
            self.native,
            {"name": "Bypass", "assignee_ids": [str(self.users["producer"].pk)]},
            format="json",
        )
        self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(Issue.objects.filter(name="Bypass").exists())

    def test_native_default_assignee_does_not_skip_coordination(self):
        ProjectMember.objects.create(
            project=self.project,
            workspace=self.workspace,
            member=self.users["producer"],
            role=15,
        )
        self.project.default_assignee = self.users["producer"]
        self.project.save()
        issue = self.create()
        self.assertFalse(IssueAssignee.objects.filter(issue=issue).exists())
        self.assertIsNone(IzclickIssueCoordination.objects.get(issue=issue).producer_id)

    def test_producer_cannot_create_a_top_level_commercial_request(self):
        self.client.force_authenticate(self.users["producer"])
        response = self.client.post(
            self.native, {"name": "Producer bypass"}, format="json"
        )
        self.assertEqual(response.status_code, 403, response.data)
        self.assertFalse(Issue.objects.filter(name="Producer bypass").exists())

    def test_current_producer_cannot_reassign_through_native_fields(self):
        issue = self.create()
        self.assign(issue)
        self.client.force_authenticate(self.users["producer"])
        response = self.client.patch(
            self.native + f"{issue.pk}/",
            {"assignee_ids": [str(self.users["producer2"].pk)]},
            format="json",
        )
        self.assertEqual(response.status_code, 403, response.data)
        self.assertEqual(
            IssueAssignee.objects.get(issue=issue).assignee_id,
            self.users["producer"].pk,
        )

    def test_old_producer_cannot_bulk_delete_reassigned_task(self):
        issue = self.create()
        self.assign(issue)
        self.assign(
            issue, producer="producer2", version=1, previous=self.users["producer"].pk
        )
        self.client.force_authenticate(self.users["producer"])
        response = self.client.delete(
            self.native.replace("issues/", "bulk-delete-issues/"),
            {"issue_ids": [str(issue.pk)]},
            format="json",
        )
        self.assertEqual(response.status_code, 403, response.data)
        self.assertTrue(Issue.objects.filter(pk=issue.pk).exists())

    def test_foreign_workspace_member_cannot_read_shared_queue(self):
        outsider = User.objects.create(
            email=f"outsider-{uuid4()}@example.test", username=str(uuid4())
        )
        self.client.force_authenticate(outsider)
        response = self.client.get(self.api)
        self.assertEqual(response.status_code, 403, response.data)

    def test_closed_task_cannot_be_assigned(self):
        issue = self.create()
        issue.state = State.objects.create(
            name="Completado",
            group="completed",
            project=self.project,
            workspace=self.workspace,
        )
        issue.save()
        with self.assertRaises(ValidationError):
            self.assign(issue)
        self.assertFalse(IssueAssignee.objects.filter(issue=issue).exists())

    def test_reassignment_preserves_task_and_history_and_revokes_previous_producer(
        self,
    ):
        issue = self.create()
        self.assign(issue)
        self.client.force_authenticate(self.users["producer"])
        changed = self.client.patch(
            self.native + f"{issue.pk}/", {"name": "Trabajo asignado"}, format="json"
        )
        self.assertEqual(changed.status_code, 204, changed.data)
        self.assign(
            issue, producer="producer2", version=1, previous=self.users["producer"].pk
        )
        denied = self.client.patch(
            self.native + f"{issue.pk}/", {"name": "Cambio no permitido"}, format="json"
        )
        self.assertEqual(denied.status_code, 403, denied.data)
        issue.refresh_from_db()
        self.assertEqual(issue.name, "Trabajo asignado")
        self.assertEqual(IzclickIssueAssignmentHistory.objects.count(), 2)
        self.assertEqual(
            list(
                IssueAssignee.objects.filter(issue=issue).values_list(
                    "assignee_id", flat=True
                )
            ),
            [self.users["producer2"].pk],
        )
        self.assertTrue(
            ProjectMember.objects.filter(
                project=self.project, member=self.users["producer"]
            ).exists()
        )

    def test_stale_assignment_and_foreign_producer_are_rejected(self):
        issue = self.create()
        self.assign(issue)
        with self.assertRaises(ValidationError):
            self.assign(issue, producer="producer2")
        self.assertEqual(IzclickIssueAssignmentHistory.objects.count(), 1)

    def test_workload_includes_historical_native_assignments_without_adoption(self):
        issue = Issue.objects.create(
            name="Carga anterior",
            project=self.project,
            workspace=self.workspace,
            state=self.state,
        )
        IssueAssignee.objects.create(
            issue=issue,
            assignee=self.users["producer"],
            project=self.project,
            workspace=self.workspace,
        )
        self.client.force_authenticate(self.users["commercial"])
        response = self.client.get(self.api + "workload/")
        self.assertEqual(response.status_code, 200, response.data)
        producer = next(
            row
            for row in response.data
            if row["producer_id"] == str(self.users["producer"].pk)
        )
        self.assertEqual(producer["active_count"], 1)
        self.assertFalse(IzclickIssueCoordination.objects.filter(issue=issue).exists())

    def test_failed_transaction_keeps_notifications_and_task_atomic(self):
        from unittest.mock import patch

        self.client.force_authenticate(self.users["commercial"])
        with patch(
            "plane.utils.izclick_issue_intake.notify",
            side_effect=RuntimeError("test rollback"),
        ):
            response = self.client.post(
                self.native, {"name": "Rolled back"}, format="json"
            )
        self.assertEqual(response.status_code, 500)
        self.assertFalse(Issue.objects.filter(name="Rolled back").exists())
        self.assertFalse(IzclickIssueCoordination.objects.exists())
        self.assertFalse(IzclickEmailDelivery.objects.exists())


@override_settings(
    IZCLICK_COORDINATION_ENABLED=True,
    IZCLICK_COORDINATION_WORKSPACES=[],
    CELERY_BROKER_URL="memory://",
)
class IssueAssignmentRaceTests(IntakeFixture, TransactionTestCase):
    def test_two_coordinators_cannot_overwrite_a_pending_intake(self):
        from concurrent.futures import ThreadPoolExecutor
        from threading import Barrier
        from django.db import close_old_connections

        self.prepare()
        issue = self.create()
        barrier = Barrier(2)

        def attempt(actor, producer):
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                self.assign(issue, actor=actor, producer=producer)
                return "assigned"
            except ValidationError:
                return "conflict"
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [
                pool.submit(attempt, "coordinator", "producer"),
                pool.submit(attempt, "coordinator2", "producer2"),
            ]
            self.assertCountEqual(
                [f.result(timeout=30) for f in futures], ["assigned", "conflict"]
            )
        self.assertEqual(IzclickIssueAssignmentHistory.objects.count(), 1)
