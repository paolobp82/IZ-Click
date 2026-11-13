"""Isolated policy tests; no database or live mail service required."""
import unittest

from plane.utils.izclick_role_policy import (
    BusinessRole,
    can_assign_producer,
    can_create_project,
    can_edit_project,
    can_view_agency_projects,
    coordination_recipients,
    event_recipients,
)


class IzclickRolePolicyTests(unittest.TestCase):
    def test_creation(self):
        self.assertTrue(can_create_project(BusinessRole.COMMERCIAL))
        self.assertTrue(can_create_project(BusinessRole.COORDINATOR))
        self.assertFalse(can_create_project(BusinessRole.PRODUCER))
        self.assertTrue(can_create_project(BusinessRole.PRODUCER, superadmin=True))

    def test_assignment(self):
        self.assertFalse(can_assign_producer(BusinessRole.COMMERCIAL))
        self.assertFalse(can_assign_producer(BusinessRole.PRODUCER))
        self.assertTrue(can_assign_producer(BusinessRole.COORDINATOR))
        self.assertTrue(can_assign_producer(BusinessRole.PRODUCER, superadmin=True))

    def test_visibility_and_editing(self):
        for role in BusinessRole:
            self.assertTrue(can_view_agency_projects(role))
        self.assertFalse(can_edit_project(BusinessRole.PRODUCER, is_assigned_producer=False))
        self.assertTrue(can_edit_project(BusinessRole.PRODUCER, is_assigned_producer=True))
        self.assertFalse(can_edit_project(BusinessRole.COMMERCIAL, is_assigned_producer=True))

    def test_shared_queue(self):
        self.assertEqual(coordination_recipients(["maria", "angelica", "maria"]),
                         ["maria", "angelica"])

    def test_notifications_exclude_actor_and_duplicates(self):
        self.assertEqual(
            event_recipients("project_created", coordinator_ids=["maria", "angelica"]),
            ["maria", "angelica"],
        )
        self.assertEqual(
            event_recipients("producer_assigned", producer_id="p", commercial_id="c"),
            ["p", "c"],
        )
        self.assertEqual(
            event_recipients("comment_created", participant_ids=["p", "c", "p"],
                             actor_id="p"),
            ["c"],
        )
        self.assertEqual(
            event_recipients("quotation_link_updated", coordinator_ids=["m", "a"],
                             commercial_id="c"),
            ["m", "a", "c"],
        )

    def test_unknown_event_fails_closed(self):
        with self.assertRaises(ValueError):
            event_recipients("unknown")


if __name__ == "__main__":
    unittest.main()
