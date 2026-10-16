#!/usr/bin/env bash
# Deploy only the IZ-Click notification candidate; Web, DB, MinIO are untouched.
set -Eeuo pipefail
cd /opt/iz-click/plane-app
umask 077
NEW='ghcr.io/paolobp82/izclick-api:email-candidate-b515616cf8e8b453a13b0edb8f79a0b01d5fbfd6'
WEB_ID='sha256:191ce35fce42898abb2fc65b00c3e4698943251bcca0f9eba1d302de508b96e8'
OLD_API_ID='sha256:7c49543a3af2a64509cf1a6e2ffa79cb9c3c10292d85e1ac97230499f0b80cb4'
OVERLAY=docker-compose.izclick-v2-candidate.yaml
test -f "$OVERLAY"
C=(docker compose --env-file plane.env -f docker-compose.yaml -f docker-compose.izclick.yaml -f docker-compose.izclick-pilot.yaml -f docker-compose.izclick-release.yaml -f "$OVERLAY")
test "$(docker inspect -f '{{.Image}}' plane-app-web-1)" = "$WEB_ID"
test "$(docker inspect -f '{{.Image}}' plane-app-api-1)" = "$OLD_API_ID"
"${C[@]}" config --quiet
docker pull "$NEW"
docker image inspect "$NEW" >/dev/null
DATA_BEFORE=$(docker exec plane-app-plane-db-1 sh -c 'PGHOST=/var/run/postgresql psql -U "${POSTGRES_USER:-plane}" -d "${POSTGRES_DB:-plane}" -Atc "SELECT (SELECT count(*) FROM public.projects),(SELECT count(*) FROM public.states),(SELECT count(*) FROM public.issues)"')
echo "BASELINE_COUNTS=$DATA_BEFORE"
/usr/local/sbin/izclick-controlled-ops backup
cat > docker-compose.izclick-email-candidate.yaml <<EOF
services:
  api:
    image: $NEW
  worker:
    image: $NEW
  beat-worker:
    image: $NEW
EOF
chmod 600 docker-compose.izclick-email-candidate.yaml
D=("${C[@]}" -f docker-compose.izclick-email-candidate.yaml)
"${D[@]}" config --quiet
rollback() {
  echo "EMAIL_RELEASE_ROLLBACK_START"
  "${C[@]}" up -d --no-deps --force-recreate api worker beat-worker || true
  echo "EMAIL_RELEASE_ROLLBACK_DONE"
}
ROLLBACK_NEEDED=1
trap 'if [ "$ROLLBACK_NEEDED" = 1 ]; then rollback; fi' ERR
"${D[@]}" up -d --no-deps api worker beat-worker
for n in $(seq 1 30); do
  sleep 5
  API_RUNNING=$(docker inspect -f '{{.State.Running}}' plane-app-api-1)
  WORKER_RUNNING=$(docker inspect -f '{{.State.Running}}' plane-app-worker-1)
  BEAT_RUNNING=$(docker inspect -f '{{.State.Running}}' plane-app-beat-worker-1)
  CODE=$(curl -sSL --max-time 10 -o /dev/null -w '%{http_code}' https://izclick.izango.com.pe/api/instances/ || true)
  if [ "$API_RUNNING" = true ] && [ "$WORKER_RUNNING" = true ] && [ "$BEAT_RUNNING" = true ] && [ "$CODE" = 200 ]; then
    break
  fi
done
test "$API_RUNNING" = true
test "$WORKER_RUNNING" = true
test "$BEAT_RUNNING" = true
test "$CODE" = 200
NEW_ID=$(docker image inspect -f '{{.Id}}' "$NEW")
for container in plane-app-api-1 plane-app-worker-1 plane-app-beat-worker-1; do
  test "$(docker inspect -f '{{.Image}}' "$container")" = "$NEW_ID"
done
DATA_AFTER=$(docker exec plane-app-plane-db-1 sh -c 'PGHOST=/var/run/postgresql psql -U "${POSTGRES_USER:-plane}" -d "${POSTGRES_DB:-plane}" -Atc "SELECT (SELECT count(*) FROM public.projects),(SELECT count(*) FROM public.states),(SELECT count(*) FROM public.issues)"')
test "$DATA_BEFORE" = "$DATA_AFTER"
test "$(docker inspect -f '{{.Image}}' plane-app-web-1)" = "$WEB_ID"
ROLLBACK_NEEDED=0
trap - ERR
echo "IZCLICK_EMAIL_SERVICES_UPDATED"
echo "DATA_COUNTS=$DATA_AFTER"
echo "SMTP_TEST_DELIVERY_PENDING"
