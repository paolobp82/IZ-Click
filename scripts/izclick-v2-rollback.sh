#!/usr/bin/env bash
set -Eeuo pipefail
cd /opt/iz-click/plane-app
C=(docker compose --env-file plane.env -f docker-compose.yaml -f docker-compose.izclick.yaml -f docker-compose.izclick-pilot.yaml -f docker-compose.izclick-release.yaml)
"${C[@]}" config --quiet
"${C[@]}" up -d --no-deps api web
echo "ROLLBACK_TO_PREVIOUS_WEB_API_REQUESTED"
docker inspect plane-app-web-1 plane-app-api-1 --format '{{.Name}}|{{.Config.Image}}|{{.Image}}'
echo "Database migration 0124 was not reversed."
