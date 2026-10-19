#!/usr/bin/env bash
# IZ-Click diagnostic v2: bounded read-only timings. Requires root-owned installation.
set -Eeuo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C
echo IZCLICK_LATENCY_V2
date -u '+utc=%Y-%m-%dT%H:%M:%SZ'
# No raw logs, credentials, requests, response bodies or query text are printed.
echo '--postgres: local socket timing, read-only SELECT 1--'
if docker inspect plane-app-plane-db-1 >/dev/null 2>&1; then
  /usr/bin/time -f 'postgres_elapsed_sec=%e' timeout 8 docker exec plane-app-plane-db-1 sh -c 'PGHOST=/var/run/postgresql psql -X -q -A -t -U "${POSTGRES_USER:-plane}" -d "${POSTGRES_DB:-plane}" -c "BEGIN READ ONLY; SELECT 1; ROLLBACK;" >/dev/null' 2>&1 | grep -E '^postgres_elapsed_sec=|^Command exited' || true
fi
echo '--redis: ping timing, no keys accessed--'
if docker inspect plane-app-plane-redis-1 >/dev/null 2>&1; then
  /usr/bin/time -f 'redis_elapsed_sec=%e' timeout 8 docker exec plane-app-plane-redis-1 valkey-cli ping 2>&1 | sed -n -E '/^PONG$|^redis_elapsed_sec=|^Command exited/p' || true
fi
echo '--api worker runtime commands: metadata only--'
if docker inspect plane-app-api-1 >/dev/null 2>&1; then
  docker top plane-app-api-1 -eo comm,pid,etime 2>/dev/null | head -n 12 || true
fi
echo '--backend API instance route (localhost proxy; unauthenticated, max 8s; no body)--'
# Only if local port 80 responds; do not hit public DNS or send credentials.
if command -v curl >/dev/null 2>&1; then
  for n in 1 2; do
    curl --silent --output /dev/null --connect-timeout 2 --max-time 8       --write-out "probe=${n} http_code=%{http_code} total_sec=%{time_total} connect_sec=%{time_connect}\n"       http://127.0.0.1/api/instances/ || echo "probe=${n} error=connection_or_timeout"
  done
fi
echo IZCLICK_LATENCY_DONE
