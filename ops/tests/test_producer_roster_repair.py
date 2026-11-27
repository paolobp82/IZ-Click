import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('roster_repair', Path(__file__).parents[1] / 'izclick-producer-roster-repair.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class RosterExecutionGuards(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.plan = {'missing_profiles': ['ayrala@izango.com.pe'], 'roster': [], 'production_unchanged': True}

    def run_main(self, apply=False, missing=True, valid_backup=True):
        plan = self.plan if missing else {**self.plan, 'missing_profiles': []}
        def command(args, **kwargs): kwargs['stdout'].write(b'backup')
        with patch.object(m, 'ROOT', self.root), patch.object(m.os, 'geteuid', return_value=0), patch.object(m.os, 'umask'), patch.object(m, 'emit'), patch.object(m, 'call_django', return_value=plan) as django, patch.object(m.subprocess, 'run', side_effect=command) as commands, patch.object(m.subprocess, 'check_output', return_value=b'TABLE DATA' if valid_backup else b'bad'), patch('sys.argv', ['repair'] + (['--apply'] if apply else [])):
            try:
                m.main()
            finally:
                self.django_calls = django.call_args_list
                self.command_count = commands.call_count

    def test_default_is_an_audit_without_backup_or_data_changes(self):
        self.run_main()
        self.assertEqual([call.args[0] for call in self.django_calls], [False])
        self.assertEqual(self.command_count, 0)
        self.assertFalse(list(self.root.glob('*backup-*')))

    def test_failed_backup_never_enters_the_mutating_django_operation(self):
        with self.assertRaisesRegex(RuntimeError, 'Respaldo invalido'):
            self.run_main(apply=True, valid_backup=False)
        self.assertEqual([call.args[0] for call in self.django_calls], [False])

    def test_already_complete_roster_does_not_mutate_or_restart_services(self):
        self.run_main(apply=True, missing=False)
        self.assertEqual([call.args[0] for call in self.django_calls], [False])
        self.assertEqual(self.command_count, 0)


if __name__ == '__main__': unittest.main()
