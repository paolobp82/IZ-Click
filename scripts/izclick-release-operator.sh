#!/usr/bin/env bash
# IZ-Click: controlled production release; no repository secrets in this script.
set -Eeuo pipefail
cd /opt/iz-click/plane-app
SHA=9ec35bf5e0d32676d37533e33a5548d1a90d1e85
BASE=(sudo docker compose --env-file plane.env -f docker-compose.yaml -f docker-compose.izclick.yaml -f docker-compose.izclick-pilot.yaml -f docker-compose.izclick-release.yaml)
WEB="ghcr.io/paolobp82/izclick-web:preview-clickup-$SHA"
API="ghcr.io/paolobp82/izclick-api:preview-clickup-$SHA"
case "${1:---preflight}" in
  --preflight)
    "${BASE[@]}" config --quiet
    sudo docker image inspect "$WEB" "$API" >/dev/null
    echo "Images and compose: OK"
    sudo docker exec plane-app-plane-db-1 sh -c 'PGHOST=/var/run/postgresql psql -U "${POSTGRES_USER:-plane}" -d "${POSTGRES_DB:-plane}" -Atc "SELECT (SELECT count(*) FROM public.projects), (SELECT count(*) FROM public.states), (SELECT count(*) FROM public.issues)"'
    sudo docker inspect plane-app-web-1 plane-app-api-1 --format '{{.Name}} {{.Config.Image}} {{.Image}}'
    echo "Preflight only. No production modifications."
    ;;
  --prepare)
    "${BASE[@]}" config --quiet
    sudo docker image inspect "$WEB" "$API" >/dev/null
    DEST="/home/izango/izclick-release-$(date +%Y%m%d-%H%M%S)"
    mkdir -m 700 "$DEST"
    sudo docker exec plane-app-plane-db-1 sh -c 'PGHOST=/var/run/postgresql pg_dump -U "${POSTGRES_USER:-plane}" -d "${POSTGRES_DB:-plane}" -Fc --no-owner --no-acl' > "$DEST/postgres.dump"
    chmod 600 "$DEST/postgres.dump"
    sudo docker run --rm -v "$DEST:/backup:ro" postgres:15.7-alpine pg_restore -l /backup/postgres.dump >/dev/null
    sudo docker run --rm -v plane-app_uploads:/source:ro -v "$DEST:/backup" alpine:3.20 sh -c 'tar -czf /backup/minio.tar.gz -C /source .'
    sudo chown "$(id -u):$(id -g)" "$DEST/minio.tar.gz"
    chmod 600 "$DEST/minio.tar.gz"
    tar -tzf "$DEST/minio.tar.gz" >/dev/null
    sudo docker inspect plane-app-web-1 plane-app-api-1 --format '{{.Name}} {{.Config.Image}} {{.Image}}' > "$DEST/previous-images.txt"
    sha256sum "$DEST/postgres.dump" "$DEST/minio.tar.gz" > "$DEST/SHA256SUMS"
    printf 'Backup directory: %s\n' "$DEST"
    echo "No deployment. Validate backup restore and migration in an isolated DB before release."
    ;;
  *) echo "Use --preflight or --prepare. Deployment is deliberately not enabled until isolated migration and restore verification." >&2; exit 2;;
esac
