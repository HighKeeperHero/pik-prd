#!/usr/bin/env bash
# backend/scripts/backup-db.sh
# External safety-copy of the Postgres DB via pg_dump.
#
# PRIMARY backups should be Railway's managed Postgres backups (enable in
# the Railway dashboard — see docs/ops/backend-uptime.md). This script is a
# portable SECOND copy you can schedule anywhere (Railway cron, a GitHub
# Action, or a laptop). Off-box copies matter: the 2026-05-05 wipe had no
# recoverable backup.
#
# Required env:
#   BACKUP_DATABASE_URL   Postgres connection string to dump (the PROD URL).
#                         NEVER commit this — pass it via the scheduler's env.
# Optional env:
#   BACKUP_DIR            local output dir (default ./backups)
#   BACKUP_S3_TARGET      if set (s3://bucket/path for aws, or an rclone
#                         remote:path), the dump is uploaded then removed
#                         locally. Otherwise the .dump is left on disk.
set -euo pipefail

: "${BACKUP_DATABASE_URL:?set BACKUP_DATABASE_URL to the DB you want to dump}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$BACKUP_DIR/pik-${STAMP}.dump"

echo "[backup] dumping → $FILE"
# custom format = compressed + restorable selectively via pg_restore
pg_dump --format=custom --no-owner --no-privileges "$BACKUP_DATABASE_URL" > "$FILE"
echo "[backup] size: $(du -h "$FILE" | cut -f1)"

if [[ -n "${BACKUP_S3_TARGET:-}" ]]; then
  echo "[backup] uploading → $BACKUP_S3_TARGET"
  if command -v aws >/dev/null 2>&1 && [[ "$BACKUP_S3_TARGET" == s3://* ]]; then
    aws s3 cp "$FILE" "$BACKUP_S3_TARGET/"
  elif command -v rclone >/dev/null 2>&1; then
    rclone copy "$FILE" "$BACKUP_S3_TARGET"
  else
    echo "[backup] WARN: no aws/rclone CLI found; leaving local copy at $FILE" >&2
    exit 0
  fi
  rm -f "$FILE"
  echo "[backup] uploaded + local copy removed"
fi
echo "[backup] done"
# Restore: pg_restore --clean --no-owner -d "$TARGET_DATABASE_URL" pik-<stamp>.dump
