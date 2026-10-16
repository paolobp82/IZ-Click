#!/usr/bin/env bash
set -Eeuo pipefail
PATH=/usr/sbin:/usr/bin:/sbin:/bin
IMAGE=ghcr.io/paolobp82/izclick-api:preview-clickup-9ec35bf5e0d32676d37533e33a5548d1a90d1e85
BACKUP=$(find /home/izango -maxdepth 2 -path '/home/izango/izclick-automated-*/postgres.dump' -type f -print | sort | tail -n 1)
test -n "$BACKUP" && test -s "$BACKUP"
ID="$(date -u +%s)-$$"
NET="izclick-migtest-$ID"
DB="izclick-migdb-$ID"
REDIS="izclick-migredis-$ID"
WORK="$(mktemp -d)"
cleanup() {
  docker rm -f "$DB" "$REDIS" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  rm -rf -- "$WORK"
}
trap cleanup EXIT
docker network create --internal "$NET" >/dev/null
docker run -d --rm --network "$NET" --name "$DB" -e POSTGRES_HOST_AUTH_METHOD=trust postgres:15.7-alpine >/dev/null
docker run -d --rm --network "$NET" --name "$REDIS" valkey/valkey:7.2.11-alpine >/dev/null
READY=no
for i in $(seq 1 40); do
  if docker exec "$DB" pg_isready -U postgres -q >/dev/null 2>&1; then READY=yes; break; fi
  sleep 1
done
test "$READY" = yes
docker cp "$BACKUP" "$DB:/tmp/backup.dump"
docker exec -u root "$DB" chown postgres:postgres /tmp/backup.dump
docker exec -u postgres "$DB" createdb izclick_verify
docker exec -u postgres "$DB" pg_restore -U postgres -d izclick_verify --no-owner --no-acl --exit-on-error /tmp/backup.dump
SQL="SELECT 'project|'||id::text FROM public.projects UNION ALL SELECT 'state|'||id::text||'|'||name FROM public.states UNION ALL SELECT 'issue|'||id::text||'|'||state_id::text FROM public.issues"
docker exec -u postgres "$DB" psql -U postgres -d izclick_verify -Atc "$SQL" | LC_ALL=C sort > "$WORK/before"
docker run --rm --network "$NET" --entrypoint python -e DATABASE_URL="postgresql://postgres@${DB}:5432/izclick_verify" -e REDIS_URL="redis://${REDIS}:6379/0" -e SECRET_KEY="isolated-test-only-not-for-production" -e DEBUG=0 "$IMAGE" manage.py migrate db 0124 --noinput
docker exec -u postgres "$DB" psql -U postgres -d izclick_verify -Atc "$SQL" | LC_ALL=C sort > "$WORK/after"
diff -u "$WORK/before" "$WORK/after"
COUNTS="$(docker exec -u postgres "$DB" psql -U postgres -d izclick_verify -Atc 'SELECT (SELECT count(*) FROM public.projects),(SELECT count(*) FROM public.states),(SELECT count(*) FROM public.issues)')"
test "$COUNTS" = "1|10|9" || { echo "Unexpected row counts: $COUNTS" >&2; exit 1; }
docker exec -u postgres "$DB" psql -U postgres -d izclick_verify -Atc "SELECT name FROM django_migrations WHERE app='db' AND name='0124_izclick_custom_fields'" | grep -qx 0124_izclick_custom_fields
echo "ISOLATED_MIGRATION_0124_OK"
echo "PROJECTS_STATES_ISSUES=$COUNTS"
