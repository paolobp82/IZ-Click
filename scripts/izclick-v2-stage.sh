#!/usr/bin/env bash
set -Eeuo pipefail
cd /opt/iz-click/plane-app
umask 077
WEB=ghcr.io/paolobp82/izclick-web:preview-clickup-9ec35bf5e0d32676d37533e33a5548d1a90d1e85
API=ghcr.io/paolobp82/izclick-api:preview-clickup-9ec35bf5e0d32676d37533e33a5548d1a90d1e85
docker image inspect "$WEB" "$API" >/dev/null
cat >/opt/iz-click/plane-app/docker-compose.izclick-v2-candidate.yaml <<EOF
services:
  web:
    image: $WEB
  api:
    image: $API
EOF
chmod 600 /opt/iz-click/plane-app/docker-compose.izclick-v2-candidate.yaml
C=(docker compose --env-file plane.env -f docker-compose.yaml -f docker-compose.izclick.yaml -f docker-compose.izclick-pilot.yaml -f docker-compose.izclick-release.yaml -f docker-compose.izclick-v2-candidate.yaml)
"${C[@]}" config --quiet
echo "=== EXPECTED CANDIDATE IMAGE TAGS ==="
"${C[@]}" config --images | grep 'ghcr.io/paolobp82/izclick-'
echo "=== ORIGINAL PRODUCTION IMAGE DIGESTS ==="
docker inspect plane-app-web-1 plane-app-api-1 --format '{{.Name}}|{{.Config.Image}}|{{.Image}}'
echo "=== PRODUCTION DATA COUNTS ==="
docker exec plane-app-plane-db-1 sh -c 'PGHOST=/var/run/postgresql psql -U "${POSTGRES_USER:-plane}" -d "${POSTGRES_DB:-plane}" -Atc "SELECT (SELECT count(*) FROM public.projects),(SELECT count(*) FROM public.states),(SELECT count(*) FROM public.issues)"'
echo "V2_STAGE_READY_NO_DEPLOY"
