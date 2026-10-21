#!/usr/bin/env python3
"""Read host CPU affinity, scheduling pressure and ancestor quotas; no Docker exec."""
import json
import os
from pathlib import Path
import platform
import time


def emit(check, **values):
    print(json.dumps(dict(check=check, **values)), flush=True)


def read(path):
    try:
        return Path(path).read_text().strip()
    except OSError:
        return None


def ancestors(root, relative):
    root = root.resolve()
    current = (root / relative.lstrip('/')).resolve()
    if not current.is_relative_to(root):
        return []
    result = []
    while True:
        result.append(current)
        if current == root:
            return result
        current = current.parent


def main():
    emit('cpu_limits_version', version=1, kernel=platform.release(),
         visible=os.cpu_count(), affinity=sorted(os.sched_getaffinity(0)))
    cpuinfo = read('/proc/cpuinfo') or ''
    for key in ('model name', 'cpu MHz', 'bogomips', 'hypervisor vendor'):
        value = next((line.split(':', 1)[1].strip() for line in cpuinfo.splitlines()
                      if ':' in line and line.split(':', 1)[0].strip() == key), None)
        if value is not None:
            emit('cpu_hardware', field=key, value=value)
    pids = {1, os.getpid()}
    for entry in Path('/proc').iterdir():
        if entry.name.isdigit() and read(entry / 'comm') in ('gunicorn', 'dockerd', 'containerd'):
            pids.add(int(entry.name))
    inspected = set()
    for pid in sorted(pids):
        cgroups = read(f'/proc/{pid}/cgroup')
        try:
            affinity = sorted(os.sched_getaffinity(pid))
            nice, policy = os.getpriority(os.PRIO_PROCESS, pid), os.sched_getscheduler(pid)
        except (OSError, ProcessLookupError):
            continue
        emit('process_cpu', pid=pid, name=read(f'/proc/{pid}/comm'),
             affinity=affinity, nice=nice, scheduler=policy)
        if cgroups is None:
            continue
        unified = next((line[3:] for line in cgroups.splitlines() if line.startswith('0::')), None)
        if unified is None:
            emit('cgroup_limits', pid=pid, unified=False)
            continue
        for depth, directory in enumerate(ancestors(Path('/sys/fs/cgroup'), unified)):
            if directory in inspected:
                continue
            inspected.add(directory)
            fields = {name: read(directory / name) for name in
                      ('cpu.max', 'cpu.max.burst', 'cpu.weight', 'cpu.stat',
                       'cpu.pressure', 'cpuset.cpus.effective')}
            emit('cgroup_limits', pid=pid, ancestor_depth=depth, **fields)
    for sample in (1, 2):
        emit('host_cpu_pressure', sample=sample, value=read('/proc/pressure/cpu'))
        if sample == 1:
            time.sleep(2)
    emit('cpu_limits_done')


if __name__ == '__main__':
    main()
