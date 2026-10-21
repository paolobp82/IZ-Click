"""Diagnostics must not expose raw subprocess output or exception details."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('live_latency', Path(__file__).parents[1] / 'izclick-live-latency.py')
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class SafeOutputTests(unittest.TestCase):
    def test_container_filters_raw_logs_and_stderr(self):
        result = subprocess.CompletedProcess([], 0, 'SECRET=hidden\n{"check":"probe_api_http_1","ok":true}\n', 'password=hidden')
        output = io.StringIO()
        with patch.object(probe.subprocess, 'run', return_value=result), contextlib.redirect_stdout(output):
            probe.run('container', ['docker'], 1)
        self.assertNotIn('hidden', output.getvalue())
        rows = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual(rows[0]['check'], 'probe_api_http_1')
        self.assertEqual(rows[1]['exit_code'], 0)

    def test_timeout_preserves_controlled_records_but_not_raw_output(self):
        error = subprocess.TimeoutExpired(['docker'], 1, output=b'SECRET=hidden\n{"check":"probe_cpu","visible":4}\n', stderr='password=hidden')
        output = io.StringIO()
        with patch.object(probe.subprocess, 'run', side_effect=error), contextlib.redirect_stdout(output):
            probe.run('container', ['docker'], 1)
        self.assertNotIn('hidden', output.getvalue())
        rows = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual(rows[0]['check'], 'probe_cpu')
        self.assertTrue(rows[1]['timed_out'])

    def test_proxy_emits_only_numeric_response_metadata(self):
        result = subprocess.CompletedProcess([], 0, '200 0.05 0.1', 'password=hidden')
        output = io.StringIO()
        with patch.object(probe.subprocess, 'run', return_value=result), contextlib.redirect_stdout(output):
            probe.run('proxy', ['curl'], 1)
        self.assertNotIn('hidden', output.getvalue())
        self.assertEqual(json.loads(output.getvalue().splitlines()[0])['status'], 200)

    def test_direct_api_measurement_is_labelled_separately(self):
        result = subprocess.CompletedProcess([], 0, '200 0.02 0.03', '')
        output = io.StringIO()
        with patch.object(probe.subprocess, 'run', return_value=result), contextlib.redirect_stdout(output):
            probe.run('direct_api', ['curl'], 1)
        self.assertEqual(json.loads(output.getvalue().splitlines()[0])['check'], 'direct_api_http')

    def test_comparison_rejects_non_private_destination(self):
        result = subprocess.CompletedProcess([], 0, '8.8.8.8', '')
        output = io.StringIO()
        with patch.object(probe.subprocess, 'run', return_value=result) as command, contextlib.redirect_stdout(output):
            probe.http_comparison()
        self.assertEqual(command.call_count, 1)
        self.assertEqual(json.loads(output.getvalue().splitlines()[-1])['check'], 'api_address_unavailable')


if __name__ == '__main__':
    unittest.main()
