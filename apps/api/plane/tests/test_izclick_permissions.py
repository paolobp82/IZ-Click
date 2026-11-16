from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission


class BusinessPermissionBoundaryTests(SimpleTestCase):
    def call(self, level, roles, method="GET", business="commercial"):
        @allow_permission(roles, level=level)
        def endpoint(instance, request, **kwargs):
            return Response({"allowed": True})

        request = SimpleNamespace(user=SimpleNamespace(), method=method)
        with (
            patch("plane.utils.izclick_access.business_role", return_value=business),
            patch("plane.app.permissions.base.WorkspaceMember.objects.filter") as members,
        ):
            members.return_value.exists.return_value = False
            return endpoint(None, request, slug="agency", project_id="project")

    def test_business_role_does_not_grant_workspace_administration(self):
        self.assertEqual(self.call("WORKSPACE", [ROLE.ADMIN]).status_code, 403)

    def test_coordinator_does_not_grant_workspace_administration(self):
        self.assertEqual(self.call("WORKSPACE", [ROLE.ADMIN], business="coordinator").status_code, 403)

    def test_business_role_can_read_project_content(self):
        self.assertEqual(self.call("PROJECT", [ROLE.MEMBER, ROLE.GUEST]).status_code, 200)
