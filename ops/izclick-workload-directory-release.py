#!/usr/bin/env python3
"""Web-only publication of the project producer workload directory."""
import argparse
import ast
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tarfile
import time
import urllib.request

REV = 'e9196517cce80a3d1712f75ae372ecfffb8c5405'
ROOT = Path('/opt/iz-click/plane-app')
BASE_API = 'izclick-api:creation-files-233de3a9411e'
BASE_WEB = 'izclick-web:creation-files-233de3a9411e'
FILES = {'plane/api/views/issue.py': '5678b33e2070d849f114faab0c3e31310357a52f1ffcbb1282300a9c8f050a6e', 'plane/app/views/issue/base.py': '0eb8bf286950321e321fc0267714deb18923b1a489cf9d8933c3e68112d9f14f', 'plane/utils/izclick_issue_intake.py': '1810d25111f2d34c2822d8247b93843cb4ced68995d0499f4c757d512e2e1931', 'plane/app/views/asset/v2.py': '6ee217095e3e274f5738ef54129cceb2b8ca1de04697e6c6a9a888a811cb54fd', 'plane/app/permissions/base.py': '3f21cd56b0882b53533c69d4a41d14c513cb2828de2ebfb90d11bd4a2af6dfe3', 'plane/utils/izclick_access.py': '9afcc7f8ebb13197b1bb35c041452f4825597ebb67b695378f18e880fc03c22f', 'plane/bgtasks/file_asset_task.py': 'd6349213c0fc65061b6cbcc168839c4fa54e91e475f66413dfa86b7d5e6977fc', 'plane/utils/izclick_creation_attachments.py': '6ae2dc520031a2ae478f04ae5fb031feffcb261189d7996c78330519ec493277'}
AST_HASHES = {'plane/api/views/issue.py': 'fe54d1cba052387d8977e4f5799afd7d0233f208495ce5c43bf0090116b8d725', 'plane/app/views/issue/base.py': 'fd8dc2fdcfa8aa6afb555c7d5cfbaf91bc22a49712a9d2132b8744558eafe355', 'plane/utils/izclick_issue_intake.py': 'b53a550e997c77259ae36d052407e9936c861c70175c96a15d94ae2057c387bf', 'plane/app/views/asset/v2.py': 'caced52e0cc646ca9b0b82c9b30825327bc3c205a2b9844e6af221e236f662ed', 'plane/app/permissions/base.py': '8b59e793b23bf1b7c1e867a73f16a78634fae1b28437cbfc8a86e8a7a4c79d84', 'plane/utils/izclick_access.py': '5233119d431a6baf11592c95a771e615b56b4a35183521dd061936f121aa4d34', 'plane/bgtasks/file_asset_task.py': '0cc17b0e21e66697bf28de7ccf9d6f0a676e09b47baece7060801cbedc2b5fd1', 'plane/utils/izclick_creation_attachments.py': 'd5975226076523e54b8f7acca80b758c948686b3c394b0f08c54d7c32daa9051'}
SERVICES = ['web']


def emit(check, **data):
    print(json.dumps(dict(check=check, **data)), flush=True)


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def inspect(name):
    return json.loads(subprocess.check_output(['docker', 'inspect', name]))[0]


def compose_chain(api, web):
    labels = api['Config']['Labels']
    web_labels = web['Config']['Labels']
    api_paths = labels['com.docker.compose.project.config_files'].split(',')
    paths = web_labels['com.docker.compose.project.config_files'].split(',')
    if labels['com.docker.compose.project'] != web_labels['com.docker.compose.project'] or paths[:len(api_paths)] != api_paths:
        raise RuntimeError('La cadena Compose activa no coincide con la version esperada')
    if not paths or any(not Path(p).is_file() for p in paths):
        raise RuntimeError('Falta una configuracion Compose activa')
    # The previous release changed web only. Its trailing overlays cannot affect API.
    for path in paths[len(api_paths):]:
        overlay = json.loads(Path(path).read_text())
        if (set(overlay) != {'services'} or set(overlay['services']) != {'web'}
                or set(overlay['services']['web']) != {'image'}):
            raise RuntimeError('Una capa adicional contiene cambios inesperados')
    command = ['docker', 'compose', '-p', labels['com.docker.compose.project']]
    for path in paths:
        command += ['-f', path]
    return command


def environment(container):
    return dict(item.split('=', 1) for item in container['Config']['Env'])


def service_overlay(image, container):
    # Freeze the actual running environment, rather than guessing original --env-file flags.
    # Escape dollars so Compose cannot interpolate passwords or keys a second time.
    return {'image': image, 'environment': {key: value.replace('$', '$$')
            for key, value in environment(container).items()}}


def save(path, data):
    path.write_text(json.dumps(data, indent=2), encoding='utf-8')
    path.chmod(0o600)


def fingerprint(container_id, path):
    data = subprocess.check_output(['docker', 'exec', container_id, 'cat', '/code/' + path])
    return hashlib.sha256(data).hexdigest()


def canonical_digest(source):
    return hashlib.sha256(ast.dump(ast.parse(source)).encode()).hexdigest()


def canonical_fingerprint(container_id, path):
    source = subprocess.check_output(['docker', 'exec', container_id, 'cat', '/code/' + path])
    return canonical_digest(source.decode('utf-8'))


def healthy():
    for route in ['/api/instances/', '/']:
        result = subprocess.run([
            'curl', '-q', '-sS', '--resolve', 'izclick.izango.com.pe:443:127.0.0.1',
            '--connect-timeout', '3', '--max-time', '15', '-o', '/dev/null',
            '-w', '%{http_code}', 'https://izclick.izango.com.pe' + route,
        ], capture_output=True, text=True)
        if result.returncode or result.stdout != '200':
            return False
    return True


def build(args, directory, name):
    log = directory / (name + '.log')
    emit('build_starting', component=name, log=str(log))
    with log.open('w') as stream:
        proc = subprocess.Popen(args, stdout=stream, stderr=subprocess.STDOUT)
        started = time.monotonic()
        while proc.poll() is None:
            if time.monotonic() - started > 3600:
                proc.terminate()
                proc.wait(timeout=30)
                raise RuntimeError('Compilacion excedio una hora; produccion sin cambios')
            emit('building', component=name, seconds=int(time.monotonic() - started))
            time.sleep(20)
    if proc.returncode:
        raise RuntimeError('Fallo la compilacion de ' + name + '; revisar ' + str(log))
    emit('build_ready', component=name)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    options = parser.parse_args()
    if os.geteuid() != 0:
        raise RuntimeError('Ejecutar como root o con sudo')
    os.umask(0o077)
    os.chdir(ROOT)
    with (ROOT / '.izclick-repair.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        api, web = inspect('plane-app-api-1'), inspect('plane-app-web-1')
        if api['Image'] != inspect(BASE_API)['Id'] or web['Image'] != inspect(BASE_WEB)['Id']:
            raise RuntimeError('La version instalada cambio; no se modifica nada')
        if not api['State']['Running']:
            raise RuntimeError('API no esta ejecutandose')
        command = compose_chain(api, web)
        containers = {service: inspect('plane-app-' + service + '-1') for service in SERVICES}
        for service, container in containers.items():
            if not container['State']['Running']:
                raise RuntimeError(service + ' no esta ejecutandose')
            expected = web['Image'] if service == 'web' else api['Image']
            if container['Image'] != expected:
                raise RuntimeError('API/worker/planificador no coinciden')
        for path, expected in FILES.items():
            if fingerprint(api['Id'], path) != expected and canonical_fingerprint(api['Id'], path) != AST_HASHES[path]:
                raise RuntimeError('Codigo instalado distinto en ' + path)
        if not healthy():
            raise RuntimeError('El sitio no supera la comprobacion inicial')
        emit('preflight', revision=REV, production_unchanged=True)
        if not options.apply:
            return
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        directory = ROOT / ('workload-directory-backup-' + stamp)
        directory.mkdir(mode=0o700)
        save(directory / 'previous-images.json', {s: c['Image'] for s, c in containers.items()})
        # Preserve exact Compose bytes privately. Never print merged environment.
        config_dir = directory / 'compose-files'
        config_dir.mkdir(mode=0o700)
        for i, path in enumerate(web['Config']['Labels']['com.docker.compose.project.config_files'].split(',')):
            (config_dir / (str(i) + '-' + Path(path).name)).write_bytes(Path(path).read_bytes())
        emit('backup_starting', directory=str(directory))
        dump = directory / 'database.dump'
        with dump.open('wb') as stream:
            run(['docker', 'exec', 'plane-app-plane-db-1', 'sh', '-c',
                 'PGHOST=/var/run/postgresql exec pg_dump -Fc -U "${POSTGRES_USER:-plane}" -d "${POSTGRES_DB:-plane}"'], stdout=stream)
        with dump.open('rb') as stream:
            listing = subprocess.check_output(['docker', 'exec', '-i', 'plane-app-plane-db-1', 'pg_restore', '--list'], stdin=stream)
        if b'TABLE DATA' not in listing:
            raise RuntimeError('Respaldo invalido')
        emit('backup_ready', archive_valid=True, directory=str(directory))
        archive = directory / 'source.tar.gz'
        urllib.request.urlretrieve('https://codeload.github.com/paolobp82/IZ-Click/tar.gz/' + REV, archive)
        source_dir = directory / 'source'
        source_dir.mkdir()
        with tarfile.open(archive) as tar:
            tar.extractall(source_dir, filter='data')
        source = source_dir / ('IZ-Click-' + REV)
        web_tag = 'izclick-web:workload-' + REV[:12]
        # Compile and check types before modifying any running service.
        # The generated production image explicitly includes its health-check client.
        webfile = directory / 'Dockerfile.web'
        webfile.write_text((source / 'apps/web/Dockerfile.web').read_text() + '\nRUN apk add --no-cache curl\n')
        build(['docker', 'build', '--build-arg', 'IZCLICK_VALIDATE_TYPES=true',
               '-t', web_tag, '-f', str(webfile), str(source)], directory, 'web')
        # Stop if any service changed while compiling.
        for service, old in containers.items():
            if inspect('plane-app-' + service + '-1')['Id'] != old['Id']:
                raise RuntimeError('Los servicios cambiaron durante la compilacion')
        web_image = inspect(web_tag)['Id']
        override = directory / 'docker-compose.workload.json'
        save(override, {'services': {s: service_overlay(web_image, containers[s]) for s in SERVICES}})
        rollback = directory / 'docker-compose.rollback.json'
        save(rollback, {'services': {s: service_overlay(c['Image'], c) for s, c in containers.items()}})
        active_command = command + ['-f', str(override), 'up', '-d', '--no-deps', '--no-build', '--pull', 'never'] + SERVICES
        rollback_command = command + ['-f', str(rollback), 'up', '-d', '--no-deps', '--no-build', '--pull', 'never'] + SERVICES
        save(directory / 'rollback-command.json', rollback_command)
        save(directory / 'apply-command.json', active_command)
        # Validate Compose without outputting environment or secrets.
        run(command + ['-f', str(override), 'config', '--quiet'])
        emit('services_recreating', services=SERVICES)
        try:
            run(active_command)
            stable = 0
            started = time.monotonic()
            while time.monotonic() - started < 600:
                current = {s: inspect('plane-app-' + s + '-1') for s in SERVICES}
                correct = all(current[s]['Image'] == (web_image)
                    and all(environment(current[s]).get(key) == value for key, value in environment(containers[s]).items())
                    for s in SERVICES)
                stable = stable + 1 if correct and healthy() else 0
                emit('readiness', seconds=int(time.monotonic() - started), stable=stable)
                if stable >= 3:
                    result = dict(revision=REV, backup=str(directory), authenticated_browser_check_pending=True)
                    save(directory / 'result.json', result)
                    emit('release_applied', **result)
                    return
                time.sleep(10)
            raise RuntimeError('Los servicios no quedaron listos en diez minutos')
        except Exception:
            emit('rollback_starting', command_file=str(directory / 'rollback-command.json'))
            run(rollback_command)
            emit('rollback_services_started', database_restored=False, backup=str(directory))
            raise


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        emit('release_stopped', error=type(exc).__name__, reason=str(exc))
        raise SystemExit(1)
