"""Contract tests for workspace-wide status validation without Django/DB."""
import importlib.util
from pathlib import Path
import unittest

MODULE_PATH = Path(__file__).resolve().parents[1] / "plane" / "utils" / "izclick_workflow.py"
spec = importlib.util.spec_from_file_location("izclick_workflow", MODULE_PATH)
assert spec and spec.loader
workflow = importlib.util.module_from_spec(spec)
spec.loader.exec_module(workflow)


class IzClickWorkspaceStatusContracts(unittest.TestCase):
    def test_valid_workspace_status_is_normalized(self):
        fields, error = workflow.validate_status_fields({
            "name": "  ENVIADO A CLIENTE  ", "color": "#AABBCC",
            "group": "started", "sequence": 250,
        })
        self.assertIsNone(error)
        self.assertEqual(fields, {
            "name": "ENVIADO A CLIENTE", "color": "#aabbcc",
            "group": "started", "sequence": 250,
        })

    def test_reject_invalid_colors_and_groups(self):
        for color in ("red", "#fff", "#00000000", "#nothex", 1234):
            fields, error = workflow.validate_status_fields({"name": "Aprobado", "color": color})
            self.assertIsNone(fields)
            self.assertIsNotNone(error)
        for group in ("published", "TRIAGE", "invalid", None):
            fields, error = workflow.validate_status_fields({"name": "Aprobado", "group": group})
            self.assertIsNone(fields)
            self.assertIsNotNone(error)

    def test_reject_invalid_names_or_sequences(self):
        for name in ("", " ", 12, "A" * 121, None):
            fields, _error = workflow.validate_status_fields({"name": name})
            self.assertIsNone(fields)
        for sequence in (-1, 1000001, True, "10", None):
            fields, _error = workflow.validate_status_fields({"name": "Revisión", "sequence": sequence})
            self.assertIsNone(fields)

    def test_patch_only_valid_fields(self):
        self.assertEqual(workflow.validate_status_fields({"color": "#123ABC"}, partial=True)[0], {"color": "#123abc"})
        self.assertIsNotNone(workflow.validate_status_fields({}, partial=True)[1])
        self.assertIsNotNone(workflow.validate_status_fields(None, partial=True)[1])


if __name__ == "__main__":
    unittest.main()
