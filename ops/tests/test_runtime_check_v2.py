"""Local tests for bounded diagnostic subprocesses; no production access."""
import ast
import contextlib
import io
import json
from pathlib import Path
import subprocess
import sys
import time
import unittest


class RuntimeCheckTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        script = Path(__file__).resolve().parents[1] / "izclick-runtime-check-v2.sh"
        cls.body = script.read_text().split("python - <<'PY'\n", 1)[1].split("\nPY\n", 1)[0]
        cls.tree = ast.parse(cls.body)

    def namespace(self):
        namespace = dict(json=json, subprocess=subprocess, sys=sys, time=time, active=[])
        for node in self.tree.body:
            if isinstance(node, ast.FunctionDef) and node.name in ("emit", "run_probe"):
                exec(compile(ast.Module(body=[node], type_ignores=[]), "<test>", "exec"), namespace)
        return namespace

    def test_embedded_programs_compile(self):
        compile(self.body, "<main>", "exec")
        common = next(
            node.value.value
            for node in self.tree.body
            if isinstance(node, ast.Assign)
            and any(isinstance(target, ast.Name) and target.id == "common" for target in node.targets)
        )
        probes = 0
        for node in self.tree.body:
            if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call) and getattr(node.value.func, "id", None) == "run_probe":
                compile(common + node.value.args[1].right.value, "<probe>", "exec")
                probes += 1
        self.assertEqual(probes, 3)

    def test_only_controlled_json_reaches_console(self):
        namespace = self.namespace()
        output = io.StringIO()
        source = 'print("raw log must be suppressed"); print(\'{"check":"success","ok":true}\'); print("42")'
        with contextlib.redirect_stdout(output):
            namespace["run_probe"]("filter_test", source, 3)
        rows = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0], {"check": "success", "ok": True})
        self.assertEqual(rows[1]["exit_code"], 0)
        self.assertFalse(namespace["active"])

    def test_timed_out_child_is_killed_and_reaped(self):
        namespace = self.namespace()
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            namespace["run_probe"]("timeout_test", "import time; time.sleep(10)", 0.1)
        row = json.loads(output.getvalue())
        self.assertTrue(row["timed_out"])
        self.assertNotEqual(row["exit_code"], 0)
        self.assertFalse(namespace["active"])


if __name__ == "__main__":
    unittest.main()
