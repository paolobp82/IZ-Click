import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('worker_stacks', Path(__file__).parents[1] / 'izclick-worker-stacks.py')
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class RedactionTests(unittest.TestCase):
    def test_stacks_exclude_locals_paths_and_process_commands(self):
        traces = [{'active': True, 'owns_gil': True, 'process_info': {'command_line': 'SECRET=hidden'},
                   'frames': [{'filename': '/private/path/view.py', 'name': 'get', 'line': 10,
                               'locals': [{'name': 'password', 'repr': 'hidden'}]}]}]
        result = probe.safe_threads(traces)
        self.assertEqual(result, [{'active': True, 'owns_gil': True,
                                  'frames': [{'file': 'view.py', 'function': 'get', 'line': 10}]}])

    def test_output_bounds_threads_and_frames(self):
        result = probe.safe_threads([{'frames': [{'filename': 'a.py'}] * 100}] * 100)
        self.assertEqual(len(result), 8)
        self.assertEqual(len(result[0]['frames']), 20)


if __name__ == '__main__':
    unittest.main()
