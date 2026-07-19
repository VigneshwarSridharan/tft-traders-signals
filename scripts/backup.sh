#!/usr/bin/env bash
# Dumps the Postgres database from the running docker-compose stack to a
# timestamped, gzip-compressed file. See docs/BACKUP.md for the full runbook
# (schedule, retention, off-site copy, restore drill).
#
# Usage: scripts/backup.sh [output-dir]
set -euo pipefail

OUT_DIR="${1:-./backups}"
POSTGRES_USER="${POSTGRES_USER:-tft}"
POSTGRES_DB="${POSTGRES_DB:-tft_traders_signals}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILENAME="${POSTGRES_DB}_${TIMESTAMP}.sql.gz"

mkdir -p "$OUT_DIR"

echo "Dumping ${POSTGRES_DB} (user: ${POSTGRES_USER}) from the postgres service..."
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip > "${OUT_DIR}/${FILENAME}"

SIZE="$(du -h "${OUT_DIR}/${FILENAME}" | cut -f1)"
echo "Wrote ${OUT_DIR}/${FILENAME} (${SIZE})"

echo "Pruning backups older than ${RETENTION_DAYS} days in ${OUT_DIR}..."
find "$OUT_DIR" -name "${POSTGRES_DB}_*.sql.gz" -mtime "+${RETENTION_DAYS}" -print -delete

echo "Done. Remember: a backup you haven't restored isn't verified — see docs/BACKUP.md's restore drill."
