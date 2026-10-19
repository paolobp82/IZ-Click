#!/usr/bin/env python3
"""Administrator-console API-only repair, with backups and automatic API rollback.

Usage: sudo python3 SCRIPT IMAGE@sha256:DIGEST --revision SOURCE_SHA [--check-only]
No migrations, frontend changes, volume deletion, or database restoration.
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

ROOT = Path('/opt/iz-click/plane-app')
OLD_API = 'sha256:31e7edf9ad2185ff91a27d01514cf444af697b6d9f156493ed1adacf0a97efbf'
OLD_WEB = 'sha256:191ce35fce42898abb2fc65b00c3e4698943251bcca0f9eba1d302de508b96e8'


def report(check, **fields):
    print(json.dumps(dict(check=check, **fields), sort_keys=True), flush=True)


def run(argv, *, source=None, timeout=120, output=None):
    result = subprocess.run(argv, input=source, stdout=output or subprocess.PIPE,
                            stderr=subprocess.PIPE, timeout=timeout, check=False)
    if result.returncode:
        # Subprocess stderr may contain environment values; do not print it.
        raise RuntimeError(f'{argv[0]} operation failed (exit {result.returncode})')
    return result.stdout


def inspect(name):
    return json.loads(run(['docker', 'inspect', name]))[0]


def private_json(path, value):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w') as stream:
        json.dump(value, stream)


def runtime_environment(api, workers):
    environment = dict(item.split('=', 1) for item in api['Config']['Env'])
    environment['GUNICORN_WORKERS'] = str(workers)
    return environment


def override(api, image, workers):
    # Compose must not reinterpret literal dollar signs in existing credentials.
    environment = {key: value.replace('$', '$$') for key, value in runtime_environment(api, workers).items()}
    return {'services': {'api': {
        'image': image, 'environment': environment,
        'command': api['Config']['Cmd'], 'entrypoint': api['Config']['Entrypoint'],
    }}}


def validate_layout(config, api):
    service = config['services']['api']
    desired_mounts = []
    for volume in service.get('volumes', []):
        if volume['type'] == 'volume':
            source = config['volumes'][volume['source']]['name']
        elif volume['type'] == 'bind':
            source = str(Path(volume['source']).resolve())
        else:
            raise RuntimeError('Unsupported API mount type; manual review required')
        desired_mounts.append((volume['type'], source, volume['target'], not volume.get('read_only', False)))
    actual_mounts = [(item['Type'], item.get('Name') if item['Type'] == 'volume' else item['Source'],
                      item['Destination'], item['RW']) for item in api['Mounts']]
    if sorted(desired_mounts) != sorted(actual_mounts):
        raise RuntimeError('Compose API mounts differ from running container; no deployment')
    desired_networks = {config['networks'][key]['name'] for key in service.get('networks', {})}
    if desired_networks != set(api['NetworkSettings']['Networks']):
        raise RuntimeError('Compose API networks differ from running container; no deployment')
    if service.get('ports'):
        raise RuntimeError('Unexpected API host ports; manual review required')


def http_sample():
    argv = ['curl', '-q', '-sS', '--resolve', 'izclick.izango.com.pe:443:127.0.0.1',
            '--connect-timeout', '2', '--max-time', '10', '-o', '/dev/null',
            '-w', '%{http_code} %{time_starttransfer} %{time_total}',
            'https://izclick.izango.com.pe/api/instances/']
    try:
        fields = run(argv, timeout=15).decode().split()
        return {'status': int(fields[0]), 'ttfb': float(fields[1]), 'seconds': float(fields[2])}
    except (RuntimeError, subprocess.TimeoutExpired, ValueError, IndexError):
        return {'status': 0}


SMOKE = r'''
import json, os, signal, time, uuid
def emit(check, **fields):
    print(json.dumps(dict(check=check, **fields)), flush=True)
def stop(signum, frame):
    emit('catalogue_transaction_test', ok=False, reason='deadline')
    os._exit(124)
signal.signal(signal.SIGALRM, stop)
signal.alarm(90)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'plane.settings.production')
try:
    import django
    django.setup()
    from django.db import transaction
    from django.urls import resolve
    from rest_framework.test import APIRequestFactory, force_authenticate
    from plane.db.models import State, Issue, WorkspaceMember
    from plane.db.models import IzClickProductionStatus, IzClickProductionStatusBinding
    member = WorkspaceMember.objects.filter(role=20, is_active=True).select_related('workspace', 'member').first()
    if member is None:
        raise RuntimeError('No admin test identity available')
    url = '/api/workspaces/' + member.workspace.slug + '/izclick-production-statuses/'
    factory = APIRequestFactory()
    def request(method, path, data=None):
        match = resolve(path)
        req = getattr(factory, method)(path, data=data, format='json')
        req.resolver_match = match
        force_authenticate(req, user=member.member)
        return match.func(req, **match.kwargs)
    def snapshot():
        return (
            list(State.all_state_objects.order_by('id').values_list('id', 'name', 'color', 'group', 'default', 'sequence')),
            list(Issue.objects.order_by('id').values_list('id', 'state_id')),
            list(IzClickProductionStatus.objects.order_by('id').values_list('id', 'name', 'color', 'group')),
            list(IzClickProductionStatusBinding.objects.order_by('id').values_list('id', 'status_id', 'plane_state_id')),
        )
    with transaction.atomic():
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
            cursor.execute("SET LOCAL statement_timeout = '5000ms'")
            cursor.execute("SET LOCAL lock_timeout = '3000ms'")
        before = snapshot()
        with transaction.atomic():
            name = '__IZCLICK_VERIFY_' + uuid.uuid4().hex[:12]
            created = request('post', url, {'name': name, 'color': '#123456', 'group': 'unstarted', 'sequence': 999999})
            assert created.status_code == 201, 'create_failed'
            entry_id = created.data['id']
            assert request('post', url, {'name': name}).status_code == 409, 'duplicate_failed'
            listing = request('get', url)
            assert listing.status_code == 200 and any(row['id'] == entry_id for row in listing.data), 'list_failed'
            assert request('patch', url + entry_id + '/', {'name': name + '_EDIT'}).status_code == 200, 'patch_failed'
            transaction.set_rollback(True)
        assert snapshot() == before, 'rollback_or_identity_check_failed'
    emit('catalogue_transaction_test', ok=True, create=True, duplicate=True, list=True, patch=True, original_identities_preserved=True, test_changes_rolled_back=True)
except Exception as exc:
    emit('catalogue_transaction_test', ok=False, error=type(exc).__name__)
    raise SystemExit(1)
'''


def smoke():
    # Keep raw library logs out of the console. The child has its own deadline.
    output = run(['docker', 'exec', '-i', 'plane-app-api-1', 'python', '-'],
                 source=SMOKE.encode(), timeout=100)
    accepted = False
    for line in output.decode().splitlines():
        try:
            item = json.loads(line)
            if isinstance(item, dict) and item.get('check') == 'catalogue_transaction_test':
                print(json.dumps(item), flush=True)
                accepted = item.get('ok') is True
        except ValueError:
            pass
    if not accepted:
        raise RuntimeError('Catalogue transaction verification did not pass')


def main():
    import fcntl
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('image')
    parser.add_argument('--revision', required=True)
    parser.add_argument('--check-only', action='store_true')
    args = parser.parse_args()
    if not re.fullmatch(r'ghcr\.io/paolobp82/izclick-api@sha256:[0-9a-f]{64}', args.image):
        raise RuntimeError('An immutable IZ-Click API digest is required')
    if not re.fullmatch(r'[0-9a-f]{40}', args.revision):
        raise RuntimeError('An exact source revision is required')
    if os.geteuid() != 0:
        raise RuntimeError('Run from the VPS administrator console with sudo')
    os.umask(0o077)
    with open(ROOT / '.izclick-repair.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        apply(args)


def apply(args):
    api, web = inspect('plane-app-api-1'), inspect('plane-app-web-1')
    if api['Image'] != OLD_API or web['Image'] != OLD_WEB:
        raise RuntimeError('Live API/Web differ from reviewed incident baseline; no deployment')
    labels = api['Config']['Labels']
    if Path(labels['com.docker.compose.project.working_dir']).resolve() != ROOT:
        raise RuntimeError('Unexpected Compose working directory')
    files = [Path(path).resolve() for path in labels['com.docker.compose.project.config_files'].split(',')]
    if any(not path.is_relative_to(ROOT) or not path.is_file() for path in files):
        raise RuntimeError('Compose files must exist inside the installation directory')
    env_file = ROOT / 'plane.env'
    if not env_file.is_file():
        raise RuntimeError('Expected plane.env is missing; no deployment')
    compose = ['docker', 'compose', '--env-file', str(env_file), '--project-directory', str(ROOT), '-p', labels['com.docker.compose.project']]
    for path in files:
        compose.extend(['-f', str(path)])
    config = json.loads(run(compose + ['config', '--format', 'json']))
    validate_layout(config, api)
    report('reviewed_baseline', compose_files=len(files), api_only=True, intended_workers=2)
    report('http_before', **http_sample())
    if args.check_only:
        report('check_only_complete', production_unchanged=True)
        return
    run(['docker', 'pull', args.image], timeout=300)
    candidate = json.loads(run(['docker', 'image', 'inspect', args.image]))[0]
    if candidate['Config'].get('Labels', {}).get('org.opencontainers.image.revision') != args.revision:
        raise RuntimeError('Candidate image source revision mismatch')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup = ROOT / ('repair-backup-' + stamp)
    backup.mkdir(mode=0o700)
    private_json(backup / 'api-before.json', api)
    private_json(backup / 'compose-before.json', config)
    (backup / 'plane.env').write_bytes(env_file.read_bytes())
    for index, path in enumerate(files):
        target = backup / f'compose-{index}.yaml'
        target.write_bytes(path.read_bytes())
    old_image = json.loads(run(['docker', 'image', 'inspect', OLD_API]))[0]['RepoDigests'][0]
    old_workers = dict(item.split('=', 1) for item in api['Config']['Env']).get('GUNICORN_WORKERS', '1')
    rollback_file = backup / 'rollback.json'
    private_json(rollback_file, override(api, old_image, old_workers))
    final_file = ROOT / ('docker-compose.izclick-repair-' + stamp + '.json')
    private_json(final_file, override(api, args.image, 2))
    desired = json.loads(run(compose + ['-f', str(final_file), 'config', '--format', 'json']))
    validate_layout(desired, api)
    expected_environment = runtime_environment(api, 2)
    if desired['services']['api'].get('environment') != expected_environment:
        raise RuntimeError('Compose introduces unexpected environment changes; no deployment')
    dump_command = ['docker', 'exec', 'plane-app-plane-db-1', 'sh', '-c',
                    'PGHOST=/var/run/postgresql exec pg_dump -Fc -U "${POSTGRES_USER:-plane}" -d "${POSTGRES_DB:-plane}"']
    with open(backup / 'database.dump', 'wb') as stream:
        run(dump_command, timeout=180, output=stream)
    with open(backup / 'database.dump', 'rb') as stream:
        result = subprocess.run(['docker', 'exec', '-i', 'plane-app-plane-db-1', 'pg_restore', '--list'],
                                stdin=stream, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=120)
        if result.returncode:
            raise RuntimeError('Database backup archive validation failed; no deployment')
    rollback = compose + ['-f', str(rollback_file), 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'api']
    private_json(backup / 'rollback-command.json', rollback)
    report('backup_ready', directory=str(backup), archive_valid=True)
    other_names = run(['docker', 'ps', '-q', '--filter', 'label=com.docker.compose.project=' + labels['com.docker.compose.project']]).decode().split()
    other_ids = {item['Name']: item['Id'] for item in json.loads(run(['docker', 'inspect'] + other_names)) if item['Name'] != '/plane-app-api-1'}
    try:
        run(compose + ['-f', str(final_file), 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'api'], timeout=180)
        healthy = False
        readiness_started = time.monotonic()
        readiness_deadline = readiness_started + 720
        stable = 0
        while time.monotonic() < readiness_deadline:
            sample = http_sample()
            report('api_readiness', elapsed=int(time.monotonic() - readiness_started), http=sample['status'], stable=stable)
            if sample['status'] == 200:
                stable += 1
                if stable >= 3:
                    healthy = True
                    break
            else:
                stable = 0
            time.sleep(5)
        if not healthy:
            raise RuntimeError('API readiness did not recover')
        live = inspect('plane-app-api-1')
        if live['Image'] != candidate['Id']:
            raise RuntimeError('Running API does not match candidate image')
        smoke()
        for name, previous_id in other_ids.items():
            if inspect(name)['Id'] != previous_id:
                raise RuntimeError('A non-API container changed unexpectedly')
        for sample in range(3):
            measured = http_sample()
            report('http_after', sample=sample + 1, **measured)
            if measured['status'] != 200:
                raise RuntimeError('API failed a post-repair HTTP verification')
        report('api_repair_applied', image=args.image, frontend_unchanged=True, other_services_unchanged=True,
               active_override=str(final_file), backup=str(backup), sustained_performance_verification_pending=True)
    except Exception:
        report('verification_failed', restoring_previous_api=True, database_restore=False)
        run(rollback, timeout=180)
        report('api_rollback_complete', image=old_image, **http_sample())
        raise


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        report('repair_stopped', error=type(exc).__name__, reason=str(exc) if isinstance(exc, RuntimeError) else 'Operation could not complete')
        sys.exit(1)
