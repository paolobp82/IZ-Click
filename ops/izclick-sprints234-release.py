#!/usr/bin/env python3
"""Pinned Sprints 2-4 release. Default: read-only preflight on administrator console.
Apply with --apply. API, Web and worker must match the deployed Sprint 1 digests.
Only the reviewed 0125 assignment migration; no database restoration, SSH changes or volume deletion.
"""
import argparse
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import time

ROOT = Path('/opt/iz-click/plane-app')
REVISION = 'c8a69d3749b957d853d4b1f58760e45e66f04351'
BASE_API = 'ghcr.io/paolobp82/izclick-api@sha256:34958845a91dd29e09cb70a26b57f9389b0a6084520100cfa9007c3bc81a1f09'
BASE_WEB = 'ghcr.io/paolobp82/izclick-web@sha256:35df3bc5afe62e305b7c0929e19c28e79d73bf321eea051107e7ec8bc94fced2'
API = 'ghcr.io/paolobp82/izclick-api@sha256:e5b3647ae703b489931ef8bcddb4d51b771ff7a8da3d48409a1c4851613fe138'
WEB = 'ghcr.io/paolobp82/izclick-web@sha256:56fe22efb6f5a15ecba23f92ee22704ef4764624202eeb38a82c13673bacc174'
SERVICES = ('api', 'worker', 'web')


def report(check, **fields):
    print(json.dumps(dict(check=check, **fields)), flush=True)


def run(argv, *, source=None, timeout=120, output=None):
    result = subprocess.run(argv, input=source, stdout=output or subprocess.PIPE,
                            stderr=subprocess.PIPE, timeout=timeout, check=False)
    if result.returncode:
        # Compose errors may contain credentials; never echo raw output.
        raise RuntimeError(f'{argv[0]} operation failed (exit {result.returncode})')
    return result.stdout


def inspect(name):
    return json.loads(run(['docker', 'inspect', name]))[0]


def image_info(name):
    return json.loads(run(['docker', 'image', 'inspect', name]))[0]


def environment(container):
    return dict(value.split('=', 1) for value in container['Config']['Env'])


def escape(value):
    if isinstance(value, str):
        return value.replace('$', '$$')
    if isinstance(value, list):
        return [escape(item) for item in value]
    return value


def service_override(container, image):
    config, host = container['Config'], container['HostConfig']
    service = {
        'image': image,
        'environment': {key: escape(value) for key, value in environment(container).items()},
        'command': escape(config['Cmd']), 'entrypoint': escape(config['Entrypoint']),
        'user': escape(config.get('User', '')), 'working_dir': escape(config.get('WorkingDir', '')),
        'mem_limit': host.get('Memory', 0), 'memswap_limit': host.get('MemorySwap', 0),
        'cpus': host.get('NanoCpus', 0) / 1_000_000_000,
        'shm_size': host.get('ShmSize', 67108864),
        'cpu_period': host.get('CpuPeriod', 0), 'cpu_quota': host.get('CpuQuota', 0),
        'cpu_shares': host.get('CpuShares', 0), 'cpuset': host.get('CpusetCpus', ''),
    }
    policy = host.get('RestartPolicy', {})
    service['restart'] = policy.get('Name') or 'no'
    if service['restart'] == 'on-failure' and policy.get('MaximumRetryCount'):
        service['restart'] += ':' + str(policy['MaximumRetryCount'])
    if host.get('PidsLimit') is not None:
        service['pids_limit'] = host['PidsLimit']
    return service


def validate_runtime(previous, live, expected_image):
    if live['Image'] != expected_image:
        raise RuntimeError('Runtime candidate image mismatch')
    if environment(live) != environment(previous):
        raise RuntimeError('Runtime environment mismatch')
    for key in ('Cmd', 'Entrypoint', 'User', 'WorkingDir'):
        if live['Config'].get(key) != previous['Config'].get(key):
            raise RuntimeError('Runtime command or execution identity changed')
    for key in ('Memory', 'MemorySwap', 'NanoCpus', 'ShmSize', 'PidsLimit', 'CpuPeriod',
                'CpuQuota', 'CpuShares', 'CpusetCpus', 'RestartPolicy', 'ReadonlyRootfs',
                'Privileged', 'CapAdd', 'CapDrop', 'SecurityOpt', 'GroupAdd', 'Ulimits'):
        if live['HostConfig'].get(key) != previous['HostConfig'].get(key):
            raise RuntimeError('Runtime resource or security configuration changed')


def validate_layout(config, name, container):
    service, desired = config['services'][name], []
    for volume in service.get('volumes', []):
        if volume['type'] == 'volume':
            source = config['volumes'][volume['source']]['name']
        elif volume['type'] == 'bind':
            source = str(Path(volume['source']).resolve())
        else:
            raise RuntimeError('Unsupported mount type; no deployment')
        desired.append((volume['type'], source, volume['target'], not volume.get('read_only', False)))
    actual = [(item['Type'], item.get('Name') if item['Type'] == 'volume' else item['Source'],
               item['Destination'], item['RW']) for item in container['Mounts']]
    if sorted(desired) != sorted(actual):
        raise RuntimeError(f'{name}: Compose mounts differ from runtime')
    networks = {config['networks'][key]['name'] for key in service.get('networks', {})}
    if networks != set(container['NetworkSettings']['Networks']):
        raise RuntimeError(f'{name}: Compose networks differ from runtime')
    if service.get('ports') or container['HostConfig'].get('PortBindings'):
        raise RuntimeError(f'{name}: unexpected published ports')


def private_json(path, value):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w') as stream:
        json.dump(value, stream)


def http_ok(path):
    try:
        code = run(['curl', '-q', '-sS', '--resolve', 'izclick.izango.com.pe:443:127.0.0.1',
                    '--connect-timeout', '2', '--max-time', '10', '-o', '/dev/null',
                    '-w', '%{http_code}', 'https://izclick.izango.com.pe' + path], timeout=15)
        return code.decode().strip() == '200'
    except (RuntimeError, subprocess.TimeoutExpired):
        return False


def wait_ready():
    started = time.monotonic()
    deadline, stable, last_report = started + 720, 0, -30
    while time.monotonic() < deadline:
        api_ok, web_ok = http_ok('/api/instances/'), http_ok('/')
        stable = stable + 1 if api_ok and web_ok else 0
        elapsed = int(time.monotonic() - started)
        if elapsed - last_report >= 20:
            report('readiness', seconds=elapsed, api_ok=api_ok, web_ok=web_ok, stable=stable)
            last_report = elapsed
        if stable >= 3:
            return
        time.sleep(5)
    raise RuntimeError('HTTP readiness failed')


def worker_smoke():
    source = b"""import os, socket
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'plane.settings.production')
import django
django.setup()
from plane.celery import app
from plane.bgtasks.work_item_link_task import is_production_link
assert is_production_link({'izclick_kind': 'event-date'})
node = 'celery@' + socket.gethostname()
assert app.control.ping(destination=[node], timeout=10), 'Updated worker did not reply'
"""
    run(['docker', 'exec', '-i', 'plane-app-worker-1', 'python', '-'], source=source, timeout=40)



def migrate_assignment_type(compose, override):
    # Refuse every unexpected migration and every backward plan before any write.
    source = """import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'plane.settings.production')
import django
django.setup()
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
executor = MigrationExecutor(connection)
target = [('db', '0125_izclick_assignment_fields')]
plan = executor.migration_plan(target)
assert all(not backwards and (migration.app_label, migration.name) in target for migration, backwards in plan), 'Unexpected migration plan'
executor.migrate(target)
print('IZCLICK_MIGRATION_OK')
"""
    result = run(compose + ['-f', str(override), 'run', '--rm', '--no-deps', '-T',
                            '--entrypoint', 'python', 'api', '-c', source], timeout=180)
    if b'IZCLICK_MIGRATION_OK' not in result:
        raise RuntimeError('Assignment migration did not confirm completion')
    report('migration_verified', migration='0125_izclick_assignment_fields', backward_compatible=True)

def apply(args):
    containers = {name: inspect('plane-app-' + name + '-1') for name in SERVICES}
    if containers['api']['Image'] != image_info(BASE_API)['Id'] or containers['web']['Image'] != image_info(BASE_WEB)['Id'] or containers['worker']['Image'] != image_info(BASE_API)['Id']:
        raise RuntimeError('API/Web/worker baseline changed since reviewed release; no deployment')
    labels = containers['api']['Config']['Labels']
    project = labels['com.docker.compose.project']
    if project != 'plane-app' or Path(labels['com.docker.compose.project.working_dir']).resolve() != ROOT:
        raise RuntimeError('Unexpected Compose project')
    for name, container in containers.items():
        own = container['Config']['Labels']
        if own.get('com.docker.compose.project') != project or own.get('com.docker.compose.service') != name:
            raise RuntimeError('Unexpected container identity')
        if not container['State']['Running']:
            raise RuntimeError('A release service is not running')
    files = [Path(path).resolve() for path in labels['com.docker.compose.project.config_files'].split(',')]
    if any(not path.is_relative_to(ROOT) or not path.is_file() for path in files):
        raise RuntimeError('Compose files must exist inside installation directory')
    env_file = ROOT / 'plane.env'
    if not env_file.is_file():
        raise RuntimeError('plane.env missing')
    compose = ['docker', 'compose', '--env-file', str(env_file), '--project-directory', str(ROOT), '-p', project]
    for path in files:
        compose += ['-f', str(path)]
    config = json.loads(run(compose + ['config', '--format', 'json']))
    for name in SERVICES:
        validate_layout(config, name, containers[name])
    worker_id = containers['worker']['Image']
    report('preflight', api_baseline_verified=True, web_baseline_verified=True, worker_baseline_verified=True,
           worker_image=worker_id, candidate_revision=REVISION, production_unchanged=True)
    if not args.apply:
        return
    candidates = {'api': API, 'worker': API, 'web': WEB}
    for target in (API, WEB):
        report('image_pulling', image=target, timeout_seconds=600)
        run(['docker', 'pull', target], timeout=600)
        if image_info(target)['Config'].get('Labels', {}).get('org.opencontainers.image.revision') != REVISION:
            raise RuntimeError('Candidate revision mismatch')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup = ROOT / ('sprints234-backup-' + stamp)
    backup.mkdir(mode=0o700)
    private_json(backup / 'runtime-before.json', containers)
    private_json(backup / 'compose-before.json', config)
    (backup / 'plane.env').write_bytes(env_file.read_bytes())
    for index, path in enumerate(files):
        (backup / f'compose-{index}.yaml').write_bytes(path.read_bytes())
    override = ROOT / ('docker-compose.izclick-sprints234-' + stamp + '.json')
    rollback_file = backup / 'rollback.json'
    private_json(override, {'services': {name: service_override(containers[name], candidates[name]) for name in SERVICES}})
    private_json(rollback_file, {'services': {name: service_override(containers[name], containers[name]['Image']) for name in SERVICES}})
    for path in (override, rollback_file):
        desired = json.loads(run(compose + ['-f', str(path), 'config', '--format', 'json']))
        for name in SERVICES:
            validate_layout(desired, name, containers[name])
            if desired['services'][name]['environment'] != environment(containers[name]):
                raise RuntimeError('Unexpected environment change; no deployment')
    report('backup_starting', directory=str(backup))
    with open(backup / 'database.dump', 'wb') as stream:
        run(['docker', 'exec', 'plane-app-plane-db-1', 'sh', '-c',
             'db_user="$POSTGRES_USER"; db_name="$POSTGRES_DB"; test -n "$db_user" || db_user=plane; test -n "$db_name" || db_name=plane; PGHOST=/var/run/postgresql exec pg_dump -Fc -U "$db_user" -d "$db_name"'],
            timeout=300, output=stream)
    with open(backup / 'database.dump', 'rb') as stream:
        result = subprocess.run(['docker', 'exec', '-i', 'plane-app-plane-db-1', 'pg_restore', '--list'],
                                stdin=stream, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=120)
        if result.returncode:
            raise RuntimeError('Backup archive invalid; no deployment')
    def command(path):
        return compose + ['-f', str(path), 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', *SERVICES]
    rollback = command(rollback_file)
    private_json(backup / 'rollback-command.json', rollback)
    ids = run(['docker', 'ps', '-q', '--filter', 'label=com.docker.compose.project=' + project]).decode().split()
    others = json.loads(run(['docker', 'inspect'] + ids))
    unchanged = {item['Name']: item['Id'] for item in others if item['Id'] not in {c['Id'] for c in containers.values()}}
    report('backup_ready', directory=str(backup), archive_valid=True)
    services_changed = False
    try:
        report('migration_starting', migration='0125_izclick_assignment_fields')
        migrate_assignment_type(compose, override)
        report('services_recreating', services=list(SERVICES))
        services_changed = True
        run(command(override), timeout=240)
        for name in SERVICES:
            live = inspect('plane-app-' + name + '-1')
            validate_runtime(containers[name], live, image_info(candidates[name])['Id'])
            validate_layout(config, name, live)
        wait_ready()
        worker_smoke()
        for name, old_id in unchanged.items():
            if inspect(name)['Id'] != old_id:
                raise RuntimeError('Unexpected change to another service')
        report('release_applied', revision=REVISION, active_override=str(override),
               backup=str(backup), authenticated_browser_check_pending=True)
    except Exception:
        if not services_changed:
            report('migration_stopped', production_images_unchanged=True)
            raise
        report('verification_failed', restoring_previous_images=True, database_restore=False)
        run(rollback, timeout=240)
        for name in SERVICES:
            validate_runtime(containers[name], inspect('plane-app-' + name + '-1'), containers[name]['Image'])
        wait_ready()
        report('rollback_complete', authenticated_browser_check_pending=True)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise RuntimeError('Run from the VPS administrator console with sudo')
    os.umask(0o077)
    with open(ROOT / '.izclick-repair.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        apply(args)


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        report('release_stopped', error=type(exc).__name__,
               reason=str(exc) if isinstance(exc, RuntimeError) else 'Operation could not complete')
        raise SystemExit(1)

