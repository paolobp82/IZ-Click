import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('cpu_limits', Path(__file__).parents[1] / 'izclick-cpu-limits.py')
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class AncestorTests(unittest.TestCase):
    def test_checks_parent_quotas_through_root(self):
        root = Path('/cgroup').resolve()
        self.assertEqual(probe.ancestors(root, '/system.slice/docker.scope'),
                         [root / 'system.slice/docker.scope', root / 'system.slice', root])

    def test_root_scope_is_included(self):
        root = Path('/cgroup').resolve()
        self.assertEqual(probe.ancestors(root, '/'), [root])

    def test_unmapped_parent_path_does_not_escape_mount(self):
        self.assertEqual(probe.ancestors(Path('/cgroup'), '/../outside'), [])


if __name__ == '__main__':
    unittest.main()
