import copy
import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('release', Path(__file__).parents[1] / 'izclick-simple-states-web-release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


def container():
    return {
        'Id': 'old-container', 'Image': 'sha256:old',
        'Config': {'Env': ['PASSWORD=a$b$' + '{literal}', 'GUNICORN_WORKERS=2'],
                   'Cmd': ['sh', '-c', 'exec "$COMMAND"'], 'Entrypoint': ['/entry'],
                   'User': '', 'WorkingDir': '/code',
                   'Labels': {'com.docker.compose.project': 'plane-app',
                              'com.docker.compose.project.working_dir': str(release.ROOT),
                              'com.docker.compose.project.config_files': str(release.ROOT / 'compose.yml')}},
        'HostConfig': {'Memory': 1024, 'MemorySwap': -1, 'NanoCpus': 2000000000,
                       'ShmSize': 67108864, 'CpuQuota': 50000, 'CpuPeriod': 100000,
                       'RestartPolicy': {'Name': 'on-failure', 'MaximumRetryCount': 3}},
        'Mounts': [{'Type': 'volume', 'Name': 'plane-data', 'Destination': '/data', 'RW': True}],
        'NetworkSettings': {'Networks': {'plane-net': {}}},
        'State': {'Running': True},
    }


def compose():
    return {'services': {'api': {'volumes': [{'type': 'volume', 'source': 'data', 'target': '/data'}],
                                 'networks': {'default': {}}}},
            'volumes': {'data': {'name': 'plane-data'}}, 'networks': {'default': {'name': 'plane-net'}}}


class ReleaseTests(unittest.TestCase):
    def exercise_release(self, *, smoke_error=False, backup_error=False, preflight=False, migration_error=False, already_applied=False):
        calls = []
        with tempfile.TemporaryDirectory() as directory, patch.object(release, 'ROOT', Path(directory)):
            root = Path(directory)
            (root / 'compose.yml').write_text('services: {}')
            (root / 'plane.env').write_text('PASSWORD=not-for-logs')
            rows = {name: container() for name in ('api', 'worker', 'web')}
            for name, row in rows.items():
                row['Id'] = 'old-' + name
                row['Name'] = '/plane-app-' + name + '-1'
                row['Config']['Labels']['com.docker.compose.service'] = name
            rows['web']['Image'] = 'sha256:base-web'
            if already_applied:
                rows['web']['Config']['Image'] = release.WEB
                rows['web']['Image'] = 'new-web'
            config = compose()
            for name in ('web', 'worker'):
                config['services'][name] = copy.deepcopy(config['services']['api'])
            for name in release.SERVICES:
                config['services'][name]['environment'] = release.environment(rows[name])
            state = {'new': False}
            def fake_run(argv, **kwargs):
                calls.append(argv)
                if 'run' in argv and '-c' in argv:
                    if migration_error:
                        raise RuntimeError('Unexpected migration plan')
                    return b'IZCLICK_MIGRATION_OK'
                if 'config' in argv:
                    return json.dumps(config).encode()
                if 'pg_restore' in argv:
                    raise AssertionError('pg_restore must only inspect archive via subprocess')
                if 'pg_dump' in ' '.join(argv):
                    kwargs['output'].write(b'dump')
                    return b''
                if 'ps' in argv:
                    return b'old-api old-worker old-web other'
                if argv[:2] == ['docker', 'inspect']:
                    return json.dumps([*rows.values(), {'Id': 'other', 'Name': '/other'}]).encode()
                if 'up' in argv:
                    state['new'] = 'rollback.json' not in ' '.join(argv)
                return b''
            def fake_inspect(name):
                if name == '/other':
                    return {'Id': 'other'}
                row = copy.deepcopy(rows[name.lstrip('/').removeprefix('plane-app-').removesuffix('-1')])
                if state['new'] and 'web' in name:
                    row['Image'] = 'new-web'
                return row
            def fake_image(name):
                return {'Id': 'sha256:old' if name == release.BASE_API else 'sha256:base-web' if name == release.BASE_WEB else 'new-web' if name == release.WEB else 'new-api',
                        'Config': {'Labels': {'org.opencontainers.image.revision': release.REVISION}}}
            result = SimpleNamespace(returncode=1 if backup_error else 0)
            with patch.object(release, 'run', side_effect=fake_run), \
                 patch.object(release, 'inspect', side_effect=fake_inspect), \
                 patch.object(release, 'image_info', side_effect=fake_image), \
                 patch.object(release.subprocess, 'run', return_value=result), \
                 patch.object(release, 'wait_ready'), patch.object(release, 'report'), \
                 patch.object(release, 'worker_smoke', side_effect=RuntimeError('worker failure') if smoke_error else None):
                args = SimpleNamespace(apply=not preflight, expected_worker_image='sha256:old')
                if smoke_error or backup_error or migration_error:
                    with self.assertRaises(RuntimeError):
                        release.apply(args)
                else:
                    release.apply(args)
            backups = list(root.glob('simple-states-web-backup-*'))
            if preflight or already_applied:
                self.assertEqual(backups, [])
                return calls
            self.assertEqual(len(backups), 1)
            self.assertEqual((backups[0] / 'database.dump').read_bytes(), b'dump')
            self.assertEqual((backups[0] / 'runtime-before.json').stat().st_mode & 0o777, 0o600)
        return calls

    def test_default_preflight_does_not_pull_dump_or_recreate(self):
        calls = self.exercise_release(preflight=True)
        self.assertFalse(any('pull' in argv or 'up' in argv or 'pg_dump' in ' '.join(argv) for argv in calls))

    def test_already_applied_only_verifies_without_pull_backup_or_recreate(self):
        calls = self.exercise_release(already_applied=True)
        self.assertFalse(any('pull' in argv or 'up' in argv or 'pg_dump' in ' '.join(argv) for argv in calls))

    def test_success_recreates_only_web_without_migrations(self):
        calls = self.exercise_release()
        updates = [argv for argv in calls if 'up' in argv]
        self.assertEqual(len(updates), 1)
        self.assertEqual(updates[0][-len(release.SERVICES):], list(release.SERVICES))
        self.assertIn('--no-deps', updates[0])
        migrations = [argv for argv in calls if 'run' in argv and '-c' in argv]
        self.assertEqual(migrations, [])
        self.assertEqual(updates[0][-1], 'web')


    def test_failed_backup_never_recreates_services(self):
        self.assertFalse(any('up' in argv for argv in self.exercise_release(backup_error=True)))

    def test_worker_verification_failure_rolls_back_only_web(self):
        updates = [argv for argv in self.exercise_release(smoke_error=True) if 'up' in argv]
        self.assertEqual(len(updates), 2)
        self.assertIn('rollback.json', ' '.join(updates[-1]))
        self.assertEqual(updates[-1][-len(release.SERVICES):], list(release.SERVICES))

    def test_preserves_literals_command_workers_and_limits(self):
        row = container()
        original = copy.deepcopy(row)
        override = release.service_override(row, release.WEB)
        self.assertEqual(override['environment']['PASSWORD'], 'a$$b$$' + '{literal}')
        self.assertEqual(override['environment']['GUNICORN_WORKERS'], '2')
        self.assertEqual(override['command'][-1], 'exec "$$COMMAND"')
        self.assertEqual((override['cpus'], override['cpu_quota'], override['cpu_period']), (2, 50000, 100000))
        self.assertEqual(override['restart'], 'on-failure:3')
        self.assertEqual(override['memswap_limit'], -1)
        self.assertEqual(row, original)

    def test_layout_rejects_changed_mount_network_and_ports(self):
        release.validate_layout(compose(), 'api', container())
        for change in ('mount', 'network', 'port'):
            desired = compose()
            if change == 'mount':
                desired['services']['api']['volumes'][0]['read_only'] = True
            elif change == 'network':
                desired['networks']['default']['name'] = 'other'
            else:
                desired['services']['api']['ports'] = [8000]
            with self.subTest(change=change), self.assertRaises(RuntimeError):
                release.validate_layout(desired, 'api', container())

    def test_runtime_rejects_credentials_commands_limits_and_security_drift(self):
        before = container()
        live = copy.deepcopy(before)
        live['Image'] = 'sha256:new'
        release.validate_runtime(before, live, 'sha256:new')
        changes = [('Config', 'Env', ['PASSWORD=changed']), ('Config', 'Cmd', ['new']),
                   ('Config', 'User', 'root'), ('HostConfig', 'Memory', 2048),
                   ('HostConfig', 'Privileged', True)]
        for group, key, value in changes:
            modified = copy.deepcopy(live)
            modified[group][key] = value
            with self.subTest(key=key), self.assertRaises(RuntimeError):
                release.validate_runtime(before, modified, 'sha256:new')

    def test_changed_worker_stops_before_pull_or_compose(self):
        def current(name):
            row = container()
            row['Image'] = 'sha256:changed' if 'worker' in name else 'sha256:web' if 'web' in name else 'sha256:old'
            return row
        def image(name):
            return {'Id': 'sha256:web' if name == release.BASE_WEB else 'sha256:old'}
        with patch.object(release, 'inspect', side_effect=current), patch.object(release, 'image_info', side_effect=image), patch.object(release, 'run') as run:
            with self.assertRaisesRegex(RuntimeError, 'baseline changed'):
                release.apply(SimpleNamespace(apply=True))
            run.assert_not_called()

    def test_unreviewed_baseline_stops_before_pull_or_compose(self):
        with patch.object(release, 'inspect', return_value=container()), \
             patch.object(release, 'image_info', return_value={'Id': 'different'}), \
             patch.object(release, 'run') as run:
            with self.assertRaisesRegex(RuntimeError, 'baseline changed'):
                release.apply(SimpleNamespace(apply=True, expected_worker_image='sha256:old'))
            run.assert_not_called()

    def test_http_requires_three_consecutive_successes(self):
        with patch.object(release, 'http_ok', side_effect=[True, True, False, True, True, True, True, True, True, True]), \
             patch.object(release.time, 'sleep') as sleep:
            release.wait_ready()
            self.assertEqual(sleep.call_count, 4)

    def test_subprocess_failure_does_not_expose_secrets(self):
        failed = SimpleNamespace(returncode=1, stdout=b'secret', stderr=b'PASSWORD=secret')
        with patch.object(release.subprocess, 'run', return_value=failed):
            with self.assertRaises(RuntimeError) as error:
                release.run(['docker', 'compose'])
        self.assertNotIn('secret', str(error.exception))


if __name__ == '__main__':
    unittest.main()

