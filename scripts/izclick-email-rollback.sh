#!/usr/bin/env bash
set -Eeuo pipefail
cd /opt/iz-click/plane-app
C=(docker compose --env-file plane.env -f docker-compose.yaml -f docker-compose.izclick.yaml -f docker-compose.izclick-pilot.yaml -f docker-compose.izclick-release.yaml -f docker-compose.izclick-v2-candidate.yaml)
"${C[@]}" config --quiet
"${C[@]}" up -d --no-deps --force-recreate api worker beat-worker
echo "IZCLICK_EMAIL_IMAGE_ROLLBACK_REQUESTED"
docker inspect plane-app-api-1 plane-app-worker-1 plane-app-beat-worker-1 --format '{{.Name}}|{{.Config.Image}}|{{.Image}}'
