# Runtime check v2

The first administrator-console run on 2026-10-19 at 23:23:56 UTC showed one
Gunicorn Uvicorn worker, two API container restarts, no OOM, and 89–97% CPU idle
in its live vmstat samples. CPU steal was zero during those samples.

It stopped during Django initialization after the known-placeholder SECRET_KEY
critical log, without reaching django_setup or the completion marker. The
matching source only logs this condition; it does not raise or exit. The original
50-second outer docker-exec timeout is a likely explanation, not yet proven.
Timing out the docker client alone does not guarantee the container process exits.

Use izclick-runtime-check-v2.sh instead. It checks files before importing Django,
runs Redis, read-only PostgreSQL, and Django as separate bounded subprocesses,
and kills and reaps each timed-out child inside the container. The Django probe
prints only stack file basenames, function names and line numbers at 20 seconds.
Raw Django logs, settings, DSNs and local variables are not forwarded.
No service restarts, migrations, cache keys or application writes are involved.

The SECRET_KEY warning is a separate confirmed configuration issue. Changing the
key without a migration plan can invalidate sessions and prevent decryption of
InstanceConfiguration values: plane.license.utils.encryption derives its Fernet
key from settings.SECRET_KEY. Preserve decryption access when planning rotation.

Local validation: Bash syntax, embedded Python compilation, and three subprocess
tests (compilation, JSON-only output, timeout kill/reap). Production execution of
v2 and authenticated state creation remain pending. No repair has been deployed.
