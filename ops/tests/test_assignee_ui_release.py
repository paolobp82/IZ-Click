import importlib.util
import io
import json
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('assignee_ui_release', Path(__file__).parents[1] / 'izclick-assignee-ui-release.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class AssigneeUiReleaseGuards(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.config = self.root / 'compose.json'; self.config.write_text('{}')
        self.web_layer = self.root / 'web-only.json'
        self.web_layer.write_text(json.dumps({'services': {'web': {'image': 'web-image', 'environment': {'SECRET_KEY': 'existing$$key'}}}}))
        labels = {'com.docker.compose.project.config_files': str(self.config), 'com.docker.compose.project': 'plane-app'}
        self.containers = {}
        for service in ["api", "worker", "beat-worker", "web"]:
            web = service == 'web'
            self.containers[service] = {'Id': service + '-container', 'Image': 'web-image' if web else 'api-image',
                'Config': {'Image': 'sha256:opaque-id', 'Labels': dict(labels),
                    'Env': ['SECRET_KEY=existing$key', 'APP_SETTING=value', 'PATH=/bin']}, 'State': {'Running': True}}
            if web:
                self.containers[service]['Config']['Labels']['com.docker.compose.project.config_files'] += ',' + str(self.web_layer)
        self.started = False

    def inspect(self, name):
        if name.startswith('plane-app-'):
            service = name[len('plane-app-'):-2]
            result = self.containers[service]
            if self.started and service == 'web':
                return {**result, 'Image': 'candidate-web' if service == 'web' else 'candidate-api'}
            return result
        if name in [m.BASE_API, m.BASE_WEB]:
            return {'Id': 'api-image' if name == m.BASE_API else 'web-image'}
        return {'Id': 'candidate-api' if name.startswith('izclick-api:workload-') else 'candidate-web'}

    def download(self, url, destination):
        data = b'FROM nginx:alpine\n'
        with tarfile.open(destination, 'w:gz') as archive:
            entry = tarfile.TarInfo('IZ-Click-' + m.REV + '/apps/web/Dockerfile.web')
            entry.size = len(data); archive.addfile(entry, io.BytesIO(data))

    def command(self, args, **kwargs):
        if 'pg_dump' in args[-1]: kwargs['stdout'].write(b'backup')
        if 'up' in args:
            self.assertEqual(args[args.index('never') + 1:], ['web'])
            self.started = True

    def execute(self, apply=False, fail_build=False):
        with patch.object(m, 'ROOT', self.root), patch.object(m.os, 'chdir'), patch.object(m.os, 'geteuid', return_value=0), patch.object(m.os, 'umask'), patch.object(m, 'inspect', side_effect=self.inspect), patch.object(m, 'fingerprint', side_effect=lambda _, path: m.FILES[path]), patch.object(m, 'healthy', return_value=True), patch.object(m, 'emit'), patch.object(m, 'run', side_effect=self.command) as commands, patch.object(m, 'build', side_effect=RuntimeError('build failed') if fail_build else None) as build, patch.object(m.urllib.request, 'urlretrieve', side_effect=self.download), patch.object(m.subprocess, 'check_output', return_value=b'TABLE DATA'), patch.object(m.time, 'sleep'), patch('sys.argv', ['release'] + (['--apply'] if apply else [])):
            m.main()
            return commands, build

    def test_read_only_preflight_handles_the_real_split_compose_chains(self):
        commands, build = self.execute(); commands.assert_not_called(); build.assert_not_called()

    def test_rejects_unexpected_web_overlay(self):
        self.web_layer.write_text(json.dumps({'services': {'api': {'image': 'unexpected'}}}))
        with self.assertRaisesRegex(RuntimeError, 'capa adicional'): self.execute(apply=True)
        self.assertFalse(list(self.root.glob('*backup-*')))

    def test_rejects_an_environment_layer_that_differs_from_the_running_container(self):
        self.web_layer.write_text(json.dumps({'services': {'web': {'image': 'web-image', 'environment': {'SECRET_KEY': 'changed'}}}}))
        with self.assertRaisesRegex(RuntimeError, 'entorno activo'):
            self.execute(apply=True)
        self.assertFalse(list(self.root.glob('*backup-*')))

    def test_rejects_changed_running_image(self):
        self.containers['api']['Image'] = 'unknown'
        with self.assertRaisesRegex(RuntimeError, 'version instalada'): self.execute(apply=True)

    def test_apply_keeps_every_layer_environment_and_rollback_metadata(self):
        commands, build = self.execute(apply=True)
        self.assertEqual(build.call_count, 1)
        self.assertIn('IZCLICK_VALIDATE_TYPES=true', build.call_args.args[0])
        directory = next(self.root.glob('*backup-*'))
        active = json.loads((directory / 'docker-compose.assignee-ui.json').read_text())
        rollback = json.loads((directory / 'docker-compose.rollback.json').read_text())
        self.assertEqual(active['services']['web']['environment']['SECRET_KEY'], 'existing$$key')
        self.assertEqual(rollback['services']['web']['image'], 'web-image')
        self.assertEqual(set(active['services']), set(m.SERVICES))
        invocation = json.loads((directory / 'apply-command.json').read_text())
        self.assertIn(str(self.web_layer), invocation)
        self.assertEqual((directory / 'docker-compose.assignee-ui.json').stat().st_mode & 0o777, 0o600)
        self.assertFalse((directory / 'Dockerfile.api').exists())
        self.assertTrue((directory / 'result.json').is_file())

    def test_build_failure_keeps_production_unchanged(self):
        with self.assertRaisesRegex(RuntimeError, 'build failed'): self.execute(apply=True, fail_build=True)
        self.assertFalse(self.started)


if __name__ == '__main__': unittest.main()
