#!/usr/bin/env bash
# Read-only diagnostic v3 (proposal, not installed on server)
set -Eeuo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C
echo IZCLICK_LATENCY_V3
date -u '+utc=%Y-%m-%dT%H:%M:%SZ'
echo "--docker exec overhead and redis operation (3 samples)--"
for n in 1 2 3; do
  /usr/bin/time -f "redis_exec_sample=${n} elapsed_sec=%e" timeout 10 docker exec plane-app-plane-redis-1 valkey-cli ping 2>&1 | grep -E '^PONG$|^redis_exec_sample=|^Command exited' || true
done
echo "--postgres query + exec (3 samples)--"
for n in 1 2 3; do
  /usr/bin/time -f "postgres_exec_sample=${n} elapsed_sec=%e" timeout 10 docker exec plane-app-plane-db-1 sh -c 'PGHOST=/var/run/postgresql psql -X -q -A -t -U "${POSTGRES_USER:-plane}" -d "${POSTGRES_DB:-plane}" -c "SELECT 1" > /dev/null' 2>&1 | grep -E '^postgres_exec_sample=|^Command exited' || true
done
echo "--gunicorn process arguments: only worker count and timeout settings--"
docker exec plane-app-api-1 sh -c 'for p in /proc/[0-9]*/cmdline; do cmd=$(tr "\000" " " < "$p" 2>/dev/null || :); case "$cmd" in *gunicorn*) printf "%s\n" "$cmd" | sed -E "s/--access-logfile [^ ]+/--access-logfile [hidden]/g" ;; esac; done' 2>/dev/null | head -n 8 || true
echo "--app-local HTTP health (no body or credentials, bounded)--"
# The previous probe returned 308 and never tested the backend route.
# No GET request to /api/instances/ here: exact HTTPS routing and side effects need review.
echo "route_probe=disabled_pending_proxy_route_confirmation"
echo IZCLICK_LATENCY_V3_DONE
