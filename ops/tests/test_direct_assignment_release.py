import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('direct_release', Path(__file__).parents[1] / 'izclick-direct-assignment-release.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class ReleaseGuards(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.config = self.root / 'compose.json'
        self.config.write_text('{}')
        self.labels = {'com.docker.compose.project.config_files': str(self.config), 'com.docker.compose.project': 'plane-app'}
        def container(service):
            return {'Id': 'container-' + service, 'Image': 'web-image' if service == 'web' else 'api-image',
                    'State': {'Running': True}, 'Config': {'Image': m.BASE_WEB if service == 'web' else m.BASE_API, 'Labels': dict(self.labels)}}
        self.containers = {f'plane-app-{s}-1': container(s) for s in m.SERVICES}

    def attempt(self, apply=False):
        with patch.object(m, 'ROOT', self.root), patch.object(m.os, 'chdir'), patch.object(m.os, 'geteuid', return_value=0), patch.object(m.os, 'umask'), patch.object(m, 'inspect', side_effect=lambda name: self.containers[name]), patch.object(m, 'fingerprint', side_effect=lambda _, path: m.FILES[path]), patch.object(m, 'healthy', return_value=True), patch.object(m, 'run') as mutate, patch.object(m, 'emit'), patch('sys.argv', ['release'] + (['--apply'] if apply else [])):
            m.main()
            return mutate

    def test_build_uses_verified_local_tag_instead_of_image_id(self):
        container = self.containers['plane-app-api-1']
        with patch.object(m, 'inspect', return_value={'Id': container['Image']}) as check:
            self.assertEqual(m.verified_local_base(container), m.BASE_API)
            check.assert_called_once_with(m.BASE_API)

    def test_changed_local_tag_cannot_change_build_base_silently(self):
        with patch.object(m, 'inspect', return_value={'Id': 'unexpected'}):
            with self.assertRaisesRegex(RuntimeError, 'etiqueta local'):
                m.verified_local_base(self.containers['plane-app-api-1'])

    def test_formatting_changes_preserve_canonical_identity(self):
        self.assertEqual(m.canonical_digest('x = 1\n'), m.canonical_digest('# comment\nx=1\n\n'))

    def test_logic_changes_do_not_preserve_canonical_identity(self):
        self.assertNotEqual(m.canonical_digest('x = 1\n'), m.canonical_digest('x = 2\n'))

    def test_semantically_changed_installed_file_blocks_apply(self):
        with patch.object(m, 'fingerprint', return_value='different'), patch.object(m, 'canonical_fingerprint', return_value='different'):
            # attempt() patches fingerprint itself; test full guard through the AST branch.
            with patch.object(m, 'FILES', {path: 'unknown-raw' for path in m.FILES}):
                # Force the canonical branch independently of attempt's raw mock.
                with patch.object(m, 'ROOT', self.root), patch.object(m.os, 'chdir'), patch.object(m.os, 'geteuid', return_value=0), patch.object(m.os, 'umask'), patch.object(m, 'inspect', side_effect=lambda name: self.containers[name]), patch.object(m, 'healthy', return_value=True), patch('sys.argv', ['release', '--apply']):
                    with self.assertRaisesRegex(RuntimeError, 'Codigo instalado distinto'):
                        m.main()
        self.assertFalse(list(self.root.glob('direct-assignment-backup-*')))

    def test_default_only_inspects_and_never_builds_or_recreates(self):
        self.attempt().assert_not_called()
        self.assertFalse(list(self.root.glob('direct-assignment-backup-*')))

    def test_refuses_changed_baseline_before_apply(self):
        self.containers['plane-app-api-1']['Config']['Image'] = 'unexpected'
        with self.assertRaisesRegex(RuntimeError, 'version instalada'):
            self.attempt(apply=True)
        self.assertFalse(list(self.root.glob('direct-assignment-backup-*')))

    def test_refuses_mixed_worker_images(self):
        self.containers['plane-app-worker-1']['Image'] = 'different'
        with self.assertRaisesRegex(RuntimeError, 'no coinciden'):
            self.attempt(apply=True)

    def test_refuses_stopped_scheduler(self):
        self.containers['plane-app-beat-worker-1']['State']['Running'] = False
        with self.assertRaisesRegex(RuntimeError, 'no esta ejecutandose'):
            self.attempt(apply=True)

    def test_refuses_different_compose_chains(self):
        self.containers['plane-app-web-1']['Config']['Labels']['com.docker.compose.project.config_files'] = '/other'
        with self.assertRaisesRegex(RuntimeError, 'configuraciones distintas'):
            self.attempt(apply=True)

    def test_refuses_missing_compose_layer(self):
        self.config.unlink()
        with self.assertRaisesRegex(RuntimeError, 'Falta una configuracion'):
            self.attempt(apply=True)

    def test_preserves_every_compose_layer_and_project(self):
        second = self.root / 'override.json'
        second.write_text('{}')
        for value in self.containers.values():
            value['Config']['Labels']['com.docker.compose.project.config_files'] += ',' + str(second)
        command = m.compose_chain(self.containers['plane-app-api-1'], self.containers['plane-app-web-1'])
        self.assertEqual(command, ['docker', 'compose', '-p', 'plane-app', '-f', str(self.config), '-f', str(second)])

    def test_saved_recovery_metadata_is_private(self):
        target = self.root / 'recovery.json'
        m.save(target, {'services': m.SERVICES})
        self.assertEqual(target.stat().st_mode & 0o777, 0o600)

if __name__ == '__main__':
    unittest.main()
