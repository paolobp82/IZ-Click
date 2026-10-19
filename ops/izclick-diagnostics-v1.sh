#!/usr/bin/env bash
# Installed root-owned, invoked only through sudoers allowlist.
# Metadata and aggregate counts only; no request bodies, SQL, env vars, or raw logs.
set -Eeuo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
export LC_ALL=C
echo "IZCLICK_DIAGNOSTICS_V1"
date -u '+utc=%Y-%m-%dT%H:%M:%SZ'
uptime
free -m
df -h /
echo "--docker containers--"
docker ps --format '{{.Names}}|{{.Status}}' --filter name=plane-app
echo "--resource snapshot--"
docker stats --no-stream --format '{{.Name}}|CPU={{.CPUPerc}}|MEM={{.MemUsage}}|PIDs={{.PIDs}}' $(docker ps -q --filter name=plane-app) 2>/dev/null || true
echo "--api status--"
for c in plane-app-api-1 plane-app-plane-db-1; do
 docker inspect --format '{{.Name}}|status={{.State.Status}}|restarts={{.RestartCount}}|oom={{.State.OOMKilled}}|started={{.State.StartedAt}}' "$c" 2>/dev/null || true
done
echo "--gunicorn last 6h: aggregate event counts only--"
if docker inspect plane-app-api-1 >/dev/null 2>&1; then
 docker logs --since 6h --tail 5000 plane-app-api-1 2>&1 | awk '
 /WORKER TIMEOUT/ {t++} /Booting worker/ {b++} /Worker exiting/ {e++}
 /Out of memory|OOM|Killed process/ {o++}
 END {printf "timeouts=%d booting=%d exits=%d oom_signals=%d\n",t,b,e,o}'
fi
echo "--reverse proxy last 6h: aggregate event counts only--"
for c in plane-app-caddy-1 plane-app-proxy-1; do
 if docker inspect "$c" >/dev/null 2>&1; then
  docker logs --since 6h --tail 5000 "$c" 2>&1 | awk -v c="$c" '
  / 502 |"status":502|"status": 502/ {bad++}
  /EOF/ {eof++} /upstream.*timeout|context deadline exceeded/ {tim++}
  END {printf "%s 502_lines=%d eof_lines=%d timeout_lines=%d\n",c,bad,eof,tim}'
 fi
done
echo "--postgres connections via local DB socket (metadata only)--"
docker exec plane-app-plane-db-1 sh -c 'PGHOST=/var/run/postgresql psql -X -q -A -t -U "${POSTGRES_USER:-plane}" -d "${POSTGRES_DB:-plane}" -c "BEGIN READ ONLY; SELECT coalesce(state, '\''unknown'\''), coalesce(wait_event_type, '\''none'\''), count(*) FROM pg_stat_activity GROUP BY 1,2 ORDER BY 3 DESC; ROLLBACK;"' 2>&1 | sed -n '/^[a-zA-Z][a-zA-Z ]*|/p' || true
echo "IZCLICK_DIAGNOSTICS_DONE"
