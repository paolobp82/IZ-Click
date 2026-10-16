#!/usr/bin/env bash
set -Eeuo pipefail
cd /opt/iz-click/plane-app
C=(docker compose --env-file plane.env -f docker-compose.yaml -f docker-compose.izclick.yaml -f docker-compose.izclick-pilot.yaml -f docker-compose.izclick-release.yaml)
echo '=== EFFECTIVE SERVICE IMAGES ==='
"${C[@]}" config --images
echo '=== COMPOSE SERVICES ==='
"${C[@]}" config --services
echo '=== LIVE WEB/API IMAGE IDENTITIES ==='
docker inspect plane-app-web-1 plane-app-api-1 --format '{{.Name}}|{{.Config.Image}}|{{.Image}}'
echo '=== SERVICE LABELS ==='
docker inspect plane-app-web-1 plane-app-api-1 --format '{{.Name}}|{{index .Config.Labels "com.docker.compose.service"}}|{{index .Config.Labels "com.docker.compose.project"}}'
echo '=== MIGRATIONS APPLIED ==='
docker exec plane-app-plane-db-1 sh -c 'PGHOST=/var/run/postgresql psql -U "${POSTGRES_USER:-plane}" -d "${POSTGRES_DB:-plane}" -Atc "SELECT name FROM django_migrations WHERE app = chr(100)||chr(98) AND name LIKE chr(48)||chr(49)||chr(50)||chr(37) ORDER BY name;"'
echo DEPLOY_READINESS_READONLY_OK
