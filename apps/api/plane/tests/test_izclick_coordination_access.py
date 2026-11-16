# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Authorization regression tests for the IZ-Click coordination API."""
from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings
from rest_framework.exceptions import NotFound, PermissionDenied

from plane.api.views.izclick_coordination import _require_coordination_access


class CoordinationAccessTests(SimpleTestCase):
    def setUp(self):
        self.workspace = SimpleNamespace(pk="workspace-id")
        self.request = SimpleNamespace(
            user=SimpleNamespace(pk="user-id", is_superuser=False)
        )

    @override_settings(IZCLICK_COORDINATION_ENABLED=False)
    def test_disabled_feature_does_not_query_workspace_tables(self):
        with patch("plane.api.views.izclick_coordination._workspace_member") as member:
            with self.assertRaises(NotFound):
                _require_coordination_access(self.request, self.workspace)
            member.assert_not_called()

    @override_settings(IZCLICK_COORDINATION_ENABLED=True)
    def test_non_coordinator_cannot_read_queue(self):
        with patch("plane.api.views.izclick_coordination._workspace_member"), patch(
            "plane.api.views.izclick_coordination.IzclickWorkspaceRole.objects.filter"
        ) as roles:
            roles.return_value.exists.return_value = False
            with self.assertRaises(PermissionDenied):
                _require_coordination_access(self.request, self.workspace)

    @override_settings(IZCLICK_COORDINATION_ENABLED=True)
    def test_coordinator_can_access(self):
        with patch("plane.api.views.izclick_coordination._workspace_member"), patch(
            "plane.api.views.izclick_coordination.IzclickWorkspaceRole.objects.filter"
        ) as roles:
            roles.return_value.exists.return_value = True
            _require_coordination_access(self.request, self.workspace)

    @override_settings(IZCLICK_COORDINATION_ENABLED=True)
    def test_superuser_can_access_after_workspace_membership_check(self):
        self.request.user.is_superuser = True
        with patch("plane.api.views.izclick_coordination._workspace_member") as member:
            _require_coordination_access(self.request, self.workspace)
            member.assert_called_once()
