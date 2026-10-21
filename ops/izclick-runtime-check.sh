#!/usr/bin/env bash
# Read-only incident check. Run from the VPS administrator console.
# Does not restart services, change settings, install files, or write application data.
set -Eeuo pipefail
export LC_ALL=C
echo IZCLICK_RUNTIME_CHECK_V1
date -u '+utc=%Y-%m-%dT%H:%M:%SZ'
echo '--host scheduling (last column st is CPU steal)--'
if command -v vmstat >/dev/null; then vmstat 1 4; fi
echo '--live image identities--'
docker inspect --format '{{.Name}}|{{.Config.Image}}|{{.Image}}|restarts={{.RestartCount}}|oom={{.State.OOMKilled}}' plane-app-api-1 plane-app-web-1
echo '--inside API: routes, workers and dependency timings--'
timeout 50 docker exec -i plane-app-api-1 python - <<'PY'
import importlib
import json
import os
from pathlib import Path
import time

def emit(label, **values):
    print(json.dumps(dict(check=label, **values), sort_keys=True), flush=True)

# Never print full process arguments or environment variables.
for process in Path('/proc').glob('[0-9]*/cmdline'):
    try:
        argv = process.read_bytes().decode(errors='replace').split('\0')
        if not any('gunicorn' in arg for arg in argv[:2]):
            continue
        selected = {}
        for index, arg in enumerate(argv):
            for flag in ('-w', '--workers', '-k', '--worker-class', '-t', '--timeout'):
                if arg == flag and index + 1 < len(argv):
                    selected[flag] = argv[index + 1][:80]
                elif arg.startswith(flag + '='):
                    selected[flag] = arg.split('=', 1)[1][:80]
        emit('gunicorn_process', pid=int(process.parent.name), options=selected)
    except (OSError, ValueError):
        pass

started = time.monotonic()
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'plane.settings.production')
import django
django.setup()
emit('django_setup', seconds=round(time.monotonic() - started, 4))

from django.conf import settings
from django.urls import resolve, Resolver404
for label, route in (
    ('native_states', '/api/workspaces/diagnostic/projects/00000000-0000-0000-0000-000000000001/states/'),
    ('production_catalog', '/api/workspaces/diagnostic/izclick-production-statuses/'),
):
    try:
        match = resolve(route)
        emit(label, registered=True, view=getattr(match.func, 'view_class', getattr(match.func, 'cls', type(None))).__name__)
    except Resolver404:
        emit(label, registered=False)

try:
    module = importlib.import_module('plane.app.views.workspace.izclick_production_status')
    emit('catalog_serializer', defined=callable(getattr(module, 'serialize_status', None)))
except ModuleNotFoundError:
    emit('catalog_module', present=False)

from plane.db import models
emit('custom_models', catalog=hasattr(models, 'IzClickProductionStatus'), custom_fields=hasattr(models, 'IzclickCustomField'))

import redis
for sample in range(1, 4):
    started = time.monotonic()
    try:
        client = redis.Redis.from_url(settings.REDIS_URL, socket_connect_timeout=2, socket_timeout=2)
        pong = client.ping()
        client.close()
        emit('redis_ping', sample=sample, ok=bool(pong), seconds=round(time.monotonic()-started, 4))
    except Exception as exc:
        emit('redis_ping', sample=sample, error=type(exc).__name__, seconds=round(time.monotonic()-started, 4))

from django.db import connection, transaction
connection.settings_dict.setdefault('OPTIONS', {})['connect_timeout'] = 3
for sample in range(1, 4):
    started = time.monotonic()
    try:
        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute('SET TRANSACTION READ ONLY')
                cursor.execute("SET LOCAL statement_timeout = '3000ms'")
                cursor.execute('SELECT 1')
                ok = cursor.fetchone()[0] == 1
        emit('postgres_select', sample=sample, ok=ok, seconds=round(time.monotonic()-started, 4))
    except Exception as exc:
        emit('postgres_select', sample=sample, error=type(exc).__name__, seconds=round(time.monotonic()-started, 4))
        connection.close()
connection.close()
PY
echo IZCLICK_RUNTIME_CHECK_DONE
