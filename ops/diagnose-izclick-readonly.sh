#!/usr/bin/env bash
# IZ-Click: diagnostics only. No restart, no exec into application, no writes to volumes.
set -Eeuo pipefail
export LC_ALL=C
ROOT=/opt/iz-click/plane-app
cd "$ROOT"
echo "=== IZ-Click read-only diagnostic ==="
date -u '+UTC %Y-%m-%dT%H:%M:%SZ'
uname -sr
uptime
free -m
df -h / /var/lib/docker 2>/dev/null || df -h /
echo "=== Docker services (no environment/secrets) ==="
sudo -n docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}' || true
echo "=== Runtime resource snapshot ==="
sudo -n docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.PIDs}}' || true
echo "=== Containers: uptime/restarts/oom (excluding credentials) ==="
for c in plane-app-api-1 plane-app-plane-db-1 plane-app-proxy-1 plane-app-caddy-1; do
  sudo -n docker inspect --format '{{.Name}} status={{.State.Status}} started={{.State.StartedAt}} restarts={{.RestartCount}} oom={{.State.OOMKilled}} exit={{.State.ExitCode}}' "$c" 2>/dev/null || true
done
echo "=== API worker errors: filtered and bounded (URL query stripped) ==="
sudo -n docker logs --since 60m --tail 1500 plane-app-api-1 2>&1 | grep -Ei 'WORKER TIMEOUT|booting worker|killed|out of memory|database.*(error|timeout)|connection.*(refused|reset)|OperationalError|deadlock' | tail -n 60 | sed -E 's/([?][^[:space:]"]+)/?[redacted]/g' || true
echo "=== Caddy/proxy failures: filtered and bounded ==="
for c in plane-app-caddy-1 plane-app-proxy-1; do
  sudo -n docker logs --since 60m --tail 1500 "$c" 2>&1 | grep -Ei '502|statusError|upstream|EOF|timeout' | tail -n 40 | sed -E 's/([?][^[:space:]"]+)/?[redacted]/g; s/("authorization"[[:space:]]*:[[:space:]]*")[^"]+/"authorization":"[redacted]/Ig' || true
done
echo "=== Database health (no records or secrets) ==="
sudo -n docker exec -u postgres plane-app-plane-db-1 pg_isready 2>/dev/null || true
echo "=== Read-only DB activity summary, local socket auth only ==="
sudo -n docker exec -u postgres plane-app-plane-db-1 sh -c 'psql -X -q -A -t -d plane -c "BEGIN READ ONLY; SELECT coalesce(state, '\''unknown'\''), coalesce(wait_event_type, '\''none'\''), count(*) FROM pg_stat_activity GROUP BY 1,2 ORDER BY 3 DESC; ROLLBACK;"' 2>&1 | grep -Ev 'password|PGPASSWORD|postgresql://|DATABASE_URL' | tail -n 20 || true
echo "=== End. No state-changing commands executed ==="
