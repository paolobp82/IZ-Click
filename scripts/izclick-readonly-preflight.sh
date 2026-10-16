#!/usr/bin/env bash
# IZ-Click production discovery — READ ONLY. Does not back up or deploy.
# Run from the directory that contains the live Docker Compose file.
set -euo pipefail
echo "=== IZ-CLICK READ-ONLY PREFLIGHT ==="
date -u '+UTC %Y-%m-%dT%H:%M:%SZ'
echo "-- working directory --"
pwd
echo "-- docker versions --"
docker --version
docker compose version
echo "-- compose service names (no environment values) --"
docker compose config --services
echo "-- current containers, image IDs, names and status --"
docker compose ps --format json | python3 -c 'import sys,json; t=sys.stdin.read().strip(); rows=[json.loads(x) for x in t.splitlines() if x.strip()]; allowed=("Service","Name","Image","State","Health","Publishers"); print(json.dumps([{k:r.get(k) for k in allowed if k in r} for r in rows],indent=2))'
echo "-- immutable running image digests (no credentials) --"
for service in web api; do
  id="$(docker compose ps -q "$service" 2>/dev/null || true)"
  if [[ -n "$id" ]]; then
    docker inspect "$id" --format '{{.Name}} {{.Image}} {{.State.Status}}'
  else
    echo "$service: NOT FOUND"
  fi
done
echo "-- volume names only --"
docker compose config --volumes
echo "-- free disk --"
df -h .
echo "=== END READ-ONLY PREFLIGHT ==="
echo "Do not paste compose .env or application secrets. Backups and restore tests are NOT performed by this script."
