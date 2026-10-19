"""Exercise deployment guards and rollback with fake Docker responses only."""
import argparse
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('api_repair', Path(__file__).resolve().parents[1] / 'izclick-apply-api-repair.py')
repair = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(repair)


def api_fixture():
    return {
        'Image': repair.OLD_API, 'Id': 'old-api-id', 'Name': '/plane-app-api-1',
        'Config': {'Env': ['SECRET_KEY=keep-existing-test-key', 'GUNICORN_WORKERS=1', 'PORT=8000'],
                   'Cmd': ['./bin/docker-entrypoint-api.sh'], 'Entrypoint': None, 'Labels': {}},
        'Mounts': [{'Type': 'volume', 'Name': 'plane-app_uploads', 'Destination': '/code/uploads', 'RW': True}],
        'NetworkSettings': {'Networks': {'plane-app_default': {}}},
    }


def config_fixture(api):
    return {
        'services': {'api': {
            'volumes': [{'type': 'volume', 'source': 'uploads', 'target': '/code/uploads'}],
            'networks': {'default': {}},
            'environment': repair.override(api, 'candidate', 2)['services']['api']['environment'],
        }},
        'volumes': {'uploads': {'name': 'plane-app_uploads'}},
        'networks': {'default': {'name': 'plane-app_default'}},
    }


class ApplyRepairTests(unittest.TestCase):
    def test_override_preserves_secret_and_command(self):
        api = api_fixture()
        item = repair.override(api, 'candidate', 2)['services']['api']
        self.assertEqual(item['environment']['SECRET_KEY'], 'keep-existing-test-key')
        self.assertEqual(item['environment']['GUNICORN_WORKERS'], '2')
        self.assertEqual(item['command'], api['Config']['Cmd'])
        self.assertIsNone(item['entrypoint'])
        self.assertIn('GUNICORN_WORKERS=1', api['Config']['Env'])

    def test_mount_and_network_guards(self):
        api = api_fixture()
        config = config_fixture(api)
        repair.validate_layout(config, api)
        config['volumes']['uploads']['name'] = 'wrong-volume'
        with self.assertRaises(RuntimeError):
            repair.validate_layout(config, api)
        config = config_fixture(api)
        config['networks']['default']['name'] = 'wrong-network'
        with self.assertRaises(RuntimeError):
            repair.validate_layout(config, api)

    def test_baseline_drift_stops_before_commands(self):
        api = api_fixture()
        api['Image'] = 'changed-since-review'
        with patch.object(repair, 'inspect', side_effect=[api, {'Image': repair.OLD_WEB}]), patch.object(repair, 'run') as run:
            with self.assertRaises(RuntimeError):
                repair.apply(argparse.Namespace())
            run.assert_not_called()

    def test_embedded_smoke_test_compiles(self):
        compile(repair.SMOKE, '<production-smoke>', 'exec')

    def test_failed_smoke_rolls_back_only_api_after_backup(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            compose_file = root / 'compose.yaml'
            compose_file.write_text('services: {}')
            api = api_fixture()
            api['Config']['Labels'] = {
                'com.docker.compose.project.working_dir': str(root),
                'com.docker.compose.project.config_files': str(compose_file),
                'com.docker.compose.project': 'plane-app',
            }
            config = config_fixture(api)
            web = {'Image': repair.OLD_WEB, 'Name': '/plane-app-web-1', 'Id': 'web-id'}
            args = argparse.Namespace(image='ghcr.io/paolobp82/izclick-api@sha256:' + 'a' * 64,
                                      revision='b' * 40, check_only=False)
            calls = []
            def fake_run(argv, **kwargs):
                calls.append(argv)
                if 'config' in argv:
                    return json.dumps(config).encode()
                if argv[:3] == ['docker', 'image', 'inspect']:
                    if argv[-1] == repair.OLD_API:
                        return json.dumps([{'RepoDigests': ['ghcr.io/paolobp82/izclick-api@sha256:' + 'c' * 64]}]).encode()
                    return json.dumps([{'Id': 'candidate-id', 'Config': {'Labels': {'org.opencontainers.image.revision': args.revision}}}]).encode()
                if argv[:2] == ['docker', 'ps']:
                    return b'web-id'
                if argv[:2] == ['docker', 'inspect']:
                    return json.dumps([web]).encode()
                if 'pg_dump' in ' '.join(argv):
                    kwargs['output'].write(b'fake-test-archive')
                return b''
            def fake_inspect(name):
                if name == 'plane-app-api-1':
                    return api if len([call for call in calls if 'up' in call]) == 0 else {'Image': 'candidate-id'}
                return web
            with patch.object(repair, 'ROOT', root), patch.object(repair, 'run', side_effect=fake_run), \
                 patch.object(repair, 'inspect', side_effect=fake_inspect), \
                 patch.object(repair, 'http_sample', return_value={'status': 200}), \
                 patch.object(repair, 'smoke', side_effect=RuntimeError('test failure')), \
                 patch.object(repair.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0)), \
                 contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaisesRegex(RuntimeError, 'test failure'):
                    repair.apply(args)
            mutations = [call for call in calls if 'up' in call]
            self.assertEqual(len(mutations), 2)
            self.assertTrue(all(call[-1] == 'api' and '--no-deps' in call for call in mutations))
            self.assertTrue(any('rollback.json' in arg for arg in mutations[-1]))
            backup_call = next(index for index, call in enumerate(calls) if 'pg_dump' in ' '.join(call))
            self.assertLess(backup_call, calls.index(mutations[0]))
            self.assertFalse(any('--clean' in call or 'down' in call for call in calls))


if __name__ == '__main__':
    unittest.main()
