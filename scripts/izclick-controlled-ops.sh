#!/usr/bin/env bash
# Root-owned, fixed operations only. Never accept external command fragments.
set -Eeuo pipefail
PATH=/usr/sbin:/usr/bin:/sbin:/bin
cd /opt/iz-click/plane-app
case "${1:-}" in
  preflight)
    docker compose --env-file plane.env \
      -f docker-compose.yaml \
      -f docker-compose.izclick.yaml \
      -f docker-compose.izclick-pilot.yaml \
      -f docker-compose.izclick-release.yaml config --quiet
    echo "COMPOSE_CONFIG_OK"
    docker image inspect \
      ghcr.io/paolobp82/izclick-web:preview-clickup-9ec35bf5e0d32676d37533e33a5548d1a90d1e85 \
      ghcr.io/paolobp82/izclick-api:preview-clickup-9ec35bf5e0d32676d37533e33a5548d1a90d1e85 >/dev/null
    echo "CANDIDATE_IMAGES_PRESENT"
    docker exec plane-app-plane-db-1 sh -c 'PGHOST=/var/run/postgresql psql -U "${POSTGRES_USER:-plane}" -d "${POSTGRES_DB:-plane}" -Atc "SELECT (SELECT count(*) FROM public.projects), (SELECT count(*) FROM public.states), (SELECT count(*) FROM public.issues)"' | sed 's/^/PROJECTS_STATES_ISSUES=/'
    docker ps --format '{{.Names}}|{{.Status}}' --filter name=plane-app
    echo "PREFLIGHT_OK"
    ;;
  *) echo "Operación no permitida" >&2; exit 126;;
esac
