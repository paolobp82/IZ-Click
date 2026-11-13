"""Unit tests for producer workload summaries."""
import unittest
from datetime import date
from plane.utils.izclick_workload import summarize_producer_workload


class WorkloadTests(unittest.TestCase):
    def test_active_overdue_upcoming_and_unassigned(self):
        rows = [
            {"project_id": "a", "producer_id": "p1", "name": "A",
             "status": "in_progress", "due_date": "2026-11-12"},
            {"project_id": "b", "producer_id": "p1", "name": "B",
             "status": "in_progress", "due_date": "2026-11-16"},
            {"project_id": "c", "producer_id": "p1", "name": "C",
             "status": "done", "due_date": "2026-11-17"},
            {"project_id": "d", "producer_id": None, "name": "D",
             "status": "in_progress", "due_date": "2026-11-18"},
        ]
        result = summarize_producer_workload(
            rows, ["p1", "p2"], today=date(2026, 11, 13),
            closed_statuses={"done"},
        )
        self.assertEqual(result[0]["active_count"], 2)
        self.assertEqual(result[0]["overdue_count"], 1)
        self.assertEqual(result[0]["due_soon_count"], 1)
        self.assertEqual([p["project_id"] for p in result[0]["projects"]], ["a", "b"])
        self.assertEqual(result[1]["active_count"], 0)

    def test_missing_due_date(self):
        result = summarize_producer_workload(
            [{"project_id": "a", "producer_id": "p", "due_date": None}],
            ["p"], today=date(2026, 11, 13),
        )
        self.assertEqual(result[0]["due_soon_count"], 0)
        self.assertFalse(result[0]["projects"][0]["overdue"])


if __name__ == "__main__":
    unittest.main()
