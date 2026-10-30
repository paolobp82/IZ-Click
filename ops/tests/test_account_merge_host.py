"""Host-side safeguards; no production access or Django dependency."""
import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("account_merge_host", Path(__file__).parents[1] / "izclick-merge-angelica.py")
merge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(merge)


class AccountMergeHostTests(unittest.TestCase):
    def exercise(self, *, apply=True, backup_valid=True, changed=False, preflight_stopped=False,
                 lose_result=False, fail_journal=False):
        calls, reports = [], []
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            def cmd(argv, **kwargs):
                calls.append(tuple(argv))
                if "inspect" in argv:
                    number = sum("inspect" in call for call in calls)
                    return json.dumps([{"Id": "new-api" if changed and number > 1 else "same-api",
                                        "State": {"Running": True}}]).encode()
                if "pg_dump" in " ".join(argv):
                    kwargs["output"].write(b"fictional valid dump")
                    return b""
                raise AssertionError(argv)
            def execute(container, apply=False, expected_plan=None):
                calls.append(("core", apply, expected_plan))
                if apply:
                    if lose_result: raise merge.MergeStopped("Transport interrupted")
                    return {"check": "accounts_merged", "login": merge.TARGET, "disabled_login": merge.SOURCE}
                return {"check": "merge_stopped"} if preflight_stopped else {"check": "merge_preflight", "plan": {"reviewed": True}}
            private_json = merge.private_json
            def journal(path, data):
                if fail_journal and path.name == "result.json": raise OSError("fixture-only disk error")
                private_json(path, data)
            with patch.object(merge, "ROOT", root), patch.object(merge.os, "geteuid", return_value=0), \
                 patch.object(merge, "command", side_effect=cmd), patch.object(merge, "execute", side_effect=execute), \
                 patch.object(merge, "private_json", side_effect=journal), \
                 patch.object(merge.subprocess, "run", return_value=SimpleNamespace(returncode=0 if backup_valid else 1, stdout=b"TABLE DATA")), \
                 patch.object(merge, "report", side_effect=lambda check, **data: reports.append((check, data))), \
                 patch("sys.argv", ["merge"] + (["--apply"] if apply else [])):
                status = merge.main()
            files = list(root.glob("angelica-merge-backup-*/*"))
            modes = [path.stat().st_mode & 0o777 for path in files]
        return status, calls, reports, modes

    def test_default_never_backs_up_or_applies(self):
        status, calls, reports, modes = self.exercise(apply=False)
        self.assertEqual(status, 0)
        self.assertFalse(any(call[0] == "core" and call[1] for call in calls))
        self.assertFalse(any("pg_dump" in " ".join(map(str, call)) for call in calls))
        self.assertEqual(modes, [])

    def test_invalid_backup_prevents_apply(self):
        status, calls, reports, modes = self.exercise(backup_valid=False)
        self.assertEqual(status, 1)
        self.assertFalse(any(call[0] == "core" and call[1] for call in calls))
        self.assertEqual(reports[-1][0], "merge_stopped")

    def test_container_change_prevents_apply(self):
        status, calls, reports, modes = self.exercise(changed=True)
        self.assertEqual(status, 1)
        self.assertFalse(any(call[0] == "core" and call[1] for call in calls))

    def test_failed_preflight_prevents_backup_and_apply(self):
        status, calls, reports, modes = self.exercise(preflight_stopped=True)
        self.assertEqual(status, 1)
        self.assertEqual(modes, [])
        self.assertEqual(len([call for call in calls if call[0] == "core"]), 1)

    def test_success_requires_reviewed_plan_and_private_backup(self):
        status, calls, reports, modes = self.exercise()
        self.assertEqual(status, 0)
        self.assertIn(("core", True, {"reviewed": True}), calls)
        self.assertEqual(reports[-1][0], "accounts_merged")
        self.assertTrue(modes)
        self.assertTrue(all(mode == 0o600 for mode in modes))

    def test_interrupted_apply_is_unknown_not_claimed_rolled_back(self):
        status, calls, reports, modes = self.exercise(lose_result=True)
        self.assertEqual(status, 1)
        self.assertEqual(reports[-1][0], "merge_status_unknown")

    def test_reporting_failure_does_not_misreport_committed_merge_as_rollback(self):
        status, calls, reports, modes = self.exercise(fail_journal=True)
        self.assertEqual(status, 0)
        self.assertEqual(reports[-1][0], "accounts_merged")
        self.assertFalse(reports[-1][1]["audit_saved"])
