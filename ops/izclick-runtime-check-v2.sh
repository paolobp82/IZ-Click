#!/usr/bin/env bash
# Read-only. Each container-side child has its own deadline and is reaped.
# No migrations, service changes, cache keys, configuration values, or user data.
set -Eeuo pipefail
export LC_ALL=C
echo IZCLICK_RUNTIME_CHECK_V2
date -u '+utc=%Y-%m-%dT%H:%M:%SZ'
docker exec -i plane-app-api-1 python - <<'PY'
import ast
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

def emit(label, **values):
    print(json.dumps(dict(check=label, **values), sort_keys=True), flush=True)

active = []
def deadline(signum, frame):
    for child in active:
        child.kill()
        child.wait()
    emit('diagnostic_deadline', seconds=80)
    os._exit(124)

signal.signal(signal.SIGALRM, deadline)
signal.alarm(80)

def run_probe(label, source, seconds):
    started = time.monotonic()
    child = subprocess.Popen([sys.executable, '-u', '-c', source], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    active.append(child)
    timed_out = False
    try:
        stdout, _ = child.communicate(timeout=seconds)
    except subprocess.TimeoutExpired:
        timed_out = True
        child.kill()
        stdout, _ = child.communicate()
    finally:
        active.remove(child)
    # Only controlled JSON records reach the console, never raw Django logs.
    for line in stdout.splitlines():
        try:
            row = json.loads(line)
            if isinstance(row, dict) and isinstance(row.get('check'), str):
                print(json.dumps(row, sort_keys=True), flush=True)
        except (ValueError, TypeError):
            pass
    emit(label, exit_code=child.returncode, timed_out=timed_out, seconds=round(time.monotonic()-started, 4))

root = Path.cwd()
for label, relative in (
    ('catalog_source', 'plane/app/views/workspace/izclick_production_status.py'),
    ('catalog_models_source', 'plane/db/models/izclick_production_status.py'),
    ('custom_fields_source', 'plane/db/models/izclick_custom_field.py'),
):
    target = root / relative
    values = {'present': target.is_file()}
    if label == 'catalog_source' and target.is_file():
        tree = ast.parse(target.read_text())
        values['serializer_defined_or_imported'] = any(
            (isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == 'serialize_status')
            or (isinstance(node, ast.ImportFrom) and any((item.asname or item.name) == 'serialize_status' for item in node.names))
            for node in tree.body
        )
    emit(label, **values)

urls = root / 'plane/app/urls/workspace.py'
emit('catalog_url_source', declared=urls.is_file() and 'izclick-production-statuses/' in urls.read_text())
emit('secret_key_check', insecure_placeholder=os.environ.get('SECRET_KEY') in {
    '60gp0byfz2dvffa45cxl20p1scy9xbpf6d8c5y0geejgkyp1b5', 'change-this-key-on-deployment'
}, configured=bool(os.environ.get('SECRET_KEY')))

def cpu_metadata(label):
    values = {'available_cpus': len(os.sched_getaffinity(0))}
    for filename in ('cpu.max', 'cpu.stat'):
        target = Path('/sys/fs/cgroup') / filename
        if target.is_file():
            values[filename] = target.read_text().strip()
    emit(label, **values)

cpu_metadata('cpu_before')
common = '''
import json, os, time
def emit(label, **values):
    print(json.dumps(dict(check=label, **values)), flush=True)
'''
run_probe('redis_process', common + '''
import redis
url = os.environ.get('REDIS_URL')
emit('redis_config', configured=bool(url))
if url:
    for sample in range(1, 4):
        started = time.monotonic()
        try:
            with redis.Redis.from_url(url, socket_connect_timeout=2, socket_timeout=2) as client:
                ok = bool(client.ping())
            emit('redis_ping', sample=sample, ok=ok, seconds=round(time.monotonic()-started, 4))
        except Exception as exc:
            emit('redis_ping', sample=sample, error=type(exc).__name__, seconds=round(time.monotonic()-started, 4))
''', 16)

run_probe('postgres_process', common + '''
import psycopg
url = os.environ.get('DATABASE_URL')
emit('postgres_config', configured=bool(url))
if url:
    for sample in range(1, 4):
        started = time.monotonic()
        try:
            with psycopg.connect(url, connect_timeout=3, options='-c default_transaction_read_only=on -c statement_timeout=3000') as conn:
                with conn.cursor() as cursor:
                    cursor.execute('SELECT 1')
                    ok = cursor.fetchone()[0] == 1
                    emit('postgres_select', sample=sample, ok=ok, seconds=round(time.monotonic()-started, 4))
                    if sample == 1:
                        for table in ('izclick_production_statuses', 'izclick_production_status_bindings', 'izclick_project_custom_fields', 'izclick_issue_custom_field_values'):
                            cursor.execute('SELECT to_regclass(%s) IS NOT NULL', ('public.' + table,))
                            emit('custom_table', table=table, present=cursor.fetchone()[0])
        except Exception as exc:
            emit('postgres_select', sample=sample, error=type(exc).__name__, seconds=round(time.monotonic()-started, 4))
''', 24)

run_probe('django_process', common + '''
import signal, sys
from pathlib import Path
started = time.monotonic()
def stack_at_deadline(signum, frame):
    frames = []
    while frame is not None:
        frames.append({'file': Path(frame.f_code.co_filename).name, 'function': frame.f_code.co_name, 'line': frame.f_lineno})
        frame = frame.f_back
    emit('django_stack_at_deadline', seconds=round(time.monotonic()-started, 4), stack=frames[:20])
    os._exit(124)
signal.signal(signal.SIGALRM, stack_at_deadline)
signal.alarm(20)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'plane.settings.production')
try:
    import django
    django.setup()
    emit('django_setup', seconds=round(time.monotonic()-started, 4))
    from django.urls import resolve, Resolver404
    try:
        match = resolve('/api/workspaces/diagnostic/izclick-production-statuses/')
        emit('catalog_runtime_route', matched_expected_route=match.url_name == 'izclick-production-statuses')
    except Resolver404:
        emit('catalog_runtime_route', matched_expected_route=False)
except Exception as exc:
    emit('django_error', error=type(exc).__name__)
    sys.exit(1)
''', 25)
cpu_metadata('cpu_after')
signal.alarm(0)
PY
echo IZCLICK_RUNTIME_CHECK_V2_DONE
