#!/usr/bin/env bash
# Controlled IZ-Click V2 rollout, only with separate human-triggered workflow.
set -Eeuo pipefail
cd /opt/iz-click/plane-app
umask 077
EXPECTED_WEB='ghcr.io/paolobp82/izclick-web:preview-clickup-9ec35bf5e0d32676d37533e33a5548d1a90d1e85'
EXPECTED_API='ghcr.io/paolobp82/izclick-api:preview-clickup-9ec35bf5e0d32676d37533e33a5548d1a90d1e85'
OLD_WEB='sha256:605eff7bcbc1e4596ca0acd45e39f8069e28e002ed7ec6da0bfcadb43ef154f9'
OLD_API='sha256:00c28aaa1b7dfe3ce699b2b899a24aa4f5924d89a5d360422b252500df8ae9f3'
OVERRIDE='docker-compose.izclick-v2-candidate.yaml'
C=(docker compose --env-file plane.env -f docker-compose.yaml -f docker-compose.izclick.yaml -f docker-compose.izclick-pilot.yaml -f docker-compose.izclick-release.yaml)
V=("${C[@]}" -f "$OVERRIDE")
test -f "$OVERRIDE"
grep -Fq "image: $EXPECTED_WEB" "$OVERRIDE"
grep -Fq "image: $EXPECTED_API" "$OVERRIDE"
"${V[@]}" config --quiet
docker image inspect "$EXPECTED_WEB" "$EXPECTED_API" "$OLD_WEB" "$OLD_API" >/dev/null
test "$(docker inspect -f '{{.Image}}' plane-app-web-1)" = "$OLD_WEB"
test "$(docker inspect -f '{{.Image}}' plane-app-api-1)" = "$OLD_API"
baseline=$(docker exec plane-app-plane-db-1 sh -c 'PGHOST=/var/run/postgresql psql -U "${POSTGRES_USER:-plane}" -d "${POSTGRES_DB:-plane}" -Atc "SELECT (SELECT count(*) FROM public.projects),(SELECT count(*) FROM public.states),(SELECT count(*) FROM public.issues)"')
echo "BASELINE_COUNTS=$baseline"
# Fresh host-local backup before any migration or service replacement
/usr/local/sbin/izclick-controlled-ops backup
echo "BACKUP_CREATED"
# Candidate container against existing production DB, using existing Compose settings
"${V[@]}" run --rm --no-deps --entrypoint python api manage.py migrate db 0124 --noinput
echo "MIGRATION_0124_DONE"
# Recreate API and Web only. No down, no volume flags.
if ! "${V[@]}" up -d --no-deps api web; then
  echo "UPDATE_FAILED attempting image rollback" >&2
  "${C[@]}" up -d --no-deps api web || true
  exit 1
fi
sleep 12
actual_web=$(docker inspect -f '{{.Image}}' plane-app-web-1)
actual_api=$(docker inspect -f '{{.Image}}' plane-app-api-1)
want_web=$(docker image inspect -f '{{.Id}}' "$EXPECTED_WEB")
want_api=$(docker image inspect -f '{{.Id}}' "$EXPECTED_API")
if [ "$actual_web" != "$want_web" ] || [ "$actual_api" != "$want_api" ]; then
  echo "IMAGE_VALIDATION_FAILED attempting image rollback" >&2
  "${C[@]}" up -d --no-deps api web || true
  exit 1
fi
test "$(docker inspect -f '{{.State.Running}}' plane-app-web-1)" = true
test "$(docker inspect -f '{{.State.Running}}' plane-app-api-1)" = true
health_web=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' plane-app-web-1)
if [ "$health_web" = unhealthy ]; then
  echo "WEB_UNHEALTHY rollback" >&2
  "${C[@]}" up -d --no-deps api web || true
  exit 1
fi
after=$(docker exec plane-app-plane-db-1 sh -c 'PGHOST=/var/run/postgresql psql -U "${POSTGRES_USER:-plane}" -d "${POSTGRES_DB:-plane}" -Atc "SELECT (SELECT count(*) FROM public.projects),(SELECT count(*) FROM public.states),(SELECT count(*) FROM public.issues)"')
if [ "$after" != "$baseline" ]; then
  echo "DATA_COUNTS_CHANGED before=$baseline after=$after; manual investigation required" >&2
  "${C[@]}" up -d --no-deps api web || true
  exit 1
fi
echo "V2_DEPLOYED_BASIC_CHECKS_OK"
echo "AFTER_COUNTS=$after"
echo "MANUAL_AUTHENTICATED_SMOKE_TEST_REQUIRED"
