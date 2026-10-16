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
  backup)
    umask 077
    DEST="/home/izango/izclick-automated-$(date -u +%Y%m%dT%H%M%SZ)"
    mkdir -m 700 "$DEST"
    docker exec plane-app-plane-db-1 sh -c 'PGHOST=/var/run/postgresql pg_dump -U "${POSTGRES_USER:-plane}" -d "${POSTGRES_DB:-plane}" -Fc --no-owner --no-acl' > "$DEST/postgres.dump"
    test -s "$DEST/postgres.dump"
    docker run --rm -v "$DEST:/backup:ro" postgres:15.7-alpine pg_restore -l /backup/postgres.dump > /dev/null
    docker run --rm -v plane-app_uploads:/source:ro -v "$DEST:/backup" alpine:3.20 sh -c 'tar -czf /backup/minio.tar.gz -C /source .'
    tar -tzf "$DEST/minio.tar.gz" > /dev/null
    docker inspect plane-app-web-1 plane-app-api-1 --format '{{.Name}}|{{.Config.Image}}|{{.Image}}' > "$DEST/previous-images.txt"
    (cd "$DEST" && sha256sum postgres.dump minio.tar.gz previous-images.txt > SHA256SUMS)
    chmod 600 "$DEST"/*
    echo "BACKUP_OK"
    echo "BACKUP_DIRECTORY=$DEST"
    ;;
  migration-test)
    exec /usr/local/sbin/izclick-isolated-migration-test
    ;;
  minio-restore-test)
    exec /usr/local/sbin/izclick-minio-restore-verify
    ;;
  release-inspect)
    exec /usr/local/sbin/izclick-release-inspect
    ;;
  stage-v2)
    exec /usr/local/sbin/izclick-v2-stage
    ;;
  *) echo "Operación no permitida" >&2; exit 126;;
esac
