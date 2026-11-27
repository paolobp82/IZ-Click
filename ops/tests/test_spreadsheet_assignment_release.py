import importlib.util
import io
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('spreadsheet_release', Path(__file__).parents[1] / 'izclick-spreadsheet-assignment-release.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class WebReleaseGuards(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.config = self.root / 'compose.json'
        self.config.write_text('{}')
        labels = {'com.docker.compose.project.config_files': str(self.config), 'com.docker.compose.project': 'plane-app'}
        self.api = {'Id': 'api-container', 'Image': 'api-image', 'Config': {'Labels': dict(labels)}, 'State': {'Running': True}}
        self.web = {'Id': 'web-container', 'Image': 'web-image', 'Config': {'Labels': dict(labels)}, 'State': {'Running': True}}
        self.started = False

    def inspect(self, name):
        if name == 'plane-app-api-1':
            return self.api
        if name == 'plane-app-web-1':
            if self.started:
                return {**self.web, 'Id': 'new-web-container', 'Image': 'candidate-web'}
            return self.web
        if name == m.BASE_API:
            return {'Id': 'api-image'}
        if name == m.BASE_WEB:
            return {'Id': 'web-image'}
        if name.startswith('izclick-web:spreadsheet-'):
            return {'Id': 'candidate-web'}
        raise AssertionError('Unexpected inspection: ' + name)

    def download(self, url, destination):
        data = b'FROM nginx:alpine\n'
        with tarfile.open(destination, 'w:gz') as archive:
            entry = tarfile.TarInfo('IZ-Click-' + m.REV + '/apps/web/Dockerfile.web')
            entry.size = len(data)
            archive.addfile(entry, io.BytesIO(data))

    def command(self, args, **kwargs):
        if 'pg_dump' in args[-1]:
            kwargs['stdout'].write(b'backup')
        if 'up' in args:
            self.assertEqual(args[args.index('never') + 1:], ['web'])
            self.started = True

    def execute(self, apply=False, build_error=False):
        with patch.object(m, 'ROOT', self.root), patch.object(m.os, 'chdir'), patch.object(m.os, 'geteuid', return_value=0), patch.object(m.os, 'umask'), patch.object(m, 'inspect', side_effect=self.inspect), patch.object(m, 'fingerprint', side_effect=lambda _, path: m.FILES[path]), patch.object(m, 'healthy', return_value=True), patch.object(m, 'emit'), patch.object(m, 'run', side_effect=self.command) as commands, patch.object(m, 'build', side_effect=RuntimeError('build failed') if build_error else None) as build, patch.object(m.urllib.request, 'urlretrieve', side_effect=self.download), patch.object(m.subprocess, 'check_output', return_value=b'TABLE DATA'), patch.object(m.time, 'sleep'), patch('sys.argv', ['release'] + (['--apply'] if apply else [])):
            m.main()
            return commands, build

    def test_preflight_is_read_only(self):
        commands, build = self.execute()
        commands.assert_not_called()
        build.assert_not_called()

    def test_rejects_an_unexpected_running_api(self):
        self.api['Image'] = 'unknown-api'
        with self.assertRaisesRegex(RuntimeError, 'version instalada'):
            self.execute(apply=True)
        self.assertFalse(list(self.root.glob('*backup-*')))

    def test_rejects_changed_compose_chain(self):
        self.web['Config']['Labels']['com.docker.compose.project.config_files'] = '/different'
        with self.assertRaisesRegex(RuntimeError, 'configuraciones distintas'):
            self.execute(apply=True)

    def test_publication_builds_and_recreates_only_web(self):
        commands, build = self.execute(apply=True)
        self.assertEqual(build.call_count, 1)
        self.assertEqual(build.call_args.args[-1], 'web')
        self.assertIn('IZCLICK_VALIDATE_TYPES=true', build.call_args.args[0])
        changes = [call.args[0] for call in commands.call_args_list if 'up' in call.args[0]]
        self.assertEqual(len(changes), 1)
        self.assertEqual(changes[0][-1], 'web')
        self.assertEqual(self.api['Id'], 'api-container')
        self.assertTrue(list(self.root.glob('*/result.json')))

    def test_failed_compilation_never_recreates_services(self):
        with self.assertRaisesRegex(RuntimeError, 'build failed'):
            self.execute(apply=True, build_error=True)
        self.assertFalse(self.started)

if __name__ == '__main__':
    unittest.main()
