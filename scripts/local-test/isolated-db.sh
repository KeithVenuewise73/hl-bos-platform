#!/usr/bin/env bash
# Builds an ISOLATED local PostgreSQL database for HL-BOS commercial products:
#
#   1. the Supabase shim (roles, auth, storage) + supabase-shim-extra.sql
#   2. every migration in supabase/migrations, in order
#   3. any extra SQL directories named in TMS_EXTRA_SQL / extra arguments
#      (e.g. recovered production SQL, a product's carried-over migrations)
#   4. supabase/proposed/*.sql, in order
#
# Never touches a Supabase project: it refuses any PGHOST that is not a local
# socket or localhost. Default target: socket /tmp/tmspg, port 5434.
#
#   bash scripts/local-test/isolated-db.sh [extra-sql-dir ...]
#   HLBOS_DB=name bash scripts/local-test/isolated-db.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export PGHOST="${PGHOST:-/tmp/tmspg}" PGPORT="${PGPORT:-5434}" PGUSER="${PGUSER:-postgres}"
case "$PGHOST" in /*|localhost|127.0.0.1) ;; *) echo "refusing non-local PGHOST=$PGHOST" >&2; exit 2 ;; esac
DB="${HLBOS_DB:-hlbos_isolated}"
PSQL=(psql -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -d postgres -c "drop database if exists $DB with (force)" -c "create database $DB"
"${PSQL[@]}" -d "$DB" -f "$ROOT/scripts/local-test/supabase-shim.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/scripts/local-test/supabase-shim-extra.sql" >/dev/null
n=0
for f in "$ROOT"/supabase/migrations/*.sql; do
  # pgTAP is test-only and not installed here; nothing outside tests uses it.
  sed '/create extension if not exists pgtap/d' "$f" | "${PSQL[@]}" -d "$DB" >/dev/null 2>/tmp/isolated-db.err \
    || { echo "FAILED $(basename "$f")"; cat /tmp/isolated-db.err; exit 1; }
  n=$((n+1))
done
echo "applied $n migrations from supabase/migrations"
for dir in "$@"; do
  for f in "$dir"/*.sql; do
    "${PSQL[@]}" -d "$DB" -f "$f" >/dev/null 2>/tmp/isolated-db.err || { echo "FAILED $f"; cat /tmp/isolated-db.err; exit 1; }
    echo "applied $(basename "$f")"
  done
done
for f in "$ROOT"/supabase/proposed/*.sql; do
  "${PSQL[@]}" -d "$DB" -f "$f" >/dev/null 2>/tmp/isolated-db.err || { echo "FAILED $f"; cat /tmp/isolated-db.err; exit 1; }
  echo "applied proposed/$(basename "$f")"
done
echo "database $DB ready"
