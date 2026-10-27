"""Assignment permissions and safe workflow retirement against isolated Postgres."""
from unittest.mock import patch
from django.test import TestCase, override_settings
from django.urls import resolve
from rest_framework.test import APIRequestFactory, force_authenticate
from plane.db.models import (User, Workspace, Project, ProjectMember, Issue, State,
                             IzclickCustomField, IzclickCustomFieldValue, IssueActivity)
from plane.api.views.izclick_custom_fields import (IzclickIssueCommercialAPI, IzclickCommercialAssignmentsAPI,
                                                  IzclickProjectCustomFieldsAPI, IzclickIssueCustomFieldValuesAPI)
from plane.api.views.izclick_state_retirement import IzclickProjectStateRetirementAPI


@override_settings(CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}})
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
        root = f"/api/workspaces/{self.workspace.slug}/projects/{self.project.pk}"
        paths = {
            IzclickIssueCommercialAPI: f"{root}/issues/{kwargs.get('issue_id')}/production-commercial/",
            IzclickCommercialAssignmentsAPI: f"{root}/production-commercial/",
            IzclickProjectCustomFieldsAPI: f"{root}/izclick-custom-fields/",
            IzclickIssueCustomFieldValuesAPI: f"{root}/issues/{kwargs.get('issue_id')}/izclick-custom-field-values/",
            IzclickProjectStateRetirementAPI: f"{root}/production-states/{kwargs.get('state_id')}/retire/",
        }
        request = getattr(APIRequestFactory(), method)(paths[view], data=data or {}, format="json")
        request.resolver_match = resolve(paths[view])
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
        url = f"/api/workspaces/{self.workspace.slug}/izclick-production-statuses/{source.pk}/"
        request = APIRequestFactory().delete(f"{url}?replacement_id={target.pk}")
        request.resolver_match = resolve(url)
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
        url = f"/api/workspaces/{self.workspace.slug}/izclick-production-statuses/{source.pk}/"
        request = APIRequestFactory().delete(f"{url}?replacement_id={target.pk}")
        request.resolver_match = resolve(url)
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

    def workspace_status_request(self, method, actor=None, status_id=None, data=None, replacement_id=None):
        from plane.db.models import WorkspaceMember
        from plane.app.views.workspace.izclick_production_status import (
            WorkspaceProductionStatusesEndpoint, WorkspaceProductionStatusDetailEndpoint,
        )
        for user, role in [(self.admin, 20), (self.member, 15)]:
            WorkspaceMember.objects.get_or_create(workspace=self.workspace, member=user,
                                                  defaults={"role": role, "is_active": True})
        url = f"/api/workspaces/{self.workspace.slug}/izclick-production-statuses/"
        view, kwargs = WorkspaceProductionStatusesEndpoint, {}
        if status_id:
            url += f"{status_id}/"
            view, kwargs = WorkspaceProductionStatusDetailEndpoint, {"status_id": status_id}
        path = f"{url}?replacement_id={replacement_id}" if replacement_id else url
        request = getattr(APIRequestFactory(), method)(path, data=data or {}, format="json")
        request.resolver_match = resolve(url)
        if actor:
            force_authenticate(request, user=actor)
        return view.as_view()(request, slug=self.workspace.slug, **kwargs)

    def second_native_project(self):
        project = Project.objects.create(name="Second", identifier="SND", workspace=self.workspace)
        source = State.objects.create(project=project, workspace=self.workspace,
                                      name=self.source.name, group=self.source.group, color="#112233", default=True)
        target = State.objects.create(project=project, workspace=self.workspace,
                                      name=self.target.name, group=self.target.group, color="#445566")
        issue = Issue.objects.create(project=project, workspace=self.workspace, name="Second task", state=source)
        return project, source, target, issue

    def test_unified_list_includes_plane_defaults_and_catalogue_without_read_writes(self):
        from plane.db.models import IzClickProductionStatus, IzClickProductionStatusBinding
        _, second_source, _, _ = self.second_native_project()
        catalogue = IzClickProductionStatus.objects.create(workspace=self.workspace, name="General final", group="completed")
        IzClickProductionStatusBinding.objects.create(status=catalogue, project=self.project, plane_state=self.target)
        counts = (State.all_state_objects.count(), IzClickProductionStatus.objects.count())
        result = self.workspace_status_request("get", self.admin)
        self.assertEqual(result.status_code, 200, result.data)
        native = [row for row in result.data if row["name"] == self.source.name and row["origin"] == "plane"]
        self.assertEqual(len(native), 1)
        self.assertEqual(native[0]["project_count"], 2)
        self.assertIn(str(second_source.pk), [str(row.pk) for row in State.objects.filter(name=self.source.name)])
        self.assertEqual(len([row for row in result.data if row["id"] == str(catalogue.pk)]), 1)
        self.assertFalse(any(row["id"] == str(self.target.pk) for row in result.data))
        self.assertEqual(counts, (State.all_state_objects.count(), IzClickProductionStatus.objects.count()))

    def test_edit_native_default_updates_all_matching_projects_preserving_task_identity(self):
        _, second_source, _, second_issue = self.second_native_project()
        self.source.default = True; self.source.save()
        result = self.workspace_status_request("patch", self.admin, self.source.pk,
                                               {"name": "Recibido", "color": "#abcdef"})
        self.assertEqual(result.status_code, 200, result.data)
        for state in [self.source, second_source]:
            state.refresh_from_db()
            self.assertEqual((state.name, state.color, state.group, state.default), ("Recibido", "#abcdef", "started", True))
        self.issue.refresh_from_db(); second_issue.refresh_from_db(); self.child.refresh_from_db()
        self.assertEqual(self.issue.state_id, self.source.pk)
        self.assertEqual(second_issue.state_id, second_source.pk)
        self.assertEqual(self.child.parent_id, self.issue.pk)

    def test_native_rename_conflict_in_one_project_changes_nothing(self):
        project, second_source, _, _ = self.second_native_project()
        State.objects.create(project=project, workspace=self.workspace, name="Taken", group="started", color="#123456")
        result = self.workspace_status_request("patch", self.admin, self.source.pk, {"name": "Taken"})
        self.assertEqual(result.status_code, 409, result.data)
        self.source.refresh_from_db(); second_source.refresh_from_db()
        self.assertEqual(self.source.name, "Antes")
        self.assertEqual(second_source.name, "Antes")

    def test_delete_plane_default_moves_tasks_and_subtasks_without_cascade(self):
        _, second_source, second_target, second_issue = self.second_native_project()
        self.source.default = True; self.source.save()
        with patch("plane.bgtasks.deletion_task.soft_delete_related_objects.delay") as cascade:
            result = self.workspace_status_request("delete", self.admin, self.source.pk, replacement_id=self.target.pk)
            self.assertEqual(result.status_code, 200, result.data)
            cascade.assert_not_called()
        self.assertEqual(result.data["moved"], 3)
        self.issue.refresh_from_db(); self.child.refresh_from_db(); second_issue.refresh_from_db()
        self.target.refresh_from_db(); second_target.refresh_from_db()
        self.assertEqual(self.issue.state_id, self.target.pk)
        self.assertEqual(self.child.state_id, self.target.pk)
        self.assertEqual(self.child.parent_id, self.issue.pk)
        self.assertEqual(second_issue.state_id, second_target.pk)
        self.assertTrue(self.target.default and second_target.default)
        self.assertFalse(State.objects.filter(pk__in=[self.source.pk, second_source.pk]).exists())
        self.assertEqual(IssueActivity.objects.filter(field="state").count(), 3)

    def test_native_state_can_retire_into_catalogue_destination(self):
        from plane.db.models import IzClickProductionStatus, IzClickProductionStatusBinding
        target = IzClickProductionStatus.objects.create(workspace=self.workspace, name="General final", group="completed")
        IzClickProductionStatusBinding.objects.create(status=target, project=self.project, plane_state=self.target)
        result = self.workspace_status_request("delete", self.admin, self.source.pk, replacement_id=target.pk)
        self.assertEqual(result.status_code, 200, result.data)
        self.issue.refresh_from_db()
        self.assertEqual(self.issue.state_id, self.target.pk)
        self.assertTrue(IzClickProductionStatus.objects.filter(pk=target.pk).exists())

    def test_catalogue_state_can_retire_into_native_destination(self):
        from plane.db.models import IzClickProductionStatus, IzClickProductionStatusBinding
        source = IzClickProductionStatus.objects.create(workspace=self.workspace, name="General old", group="started")
        IzClickProductionStatusBinding.objects.create(status=source, project=self.project, plane_state=self.source)
        result = self.workspace_status_request("delete", self.admin, source.pk, replacement_id=self.target.pk)
        self.assertEqual(result.status_code, 200, result.data)
        self.issue.refresh_from_db()
        self.assertEqual(self.issue.state_id, self.target.pk)
        self.assertFalse(IzClickProductionStatus.objects.filter(pk=source.pk).exists())

    def test_native_retirement_rejects_incomplete_destination_atomically(self):
        _, second_source, second_target, second_issue = self.second_native_project()
        second_target.name = "Another destination"; second_target.save()
        result = self.workspace_status_request("delete", self.admin, self.source.pk, replacement_id=self.target.pk)
        self.assertEqual(result.status_code, 409, result.data)
        self.issue.refresh_from_db(); second_issue.refresh_from_db()
        self.assertEqual(self.issue.state_id, self.source.pk)
        self.assertEqual(second_issue.state_id, second_source.pk)
        self.assertTrue(State.objects.filter(pk=self.source.pk).exists())
        self.assertEqual(IssueActivity.objects.count(), 0)

    def test_native_management_rejects_members_outsiders_and_cross_workspace_ids(self):
        for actor in [self.member, self.outsider, None]:
            response = self.workspace_status_request("patch", actor, self.source.pk, {"name": "Forbidden"})
            self.assertIn(response.status_code, (401, 403), response.data)
            response = self.workspace_status_request("delete", actor, self.source.pk, replacement_id=self.target.pk)
            self.assertIn(response.status_code, (401, 403), response.data)
        other = Workspace.objects.create(name="Other", slug="other-status-qa", owner=self.admin)
        project = Project.objects.create(name="Other", identifier="OTH", workspace=other)
        native = State.objects.create(project=project, workspace=other, name="Antes", group="started", color="#112233")
        response = self.workspace_status_request("patch", self.admin, native.pk, {"name": "Forbidden"})
        self.assertEqual(response.status_code, 404, response.data)
        response = self.workspace_status_request("delete", self.admin, self.source.pk, replacement_id=native.pk)
        self.assertEqual(response.status_code, 400, response.data)
        self.source.refresh_from_db(); native.refresh_from_db()
        self.assertEqual(self.source.name, "Antes")
        self.assertEqual(native.name, "Antes")

    def test_native_homonym_in_other_project_still_allows_editing(self):
        from plane.db.models import IzClickProductionStatus, IzClickProductionStatusBinding
        _, second_source, _, _ = self.second_native_project()
        catalogue = IzClickProductionStatus.objects.create(workspace=self.workspace, name=self.source.name, group="started")
        IzClickProductionStatusBinding.objects.create(status=catalogue, project=second_source.project, plane_state=second_source)
        result = self.workspace_status_request("patch", self.admin, self.source.pk, {"color": "#abcdef"})
        self.assertEqual(result.status_code, 200, result.data)
        self.source.refresh_from_db(); second_source.refresh_from_db()
        self.assertEqual(self.source.color, "#abcdef")
        self.assertEqual(second_source.color, "#112233")

    def test_native_retirement_cannot_use_same_group_from_another_project_as_destination(self):
        _, second_source, _, _ = self.second_native_project()
        result = self.workspace_status_request("delete", self.admin, self.source.pk, replacement_id=second_source.pk)
        self.assertEqual(result.status_code, 400, result.data)
        self.issue.refresh_from_db()
        self.assertEqual(self.issue.state_id, self.source.pk)
        self.assertEqual(IssueActivity.objects.count(), 0)
