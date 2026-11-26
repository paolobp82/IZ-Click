#!/usr/bin/env python3
"""Pinned, guarded upgrade of the existing native-task coordination installation."""
import argparse
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

REV = 'd26fa6e2b3dc2d0cefd3dbd6fc7d52cdb122afe9'
ROOT = Path('/opt/iz-click/plane-app')
BASE_API = 'izclick-api:task-intake-9d2f163a17fe'
BASE_WEB = 'izclick-web:task-intake-9d2f163a17fe'
FILES = {
 'plane/api/views/issue.py': '06fcec44bf6b12e4a379ea04347976db9f17b9af7a56c6b60678e7c4cac2dfb1',
 'plane/app/views/issue/base.py': '00bd2a381d255039547899abf5092faa8e61595b8473db539491c0a2ba73d4ce',
 'plane/utils/izclick_issue_intake.py': 'cf7d977b535ee1b6e0c1740d4675fb76d36a2ca4f18893346973f0d7af159cfd',
}
SERVICES = ['api', 'worker', 'beat-worker', 'web']


def emit(check, **data):
    print(json.dumps(dict(check=check, **data)), flush=True)


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def inspect(name):
    return json.loads(subprocess.check_output(['docker', 'inspect', name]))[0]


def compose_chain(api, web):
    labels = api['Config']['Labels']
    paths = labels['com.docker.compose.project.config_files'].split(',')
    if paths != web['Config']['Labels']['com.docker.compose.project.config_files'].split(','):
        raise RuntimeError('API y web tienen configuraciones distintas; no se modifica nada')
    if not paths or any(not Path(p).is_file() for p in paths):
        raise RuntimeError('Falta una configuracion Compose activa')
    command = ['docker', 'compose', '-p', labels['com.docker.compose.project']]
    for path in paths:
        command += ['-f', path]
    return command


def save(path, data):
    path.write_text(json.dumps(data, indent=2), encoding='utf-8')
    path.chmod(0o600)


def fingerprint(container_id, path):
    data = subprocess.check_output(['docker', 'exec', container_id, 'cat', '/code/' + path])
    return hashlib.sha256(data).hexdigest()


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
        if api['Config']['Image'] != BASE_API or web['Config']['Image'] != BASE_WEB:
            raise RuntimeError('La version instalada cambio; no se modifica nada')
        command = compose_chain(api, web)
        containers = {service: inspect('plane-app-' + service + '-1') for service in SERVICES}
        for service, container in containers.items():
            if not container['State']['Running']:
                raise RuntimeError(service + ' no esta ejecutandose')
            expected = web['Image'] if service == 'web' else api['Image']
            if container['Image'] != expected:
                raise RuntimeError('API/worker/planificador no coinciden')
        for path, expected in FILES.items():
            if fingerprint(api['Id'], path) != expected:
                raise RuntimeError('Codigo instalado distinto en ' + path)
        if not healthy():
            raise RuntimeError('El sitio no supera la comprobacion inicial')
        emit('preflight', revision=REV, production_unchanged=True)
        if not options.apply:
            return
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        directory = ROOT / ('direct-assignment-backup-' + stamp)
        directory.mkdir(mode=0o700)
        save(directory / 'previous-images.json', {s: c['Image'] for s, c in containers.items()})
        # Preserve exact Compose bytes privately. Never print merged environment.
        config_dir = directory / 'compose-files'
        config_dir.mkdir(mode=0o700)
        for i, path in enumerate(api['Config']['Labels']['com.docker.compose.project.config_files'].split(',')):
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
        api_tag = 'izclick-api:direct-' + REV[:12]
        web_tag = 'izclick-web:direct-' + REV[:12]
        dockerfile = directory / 'Dockerfile.api'
        dockerfile.write_text('FROM ' + api['Image'] + '\n' + ''.join(
            'COPY apps/api/' + path + ' /code/' + path + '\n' for path in FILES
        ) + 'RUN python -m compileall -q /code/plane\n')
        build(['docker', 'build', '-t', api_tag, '-f', str(dockerfile), str(source)], directory, 'api')
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
        api_image, web_image = inspect(api_tag)['Id'], inspect(web_tag)['Id']
        override = directory / 'docker-compose.direct.json'
        save(override, {'services': {s: {'image': web_image if s == 'web' else api_image} for s in SERVICES}})
        rollback = directory / 'docker-compose.rollback.json'
        save(rollback, {'services': {s: {'image': c['Image']} for s, c in containers.items()}})
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
                correct = all(inspect('plane-app-' + s + '-1')['Image'] == (web_image if s == 'web' else api_image) for s in SERVICES)
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
