#!/usr/bin/env python3
"""Bounded administrator-console read-only latency probes; no configuration changes."""
import json
import ipaddress
import os
from pathlib import Path
import subprocess
import sys
import time


def emit(check, **values):
    print(json.dumps(dict(check=check, **values)), flush=True)


def container_records(output):
    # TimeoutExpired may contain bytes even when subprocess.run uses text=True.
    if isinstance(output, bytes):
        output = output.decode('utf-8', errors='replace')
    for line in (output or '').splitlines():
        try:
            row = json.loads(line)
            if isinstance(row, dict) and str(row.get('check', '')).startswith('probe_'):
                print(json.dumps(row), flush=True)
        except ValueError:
            pass


def run(label, argv, timeout, source=None):
    started = time.monotonic()
    try:
        result = subprocess.run(argv, input=source, text=True, capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        if label == 'container':
            container_records(exc.stdout)
        emit(label, timed_out=True, seconds=round(time.monotonic() - started, 4))
        return
    # Never expose subprocess stderr, environment, connection URLs or response bodies.
    if label == 'container':
        container_records(result.stdout)
    elif result.returncode == 0:
        fields = result.stdout.strip().split()
        if len(fields) == 3:
            try:
                emit(label + '_http', status=int(fields[0]), ttfb=float(fields[1]), total=float(fields[2]))
            except ValueError:
                pass
    emit(label, exit_code=result.returncode, seconds=round(time.monotonic() - started, 4))


CONTAINER_SOURCE = r'''
import signal, os
signal.signal(signal.SIGALRM, lambda *_: os._exit(124))
signal.alarm(75)
import json, os, socket, time
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, ProxyHandler

def emit(check, **values):
    print(json.dumps(dict(check='probe_' + check, **values)), flush=True)

def timed(label, operation):
    wall, cpu = time.monotonic(), time.process_time()
    try:
        value = operation()
        emit(label, ok=True, value=value, wall=round(time.monotonic()-wall, 4), cpu=round(time.process_time()-cpu, 4))
    except Exception as exc:
        emit(label, ok=False, error=type(exc).__name__, wall=round(time.monotonic()-wall, 4), cpu=round(time.process_time()-cpu, 4))

emit('cpu', visible=os.cpu_count(), affinity=len(os.sched_getaffinity(0)))
for filename in ('cpu.max', 'cpu.stat', 'cpu.pressure', 'io.pressure'):
    path = Path('/sys/fs/cgroup') / filename
    if path.is_file():
        emit('cgroup', file=filename, value=path.read_text().strip())
timed('cpu_loop', lambda: bool(sum(range(1000000))))
pids = [1]
children = Path('/proc/1/task/1/children')
if children.is_file():
    pids += [int(p) for p in children.read_text().split() if p.isdigit()]
for pid in pids:
    try:
        stat = Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()
        emit('process', pid=pid, state=stat[0], user_ticks=int(stat[11]), system_ticks=int(stat[12]), threads=int(stat[17]), start_ticks=int(stat[19]))
    except (OSError, ValueError, IndexError):
        pass
for label, key in (('redis', 'REDIS_URL'), ('postgres', 'DATABASE_URL')):
    address = urlsplit(os.environ.get(key, ''))
    if address.hostname:
        timed(label + '_dns', lambda a=address: bool(socket.getaddrinfo(a.hostname, a.port or (6379 if a.scheme.startswith('redis') else 5432), type=socket.SOCK_STREAM)))

# Measure requests inside the running API network namespace, without a session.
opener = build_opener(ProxyHandler({}))
for sample in range(2):
    def http():
        request = Request('http://127.0.0.1:8000/api/instances/', headers={'Host': 'izclick.izango.com.pe', 'X-Forwarded-Proto': 'https'})
        with opener.open(request, timeout=10) as response:
            response.read(65536)
            return response.status
    timed('api_http_' + str(sample+1), http)

def redis_probe():
    import redis
    with redis.Redis.from_url(os.environ['REDIS_URL'], socket_connect_timeout=2, socket_timeout=2) as client:
        return bool(client.ping())
for sample in range(2):
    timed('redis_ping_' + str(sample+1), redis_probe)

def postgres_probe():
    import psycopg
    with psycopg.connect(os.environ['DATABASE_URL'], connect_timeout=3, options='-c default_transaction_read_only=on -c statement_timeout=3000') as conn:
        with conn.cursor() as cursor:
            cursor.execute('SELECT 1')
            return cursor.fetchone()[0] == 1
for sample in range(2):
    timed('postgres_select_' + str(sample+1), postgres_probe)
signal.alarm(0)
'''


def http_comparison():
    emit('http_comparison_version', version=1)
    started = time.monotonic()
    try:
        result = subprocess.run(['docker', 'inspect', '--format',
                                 '{{range .NetworkSettings.Networks}}{{println .IPAddress}}{{end}}',
                                 'plane-app-api-1'], capture_output=True, text=True, timeout=45)
        addresses = [ipaddress.ip_address(value) for value in result.stdout.split()]
        if result.returncode or len(addresses) != 1 or addresses[0].version != 4 or not addresses[0].is_private:
            emit('api_address_unavailable')
            return
    except (subprocess.TimeoutExpired, ValueError):
        emit('api_address_unavailable')
        return
    emit('address_lookup', seconds=round(time.monotonic()-started, 4))
    # Fixed public GET only: no cookies, credentials, response bodies or Docker exec.
    base = ['curl', '-q', '-sS', '--noproxy', '*', '--connect-timeout', '2',
            '--max-time', '12', '-o', '/dev/null', '-w',
            '%{http_code} %{time_starttransfer} %{time_total}']
    direct = base + ['-H', 'Host: izclick.izango.com.pe', '-H', 'X-Forwarded-Proto: https',
                     f'http://{addresses[0]}:8000/api/instances/']
    proxy = base + ['--resolve', 'izclick.izango.com.pe:443:127.0.0.1',
                    'https://izclick.izango.com.pe/api/instances/']
    for sample in range(1, 4):
        emit('http_pair', sample=sample, cpu_pressure=Path('/proc/pressure/cpu').read_text().strip())
        # Alternate order to avoid systematically assigning cold-request delay to one path.
        paths = [('direct_api', direct), ('proxy', proxy)]
        if sample == 2:
            paths.reverse()
        for label, argv in paths:
            run(label, argv, 18)
    emit('http_comparison_done')


def main():
    if '--http-only' in sys.argv:
        http_comparison()
        return
    emit('live_latency_version', version=1)
    emit('host_cpu', visible=os.cpu_count(), affinity=len(os.sched_getaffinity(0)))
    wall, cpu = time.monotonic(), time.process_time()
    sum(range(1000000))
    emit('host_cpu_loop', wall=round(time.monotonic()-wall, 4), cpu=round(time.process_time()-cpu, 4))
    for filename in ('/proc/pressure/cpu', '/proc/pressure/io', '/sys/fs/cgroup/cpu.max'):
        path = Path(filename)
        if path.is_file():
            emit('host_pressure', file=filename, value=path.read_text().strip())
    run('container', ['docker', 'exec', '-i', 'plane-app-api-1', 'python', '-u', '-'], 100, CONTAINER_SOURCE)
    for _ in range(2):
        run('proxy', ['curl', '-q', '-sS', '--resolve', 'izclick.izango.com.pe:443:127.0.0.1', '--connect-timeout', '2', '--max-time', '12', '-o', '/dev/null', '-w', '%{http_code} %{time_starttransfer} %{time_total}', 'https://izclick.izango.com.pe/api/instances/'], 18)
    emit('live_latency_done')


if __name__ == '__main__':
    main()
