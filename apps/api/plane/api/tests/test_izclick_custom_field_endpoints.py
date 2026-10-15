"""Session-authenticated custom-field CRUD and permissions, isolated PostgreSQL."""
import json
from django.test import TestCase
from django.urls import resolve
from rest_framework.test import APIRequestFactory, force_authenticate

from plane.api.views.izclick_custom_fields import (
    IzclickProjectCustomFieldsAPI,
    IzclickIssueCustomFieldValuesAPI,
    IzclickProjectCustomFieldBulkValuesAPI,
)
from plane.db.models import Issue, Project, ProjectMember, Workspace, User, IzclickCustomFieldValue


class IzclickCustomFieldEndpointTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create(
            username="izclick_endpoint_editor", email="endpoint-editor@example.invalid",
        )
        cls.outsider = User.objects.create(
            username="izclick_endpoint_outsider", email="endpoint-outsider@example.invalid",
        )
        cls.workspace = Workspace.objects.create(
            name="Endpoint Tests", slug="izclick-endpoint-test", owner=cls.user,
        )
        cls.project = Project.objects.create(
            name="Produccion", identifier="PRO", workspace=cls.workspace,
        )
        cls.issue = Issue.objects.create(
            name="Montaje de stand", project=cls.project,
            workspace=cls.workspace, sequence_id=1,
        )
        ProjectMember.objects.create(
            project=cls.project, workspace=cls.workspace,
            member=cls.user, role=20, is_active=True,
        )

    def request(self, view, method, url, actor, data=None):
        factory = APIRequestFactory()
        maker = getattr(factory, method.lower())
        request = maker(url, data=data, format="json") if data is not None else maker(url)
        force_authenticate(request, user=actor)
        return view.as_view()(request, slug=self.workspace.slug,
                              project_id=self.project.id,
                              **({"issue_id": self.issue.id} if view == IzclickIssueCustomFieldValuesAPI else {}))

    def test_session_routes_resolve_to_expected_views(self):
        project_root = f"/api/workspaces/{self.workspace.slug}/projects/{self.project.id}"
        self.assertEqual(
            resolve(f"{project_root}/izclick-custom-fields/").url_name,
            "izclick-custom-fields",
        )
        self.assertEqual(
            resolve(f"{project_root}/issues/{self.issue.id}/izclick-custom-field-values/").url_name,
            "izclick-issue-custom-field-values",
        )

    def test_owner_creates_edits_and_reads_persisted_value(self):
        root = f"/api/workspaces/{self.workspace.slug}/projects/{self.project.id}"
        posted = self.request(
            IzclickProjectCustomFieldsAPI, "post",
            f"{root}/izclick-custom-fields/", self.user,
            {"name": "Código interno", "type": "text", "options": []},
        )
        self.assertEqual(posted.status_code, 201, posted.data)
        field_id = posted.data["id"]
        changed = self.request(
            IzclickIssueCustomFieldValuesAPI, "patch",
            f"{root}/issues/{self.issue.id}/izclick-custom-field-values/",
            self.user, {"values": {field_id: "MON-042"}},
        )
        self.assertEqual(changed.status_code, 200, changed.data)
        self.assertEqual(changed.data[field_id], "MON-042")
        self.assertEqual(
            IzclickCustomFieldValue.objects.get(field_id=field_id, issue=self.issue).value,
            "MON-042",
        )
        read = self.request(
            IzclickIssueCustomFieldValuesAPI, "get",
            f"{root}/issues/{self.issue.id}/izclick-custom-field-values/", self.user,
        )
        self.assertEqual(read.status_code, 200)
        self.assertEqual(read.data[field_id], "MON-042")

    def test_nonmember_cannot_read_or_create_fields(self):
        root = f"/api/workspaces/{self.workspace.slug}/projects/{self.project.id}"
        posted = self.request(
            IzclickProjectCustomFieldsAPI, "post",
            f"{root}/izclick-custom-fields/", self.outsider,
            {"name": "Privado", "type": "text"},
        )
        self.assertEqual(posted.status_code, 403)
        read = self.request(
            IzclickProjectCustomFieldsAPI, "get",
            f"{root}/izclick-custom-fields/", self.outsider,
        )
        self.assertEqual(read.status_code, 403)

    def test_bulk_values_are_project_scoped_and_permission_checked(self):
        root = f"/api/workspaces/{self.workspace.slug}/projects/{self.project.id}"
        field_response = self.request(
            IzclickProjectCustomFieldsAPI, "post",
            f"{root}/izclick-custom-fields/", self.user,
            {"name": "Material", "type": "text"},
        )
        self.assertEqual(field_response.status_code, 201, field_response.data)
        field_id = field_response.data["id"]
        value_response = self.request(
            IzclickIssueCustomFieldValuesAPI, "patch",
            f"{root}/issues/{self.issue.id}/izclick-custom-field-values/",
            self.user, {"values": {field_id: "Acero"}},
        )
        self.assertEqual(value_response.status_code, 200, value_response.data)
        path = f"{root}/izclick-custom-field-values/batch/"
        self.assertEqual(resolve(path).url_name, "izclick-custom-values-batch")
        payload = {"issue_ids": [str(self.issue.id)]}
        result = self.request(
            IzclickProjectCustomFieldBulkValuesAPI, "post", path, self.user, payload,
        )
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data[str(self.issue.id)][field_id], "Acero")
        unauthorized = self.request(
            IzclickProjectCustomFieldBulkValuesAPI, "post", path, self.outsider, payload,
        )
        self.assertEqual(unauthorized.status_code, 403)

    def test_bulk_values_rejects_invalid_input(self):
        root = f"/api/workspaces/{self.workspace.slug}/projects/{self.project.id}"
        path = f"{root}/izclick-custom-field-values/batch/"
        for payload in ({"issue_ids": []}, {"issue_ids": ["bad-uuid"]},
                        {"issue_ids": ["x"] * 201}, {"issue_ids": "bad"}):
            response = self.request(
                IzclickProjectCustomFieldBulkValuesAPI, "post", path, self.user, payload,
            )
            self.assertEqual(response.status_code, 400, response.data)

    def test_real_session_login_can_create_edit_and_reload(self):
        """Exercise Django session auth rather than bypassing it with force_authenticate."""
        self.client.force_login(self.user)
        root = f"/api/workspaces/{self.workspace.slug}/projects/{self.project.id}"
        response = self.client.post(
            f"{root}/izclick-custom-fields/",
            data=json.dumps({"name": "Material en obra", "type": "text"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        field_id = response.json()["id"]
        value_url = f"{root}/issues/{self.issue.id}/izclick-custom-field-values/"
        updated = self.client.patch(
            value_url, data=json.dumps({"values": {field_id: "Aluminio"}}),
            content_type="application/json",
        )
        self.assertEqual(updated.status_code, 200, updated.content)
        self.assertEqual(self.client.get(value_url).json()[field_id], "Aluminio")

    def test_guest_can_read_but_not_change_values_or_schema(self):
        ProjectMember.objects.filter(project=self.project, member=self.user).update(role=5)
        root = f"/api/workspaces/{self.workspace.slug}/projects/{self.project.id}"
        self.client.force_login(self.user)
        self.assertEqual(self.client.get(f"{root}/izclick-custom-fields/").status_code, 200)
        cannot_add = self.client.post(
            f"{root}/izclick-custom-fields/",
            data=json.dumps({"name": "Privado", "type": "text"}),
            content_type="application/json",
        )
        self.assertEqual(cannot_add.status_code, 403)
        cannot_write = self.client.patch(
            f"{root}/issues/{self.issue.id}/izclick-custom-field-values/",
            data=json.dumps({"values": {}}), content_type="application/json",
        )
        self.assertEqual(cannot_write.status_code, 403)

    def test_valid_and_invalid_updates_are_atomic(self):
        root = f"/api/workspaces/{self.workspace.slug}/projects/{self.project.id}"
        first = self.request(
            IzclickProjectCustomFieldsAPI, "post", f"{root}/izclick-custom-fields/",
            self.user, {"name": "Proveedor", "type": "text"},
        )
        second = self.request(
            IzclickProjectCustomFieldsAPI, "post", f"{root}/izclick-custom-fields/",
            self.user, {"name": "Cantidad", "type": "number"},
        )
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(second.status_code, 201, second.data)
        result = self.request(
            IzclickIssueCustomFieldValuesAPI, "patch",
            f"{root}/issues/{self.issue.id}/izclick-custom-field-values/",
            self.user,
            {"values": {first.data["id"]: "Proveedor A", second.data["id"]: "incorrecto"}},
        )
        self.assertEqual(result.status_code, 400, result.data)
        self.assertFalse(
            IzclickCustomFieldValue.objects.filter(issue=self.issue).exists(),
            "Mixed-validity payload must not partially save any values",
        )
