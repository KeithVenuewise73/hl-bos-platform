#!/usr/bin/env bash
# Rebuild a throwaway local database from the repo migrations (+ any extra dirs).
# Usage: PGHOST=/tmp PGPORT=54329 PGUSER=postgres scripts/local-db/reset.sh [dbname]
set -euo pipefail
DB="${1:-hlbos_local}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
psql -qd postgres -c "drop database if exists $DB" -c "create database $DB"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/scripts/local-db/bootstrap.sql"
for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  # Only migrations that the shared platform + product slices need. Product-specific
  # historical migrations unrelated to this stack are skipped unless LOCAL_ALL=1.
  b=$(basename "$f")
  if [ "${LOCAL_ALL:-0}" != "1" ] && ! grep -qE "hlbos_(000[1-9]|001[0-9]|01[0-9]{2})_" <<<"$b"; then continue; fi
  # pgTAP is not installed locally; the extension line is stripped in memory only.
  sed '/create extension if not exists pgtap/d' "$f" | psql -q -v ON_ERROR_STOP=1 -d "$DB" -f - >/dev/null 2>"/tmp/reset_err.txt" \
    || { echo "FAILED: $b"; cat /tmp/reset_err.txt; exit 1; }
  echo "applied $b"
done
