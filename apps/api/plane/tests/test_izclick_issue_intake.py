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

    def test_coordinator_creates_and_assigns_workspace_producer_atomically(self):
        self.client.force_authenticate(self.users["coordinator"])
        response = self.client.post(self.native, {
            "name": "Carga directa", "state_id": str(self.state.pk),
            "assignee_ids": [str(self.users["producer"].pk)],
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        issue = Issue.objects.get(pk=response.data["id"])
        row = IzclickIssueCoordination.objects.get(issue=issue)
        self.assertEqual(row.producer_id, self.users["producer"].pk)
        self.assertEqual(row.assigned_by_id, self.users["coordinator"].pk)
        self.assertEqual(row.status, "assigned")
        self.assertEqual(IssueAssignee.objects.get(issue=issue).assignee_id, row.producer_id)
        self.assertTrue(ProjectMember.objects.filter(project=self.project, member_id=row.producer_id, is_active=True).exists())
        self.assertEqual(row.assignment_history.count(), 1)

    def test_direct_assignment_rejects_nonproducer_without_creating_issue(self):
        self.client.force_authenticate(self.users["coordinator"])
        count = Issue.objects.count()
        response = self.client.post(self.native, {
            "name": "Invalid assignment", "assignee_ids": [str(self.users["commercial"].pk)],
        }, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(Issue.objects.count(), count)

    def test_coordinator_can_create_pending_without_producer(self):
        self.client.force_authenticate(self.users["coordinator"])
        response = self.client.post(self.native, {"name": "Pendiente"}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        row = IzclickIssueCoordination.objects.get(issue_id=response.data["id"])
        self.assertEqual(row.status, "pending")
        self.assertIsNone(row.producer_id)

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


@override_settings(IZCLICK_COORDINATION_ENABLED=True, IZCLICK_COORDINATION_WORKSPACES=[], CELERY_BROKER_URL="memory://")
class CreationAttachmentTests(IntakeFixture, TestCase):
    def setUp(self):
        self.prepare()
        self.client.force_authenticate(self.users["commercial"])
        self.assets_url = f"/api/assets/v2/workspaces/{self.workspace.slug}/projects/{self.project.pk}/"

    def staged(self, **changes):
        from plane.db.models import FileAsset
        values = dict(workspace=self.workspace, project=self.project,
            created_by=self.users["commercial"], entity_type="ISSUE_ATTACHMENT",
            asset=f"{self.workspace.pk}/{uuid4()}-brief.pdf", is_uploaded=True,
            attributes={"name": "brief.pdf", "type": "application/pdf", "creation_staged": True})
        values.update(changes)
        asset = FileAsset(**values)
        asset.save(disable_auto_set_user=True)
        return asset

    def submit(self, ids, **changes):
        data = {"name": "Brief adjunto", "state_id": str(self.state.pk), "attachment_asset_ids": ids}
        data.update(changes)
        return self.client.post(self.native, data, format="json")

    def test_commercial_creates_with_multiple_files_visible_to_coordination(self):
        first, second = self.staged(), self.staged()
        response = self.submit([str(first.pk), str(second.pk)])
        self.assertEqual(response.status_code, 201, response.data)
        first.refresh_from_db(); second.refresh_from_db()
        self.assertEqual(str(first.issue_id), response.data["id"])
        self.assertEqual(first.issue_id, second.issue_id)
        self.client.force_authenticate(self.users["coordinator"])
        result = self.client.get(self.assets_url + f"issues/{first.issue_id}/attachments/")
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual({item["id"] for item in result.data}, {str(first.pk), str(second.pk)})

    def test_invalid_files_roll_back_task_intake_and_notifications(self):
        from plane.db.models import FileAsset
        valid = self.staged()
        foreign_project = Project.objects.create(name="Other", identifier="OTHER", workspace=self.workspace)
        for changes in [
            {"created_by": self.users["producer"]}, {"is_uploaded": False},
            {"project": foreign_project}, {"is_deleted": True},
            {"entity_type": "ISSUE_DESCRIPTION"},
        ]:
            bad = self.staged(**changes)
            response = self.submit([str(valid.pk), str(bad.pk)])
            self.assertEqual(response.status_code, 400, response.data)
            self.assertFalse(Issue.objects.exists())
            self.assertFalse(IzclickIssueCoordination.objects.exists())
            self.assertFalse(Notification.objects.exists())
            valid.refresh_from_db(); self.assertIsNone(valid.issue_id)
        self.assertEqual(FileAsset.objects.filter(issue__isnull=False).count(), 0)

    def test_rejects_invalid_duplicate_and_already_used_assets(self):
        asset = self.staged()
        for ids in ["not-a-list", None, ["bad-id"], [str(asset.pk), str(asset.pk)], [str(uuid4())]]:
            response = self.submit(ids)
            self.assertEqual(response.status_code, 400, response.data)
            self.assertFalse(Issue.objects.exists())
        first = self.submit([str(asset.pk)])
        self.assertEqual(first.status_code, 201, first.data)
        again = self.submit([str(asset.pk)])
        self.assertEqual(again.status_code, 400, again.data)
        self.assertEqual(Issue.objects.count(), 1)

    def test_coordinator_can_create_assign_and_attach_in_one_transaction(self):
        self.client.force_authenticate(self.users["coordinator"])
        asset = self.staged(created_by=self.users["coordinator"])
        response = self.submit([str(asset.pk)], assignee_ids=[str(self.users["producer"].pk)])
        self.assertEqual(response.status_code, 201, response.data)
        asset.refresh_from_db()
        self.assertEqual(IzclickIssueCoordination.objects.get(issue_id=asset.issue_id).producer_id,
            self.users["producer"].pk)

    def test_commercial_without_project_membership_can_stage_pdf_and_confirm_only_own(self):
        from unittest.mock import patch
        from plane.db.models import IzclickProjectCoordination
        IzclickProjectCoordination.objects.create(project=self.project, workspace=self.workspace,
            commercial=self.users["commercial"])
        self.assertFalse(ProjectMember.objects.filter(member=self.users["commercial"]).exists())
        with patch("plane.app.views.asset.v2.S3Storage") as storage:
            storage.return_value.generate_presigned_post.return_value = {"url": "https://example.test/upload", "fields": {}}
            response = self.client.post(self.assets_url, {
                "name": "brief.pdf", "type": "application/pdf", "size": 100,
                "entity_type": "ISSUE_ATTACHMENT", "entity_identifier": "",
            }, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        with patch("plane.app.views.asset.v2.get_asset_object_metadata.delay"):
            confirmed = self.client.patch(self.assets_url + response.data["asset_id"] + "/", {}, format="json")
        self.assertEqual(confirmed.status_code, 204, confirmed.data)
        foreign = self.staged(created_by=self.users["producer"], is_uploaded=False)
        denied = self.client.patch(self.assets_url + str(foreign.pk) + "/", {}, format="json")
        self.assertEqual(denied.status_code, 403, denied.data)

    def test_rejects_oversized_unsupported_or_existing_issue_staging(self):
        for data in [
            {"type": "application/pdf", "size": 999999999999},
            {"type": "not/allowed", "size": 100},
            {"type": "application/pdf", "size": 100, "entity_identifier": str(uuid4())},
        ]:
            response = self.client.post(self.assets_url, {
                "name": "brief.pdf", "entity_type": "ISSUE_ATTACHMENT", **data,
            }, format="json")
            self.assertIn(response.status_code, [400, 403], response.data)

    def test_cleanup_removes_abandoned_staging_but_preserves_attached_and_recent_files(self):
        from datetime import timedelta
        from django.utils import timezone
        from plane.db.models import FileAsset
        from plane.bgtasks.file_asset_task import delete_unuploaded_file_asset
        abandoned, attached, recent = self.staged(), self.staged(), self.staged()
        response = self.submit([str(attached.pk)])
        self.assertEqual(response.status_code, 201, response.data)
        FileAsset.objects.filter(pk__in=[abandoned.pk, attached.pk]).update(created_at=timezone.now() - timedelta(days=8))
        delete_unuploaded_file_asset()
        self.assertFalse(FileAsset.objects.filter(pk=abandoned.pk).exists())
        self.assertTrue(FileAsset.objects.filter(pk=attached.pk).exists())
        self.assertTrue(FileAsset.objects.filter(pk=recent.pk).exists())
