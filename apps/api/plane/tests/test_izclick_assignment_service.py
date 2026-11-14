"""Assignment service validation tests (no database writes)."""
from types import SimpleNamespace
from unittest.mock import patch, MagicMock

from django.test import SimpleTestCase
from rest_framework.exceptions import PermissionDenied, ValidationError

from plane.utils.izclick_assignment import assign_producer


class AssignmentServiceTests(SimpleTestCase):
    def setUp(self):
        class ProjectStub:
            objects = MagicMock()
        self.project = ProjectStub()
        self.project.pk = "project"
        self.project.workspace_id = "workspace"
        self.project.workspace = SimpleNamespace(slug="izango")
        self.actor = SimpleNamespace(pk="coordinator", is_superuser=False)
        self.producer = SimpleNamespace(pk="producer")

    def test_non_coordinator_rejected_before_assignment(self):
        with patch("plane.utils.izclick_assignment.IzclickWorkspaceRole.objects.filter") as roles, patch(
            "plane.utils.izclick_assignment.IzclickProjectCoordination.objects.get_or_create"
        ) as coordination:
            roles.return_value.exists.return_value = False
            with self.assertRaises(PermissionDenied):
                assign_producer(project=self.project, actor=self.actor, producer=self.producer)
            coordination.assert_not_called()

    def test_expected_assignment_mismatch_is_rejected(self):
        row = SimpleNamespace(producer_id="already-assigned")
        with patch("plane.utils.izclick_assignment.IzclickWorkspaceRole.objects.filter") as roles, patch(
            "plane.utils.izclick_assignment.WorkspaceMember.objects.filter"
        ) as members, patch(
            "plane.utils.izclick_assignment.IzclickProjectCoordination.objects.get_or_create",
            return_value=(row, False),
        ):
            roles.return_value.exists.return_value = True
            members.return_value.exists.return_value = True
            with self.assertRaises(ValidationError):
                assign_producer(
                    project=self.project, actor=self.actor,
                    producer=self.producer, expected_producer_id=None,
                )
