#!/usr/bin/env python3
"""Temporary, nonblocking API worker stack samples. No locals or raw process output."""
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import subprocess
import tempfile
import time
from urllib.request import urlopen
import zipfile

WHEEL = 'py_spy-0.4.2-py2.py3-none-manylinux_2_5_x86_64.manylinux1_x86_64.whl'
URL = 'https://github.com/benfred/py-spy/releases/download/v0.4.2/' + WHEEL
SHA256 = 'aeb0323409199c785f730645e9f4bb7a7b9ca2c481f2c331a55642b5d13fa52f'
MEMBER = 'py_spy-0.4.2.data/scripts/py-spy'


def emit(check, **values):
    print(json.dumps(dict(check=check, **values)), flush=True)


def safe_threads(traces):
    # Explicit allowlist excludes process_info, command lines, locals and values.
    return [dict(
        active=bool(trace.get('active')), owns_gil=bool(trace.get('owns_gil')),
        frames=[dict(file=Path(frame.get('filename', '')).name,
                     function=frame.get('name'), line=frame.get('line'))
                for frame in trace.get('frames', [])[:20]],
    ) for trace in traces[:8]]


def children(master):
    path = Path(f'/proc/{master}/task/{master}/children')
    return [int(pid) for pid in path.read_text().split() if pid.isdigit()][:4]


def main():
    if os.geteuid() != 0 or platform.machine() != 'x86_64':
        emit('stacks_error', reason='root_and_x86_64_required')
        return 1
    emit('worker_stacks_version', version=1, nonblocking=True, capture_locals=False)
    result = subprocess.run(['docker', 'inspect', '--format', '{{.State.Pid}} {{.State.Running}}',
                             'plane-app-api-1'], capture_output=True, text=True, timeout=45)
    fields = result.stdout.split()
    if result.returncode or len(fields) != 2 or fields[1] != 'true' or not fields[0].isdigit():
        emit('stacks_error', reason='api_not_running')
        return 1
    master = int(fields[0])
    if master <= 1 or not children(master):
        emit('stacks_error', reason='api_workers_not_found')
        return 1
    with urlopen(URL, timeout=30) as response:
        data = response.read(16 * 1024 * 1024)
    if hashlib.sha256(data).hexdigest() != SHA256:
        emit('stacks_error', reason='download_digest_mismatch')
        return 1
    emit('profiler_verified', version='0.4.2', sha256=SHA256)
    # Root-private temporary directory; no system installation, container copy or changes.
    with tempfile.TemporaryDirectory(prefix='izclick-stacks-') as directory:
        binary = Path(directory) / 'py-spy'
        binary.write_bytes(zipfile.ZipFile(io.BytesIO(data)).read(MEMBER))
        binary.chmod(0o700)
        for sample in range(1, 4):
            for pid in children(master):
                try:
                    # Check parent immediately before sampling; never attach to unrelated PIDs.
                    stat = Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()
                    if int(stat[1]) != master:
                        continue
                    result = subprocess.run([str(binary), 'dump', '--pid', str(pid), '--json', '--nonblocking'],
                                            capture_output=True, text=True, timeout=12)
                    if result.returncode:
                        emit('worker_stack_unavailable', sample=sample, pid=pid, exit_code=result.returncode)
                        continue
                    traces = json.loads(result.stdout)
                    emit('worker_stack', sample=sample, pid=pid, threads=safe_threads(traces))
                except (FileNotFoundError, ProcessLookupError):
                    emit('worker_replaced_during_sample', sample=sample, pid=pid)
                except subprocess.TimeoutExpired:
                    emit('worker_stack_timeout', sample=sample, pid=pid)
            if sample < 3:
                time.sleep(1)
    emit('worker_stacks_done')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as exc:
        # Do not print raw subprocess errors, connection URLs or process command lines.
        emit('stacks_error', error=type(exc).__name__)
        raise SystemExit(1)
