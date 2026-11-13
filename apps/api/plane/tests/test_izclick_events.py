"""Unit tests for event dispatch without touching the database."""
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from plane.utils.izclick_events import dispatch_project_event


class IzclickEventDispatchTests(unittest.TestCase):
    def setUp(self):
        self.project = SimpleNamespace(pk="project-1")
        self.actor = SimpleNamespace(pk="commercial-1")

    @patch("plane.utils.izclick_events.publish_project_notifications")
    def test_new_project_notifies_both_coordinators(self, publish):
        publish.return_value = ["created"]
        result = dispatch_project_event(
            project=self.project, actor=self.actor,
            event_id="e707f313-9e55-45ae-99b9-f1e887079a00",
            event="project_created", project_url="/workspace/projects/p",
            coordinator_ids=["coord-1", "coord-2", "coord-1"],
        )
        self.assertEqual(result, ["created"])
        self.assertEqual(publish.call_args.kwargs["recipients"], ["coord-1", "coord-2"])
        self.assertEqual(publish.call_args.kwargs["event_name"], "izclick.project_created")

    @patch("plane.utils.izclick_events.publish_project_notifications")
    def test_actor_excluded_and_no_empty_delivery(self, publish):
        result = dispatch_project_event(
            project=self.project, actor=self.actor,
            event_id="e707f313-9e55-45ae-99b9-f1e887079a00",
            event="comment_created", project_url="/workspace/projects/p",
            participant_ids=["commercial-1"],
        )
        self.assertEqual(result, [])
        publish.assert_not_called()

    @patch("plane.utils.izclick_events.publish_project_notifications")
    def test_assignment_reaches_producer_and_commercial(self, publish):
        dispatch_project_event(
            project=self.project, actor=SimpleNamespace(pk="coord-1"),
            event_id="e707f313-9e55-45ae-99b9-f1e887079a00",
            event="producer_assigned", project_url="/workspace/projects/p",
            producer_id="producer-1", commercial_id="commercial-1",
        )
        self.assertEqual(publish.call_args.kwargs["recipients"],
                         ["producer-1", "commercial-1"])

    @patch("plane.utils.izclick_events.publish_project_notifications")
    def test_unsupported_event_fails_closed(self, publish):
        with self.assertRaises(ValueError):
            dispatch_project_event(
                project=self.project, actor=self.actor,
                event_id="e707f313-9e55-45ae-99b9-f1e887079a00",
                event="unknown", project_url="/workspace/projects/p",
            )
        publish.assert_not_called()


if __name__ == "__main__":
    unittest.main()
