from pathlib import Path
import ast
import unittest

ROOT = Path(__file__).resolve().parents[4]
SOURCE = ROOT / "plane" / "bgtasks" / "email_notification_task.py"
TEMPLATE = ROOT / "templates" / "emails" / "notifications" / "izclick-event.html"


class IzclickEmailPipelineTests(unittest.TestCase):
    def test_email_tasks_parse(self):
        ast.parse(SOURCE.read_text(encoding="utf-8"))

    def test_sent_marked_only_after_smtp_confirmation(self):
        code = SOURCE.read_text(encoding="utf-8")
        self.assertIn("delivered = msg.send()", code)
        self.assertIn("if delivered != 1:", code)
        self.assertLess(code.index("delivered = msg.send()"), code.index("sent_at=timezone.now(), processed_at=timezone.now()"))

    def test_batches_are_per_issue(self):
        code = SOURCE.read_text(encoding="utf-8")
        self.assertIn('bucket = by_issue.setdefault(issue_id, {"actors": {}, "ids": []})', code)
        self.assertIn('email_notification_ids=bucket["ids"]', code)

    def test_template_has_required_task_action(self):
        content = TEMPLATE.read_text(encoding="utf-8")
        for field in ("{{ title }}", "{{ task_url }}", "{{ project_name }}", "{{ preferences_url }}"):
            self.assertIn(field, content)
        self.assertIn("IZ-Click", content)


if __name__ == "__main__":
    unittest.main()
