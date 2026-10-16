#!/usr/bin/env bash
# Restore latest MinIO archive to disposable Docker volume and verify bytes.
set -Eeuo pipefail
PATH=/usr/sbin:/usr/bin:/sbin:/bin
BACKUP=$(find /home/izango -maxdepth 2 -path '/home/izango/izclick-automated-*/minio.tar.gz' -type f -print | sort | tail -n 1)
test -n "$BACKUP" && test -s "$BACKUP"
DIR=$(dirname "$BACKUP")
(cd "$DIR" && sha256sum -c SHA256SUMS --status)
ID=$(date -u +%s)-$$
VOL="izclick-minio-verify-$ID"
cleanup(){ docker volume rm -f "$VOL" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker volume create "$VOL" >/dev/null
docker run --rm -v "$DIR:/backup:ro" -v "$VOL:/restore" alpine:3.20 sh -ec 'cd /restore; tar -xzf /backup/minio.tar.gz'
docker run --rm -v "$DIR:/backup:ro" -v "$VOL:/restore:ro" alpine:3.20 sh -ec '
  cd /restore
  tar -tzf /backup/minio.tar.gz | while IFS= read -r f; do
    case "$f" in .|./) continue;; esac
    case "$f" in /*|*../*) echo "Unsafe archive path" >&2; exit 1;; esac
    if [ -f "$f" ]; then tar -xOzf /backup/minio.tar.gz "$f" | sha256sum | cut -d" " -f1 > /tmp/expected-sha; sha256sum "$f" | cut -d" " -f1 > /tmp/actual-sha; cmp -s /tmp/expected-sha /tmp/actual-sha || exit 1; fi
  done
  echo "RESTORED_FILES=$(find . -type f | wc -l)"
'
echo "MINIO_ARCHIVE_RESTORE_OK"
echo "This checks recovered file bytes, not MinIO API object reads."
