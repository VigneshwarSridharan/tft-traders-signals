#!/usr/bin/env bash
# Restores a Postgres dump produced by scripts/backup.sh into the running
# docker-compose stack's postgres service. Destructive — see docs/BACKUP.md.
#
# Usage: scripts/restore.sh <path-to-dump.sql.gz> [--yes]
set -euo pipefail

DUMP_FILE="${1:-}"
CONFIRM="${2:-}"
POSTGRES_USER="${POSTGRES_USER:-tft}"
POSTGRES_DB="${POSTGRES_DB:-tft_traders_signals}"

if [[ -z "$DUMP_FILE" || ! -f "$DUMP_FILE" ]]; then
  echo "Usage: scripts/restore.sh <path-to-dump.sql.gz> [--yes]" >&2
  echo "Error: dump file not found: '${DUMP_FILE}'" >&2
  exit 1
fi

if [[ "$CONFIRM" != "--yes" ]]; then
  echo "This will DROP and recreate the '${POSTGRES_DB}' database on the running"
  echo "postgres service, replacing all current data with the contents of:"
  echo "  ${DUMP_FILE}"
  read -r -p "Type the database name (${POSTGRES_DB}) to confirm: " typed
  if [[ "$typed" != "$POSTGRES_DB" ]]; then
    echo "Aborted: confirmation did not match." >&2
    exit 1
  fi
fi

echo "Terminating existing connections to ${POSTGRES_DB}..."
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${POSTGRES_DB}' AND pid <> pg_backend_pid();"

echo "Dropping and recreating ${POSTGRES_DB}..."
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS ${POSTGRES_DB};"
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE ${POSTGRES_DB} OWNER ${POSTGRES_USER};"

echo "Restoring from ${DUMP_FILE}..."
gunzip -c "$DUMP_FILE" | docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

echo "Restore complete. Verify with: docker compose exec postgres psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c '\\dt'"
