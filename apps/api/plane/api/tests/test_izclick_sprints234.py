"""Assignment permissions and safe workflow retirement against isolated Postgres."""
from unittest.mock import patch
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate
from plane.db.models import (User, Workspace, Project, ProjectMember, Issue, State,
                             IzclickCustomField, IzclickCustomFieldValue, IssueActivity)
from plane.api.views.izclick_custom_fields import (IzclickIssueCommercialAPI, IzclickCommercialAssignmentsAPI,
                                                  IzclickProjectCustomFieldsAPI, IzclickIssueCustomFieldValuesAPI)
from plane.api.views.izclick_state_retirement import IzclickProjectStateRetirementAPI


class Sprints234Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create(username="s234-admin", email="s234-admin@example.invalid")
        cls.member = User.objects.create(username="s234-member", email="s234-member@example.invalid")
        cls.reader = User.objects.create(username="s234-reader", email="s234-reader@example.invalid")
        cls.outsider = User.objects.create(username="s234-outside", email="s234-outside@example.invalid")
        cls.workspace = Workspace.objects.create(name="Sprint QA", slug="s234-qa", owner=cls.admin)
        cls.project = Project.objects.create(name="Sprint Project", identifier="SPR", workspace=cls.workspace, guest_view_all_features=True)
        for user, role in [(cls.admin, 20), (cls.member, 15), (cls.reader, 5)]:
            ProjectMember.objects.create(project=cls.project, workspace=cls.workspace, member=user, role=role, is_active=True)
        cls.source = State.objects.create(project=cls.project, workspace=cls.workspace, name="Antes", group="started", color="#112233")
        cls.target = State.objects.create(project=cls.project, workspace=cls.workspace, name="Después", group="completed", color="#445566")
        cls.issue = Issue.objects.create(project=cls.project, workspace=cls.workspace, name="Carga QA", state=cls.source)
        cls.child = Issue.objects.create(project=cls.project, workspace=cls.workspace, name="Subtarea QA", state=cls.source, parent=cls.issue)

    def request(self, view, actor=None, method="patch", data=None, **kwargs):
        request = getattr(APIRequestFactory(), method)("/api/s234/", data=data or {}, format="json")
        if actor:
            force_authenticate(request, user=actor)
        return view.as_view()(request, slug=self.workspace.slug, project_id=self.project.pk, **kwargs)

    def test_member_assigns_commercial_and_reader_can_read(self):
        response = self.request(IzclickIssueCommercialAPI, self.member, data={"member_id": str(self.admin.pk)}, issue_id=self.issue.pk)
        self.assertEqual(response.status_code, 200, response.data)
        mapping = self.request(IzclickCommercialAssignmentsAPI, self.reader, method="get")
        self.assertEqual(mapping.data[str(self.issue.pk)], str(self.admin.pk))
        self.assertEqual(self.request(IzclickIssueCommercialAPI, self.reader, data={"member_id": None}, issue_id=self.issue.pk).status_code, 403)
        self.assertEqual(self.request(IzclickCommercialAssignmentsAPI, self.outsider, method="get").status_code, 403)
        self.assertIn(self.request(IzclickCommercialAssignmentsAPI, method="get").status_code, (401, 403))

    def test_invalid_commercial_does_not_leave_field_or_value(self):
        response = self.request(IzclickIssueCommercialAPI, self.member, data={"member_id": str(self.outsider.pk)}, issue_id=self.issue.pk)
        self.assertEqual(response.status_code, 400)
        self.assertFalse(IzclickCustomField.objects.filter(name="Comercial asignado").exists())
        self.assertFalse(IzclickCustomFieldValue.objects.exists())

    def test_clear_assignment_and_inactive_member_validation(self):
        for value in [str(self.member.pk), None]:
            result = self.request(IzclickIssueCommercialAPI, self.member, data={"member_id": value}, issue_id=self.issue.pk)
            self.assertEqual(result.status_code, 200, result.data)
        ProjectMember.objects.filter(project=self.project, member=self.member).update(is_active=False)
        result = self.request(IzclickIssueCommercialAPI, self.admin, data={"member_id": str(self.member.pk)}, issue_id=self.issue.pk)
        self.assertEqual(result.status_code, 400)

    def test_assignment_custom_field_and_atomic_rejection(self):
        posted = self.request(IzclickProjectCustomFieldsAPI, self.admin, method="post", data={"name": "Supervisor", "type": "member"})
        self.assertEqual(posted.status_code, 201, posted.data)
        field_id = posted.data["id"]
        result = self.request(IzclickIssueCustomFieldValuesAPI, self.member, data={"values": {field_id: str(self.member.pk)}}, issue_id=self.issue.pk)
        self.assertEqual(result.status_code, 200, result.data)
        result = self.request(IzclickIssueCustomFieldValuesAPI, self.member, data={"values": {field_id: str(self.outsider.pk)}}, issue_id=self.issue.pk)
        self.assertEqual(result.status_code, 400)
        self.assertEqual(IzclickCustomFieldValue.objects.get(field_id=field_id).value, str(self.member.pk))

    def test_retirement_preserves_tasks_children_and_records_activity(self):
        self.source.default = True
        self.source.save()
        with patch("plane.bgtasks.deletion_task.soft_delete_related_objects.delay") as cascade:
            result = self.request(IzclickProjectStateRetirementAPI, self.admin, method="post", data={"replacement_id": str(self.target.pk)}, state_id=self.source.pk)
            self.assertEqual(result.status_code, 200, result.data)
            cascade.assert_not_called()
        self.assertEqual(result.data["moved"], 2)
        self.issue.refresh_from_db(); self.child.refresh_from_db(); self.target.refresh_from_db()
        self.assertEqual(self.issue.state_id, self.target.pk)
        self.assertEqual(self.child.parent_id, self.issue.pk)
        self.assertEqual(self.child.state_id, self.target.pk)
        self.assertIsNotNone(self.issue.completed_at)
        self.assertTrue(self.target.default)
        self.assertFalse(State.objects.filter(pk=self.source.pk).exists())
        self.assertEqual(IssueActivity.objects.filter(old_identifier=self.source.pk, new_identifier=self.target.pk).count(), 2)

    def test_invalid_or_unauthorized_retirement_changes_nothing(self):
        for actor, replacement, expected in [(self.member, str(self.target.pk), 403), (self.admin, str(self.source.pk), 400), (self.admin, "bad", 400)]:
            result = self.request(IzclickProjectStateRetirementAPI, actor, method="post", data={"replacement_id": replacement}, state_id=self.source.pk)
            self.assertEqual(result.status_code, expected)
        self.issue.refresh_from_db()
        self.assertEqual(self.issue.state_id, self.source.pk)
        self.assertTrue(State.objects.filter(pk=self.source.pk).exists())

    def test_catalogue_retirement_transfers_bindings_atomically(self):
        from plane.db.models import WorkspaceMember, IzClickProductionStatus, IzClickProductionStatusBinding
        from plane.app.views.workspace.izclick_production_status import WorkspaceProductionStatusDetailEndpoint
        WorkspaceMember.objects.create(workspace=self.workspace, member=self.admin, role=20, is_active=True)
        source = IzClickProductionStatus.objects.create(workspace=self.workspace, name="General anterior", group="started")
        target = IzClickProductionStatus.objects.create(workspace=self.workspace, name="General final", group="completed")
        IzClickProductionStatusBinding.objects.create(status=source, project=self.project, plane_state=self.source)
        IzClickProductionStatusBinding.objects.create(status=target, project=self.project, plane_state=self.target)
        request = APIRequestFactory().delete(f"/api/status/?replacement_id={target.pk}")
        force_authenticate(request, user=self.admin)
        result = WorkspaceProductionStatusDetailEndpoint.as_view()(request, slug=self.workspace.slug, status_id=source.pk)
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data["moved"], 2)
        self.assertFalse(IzClickProductionStatus.objects.filter(pk=source.pk).exists())
        self.issue.refresh_from_db()
        self.assertEqual(self.issue.state_id, self.target.pk)
        self.assertTrue(IzClickProductionStatus.objects.filter(pk=target.pk).exists())

    def test_incomplete_catalogue_destination_rejects_entire_change(self):
        from plane.db.models import WorkspaceMember, IzClickProductionStatus, IzClickProductionStatusBinding
        from plane.app.views.workspace.izclick_production_status import WorkspaceProductionStatusDetailEndpoint
        WorkspaceMember.objects.create(workspace=self.workspace, member=self.admin, role=20, is_active=True)
        source = IzClickProductionStatus.objects.create(workspace=self.workspace, name="General anterior", group="started")
        target = IzClickProductionStatus.objects.create(workspace=self.workspace, name="Sin vinculos", group="completed")
        IzClickProductionStatusBinding.objects.create(status=source, project=self.project, plane_state=self.source)
        request = APIRequestFactory().delete(f"/api/status/?replacement_id={target.pk}")
        force_authenticate(request, user=self.admin)
        result = WorkspaceProductionStatusDetailEndpoint.as_view()(request, slug=self.workspace.slug, status_id=source.pk)
        self.assertEqual(result.status_code, 409, result.data)
        self.issue.refresh_from_db()
        self.assertEqual(self.issue.state_id, self.source.pk)
        self.assertTrue(State.objects.filter(pk=self.source.pk).exists())


    def test_restricted_guest_sees_no_other_task_commercial_assignments(self):
        self.project.guest_view_all_features = False
        self.project.save()
        self.request(IzclickIssueCommercialAPI, self.member, data={"member_id": str(self.admin.pk)}, issue_id=self.issue.pk)
        mapping = self.request(IzclickCommercialAssignmentsAPI, self.reader, method="get")
        self.assertEqual(mapping.status_code, 200)
        self.assertEqual(mapping.data, {})
