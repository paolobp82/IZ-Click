"""Assignment event integration regression tests."""
from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase

from plane.utils.izclick_role_policy import event_recipients


class ReassignmentRecipientsTests(SimpleTestCase):
    def test_reassignment_includes_previous_and_new_producers(self):
        recipients = event_recipients(
            "producer_reassigned",
            previous_producer_id="previous",
            producer_id="new",
            commercial_id="commercial",
            actor_id="coordinator",
        )
        self.assertEqual(recipients, ["previous", "new", "commercial"])

    def test_actor_excluded_and_duplicates_removed(self):
        recipients = event_recipients(
            "producer_reassigned",
            previous_producer_id="producer",
            producer_id="producer",
            commercial_id="coordinator",
            actor_id="coordinator",
        )
        self.assertEqual(recipients, ["producer"])

    def test_new_project_reaches_both_coordinators(self):
        recipients = event_recipients(
            "project_created",
            coordinator_ids=("a", "b"),
            actor_id="commercial",
        )
        self.assertEqual(recipients, ["a", "b"])
