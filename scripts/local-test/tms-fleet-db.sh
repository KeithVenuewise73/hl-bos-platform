#!/usr/bin/env bash
# Builds an ISOLATED local database containing the production fleet backend,
# recovered from HL-BOS Core's migration history, on top of the HL-BOS
# platform migrations it depends on (platform.tenants, tenant_is_operable).
#
# Never touches a Supabase project. Needs a local PostgreSQL reachable through
# PGHOST/PGPORT/PGUSER (superuser). Default: socket /tmp/tmspg, port 5434.
#
#   bash scripts/local-test/tms-fleet-db.sh        # (re)creates database tms_fleet
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export PGHOST="${PGHOST:-/tmp/tmspg}" PGPORT="${PGPORT:-5434}" PGUSER="${PGUSER:-postgres}"
DB="${TMS_DB:-tms_fleet}"
PSQL=(psql -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB"
"${PSQL[@]}" -d "$DB" -f "$ROOT/scripts/local-test/supabase-shim.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/scripts/local-test/tms-fleet-shim.sql" >/dev/null
echo "shim applied"

# The HL-BOS platform migrations the fleet SQL depends on (0001-0008).
# pgTAP is a test-only extension that is not installed here and that nothing in
# fleet uses, so its single CREATE EXTENSION line is skipped.
for f in "$ROOT"/supabase/migrations/2026071801*_hlbos_000[1-8]_*.sql; do
  sed '/create extension if not exists pgtap/d' "$f" | "${PSQL[@]}" -d "$DB" >/dev/null
  echo "APPLIED  $(basename "$f")"
done

# The seven production migrations recovered verbatim (2026-10-17), in order.
for f in "$ROOT"/supabase/recovered/production-2026-10-17/*.sql; do
  "${PSQL[@]}" -d "$DB" -f "$f" >/dev/null
  echo "APPLIED  recovered/$(basename "$f")"
done
"${PSQL[@]}" -d "$DB" -tAc "select 'fleet tables: '||count(*) from pg_tables where schemaname='fleet'"
"${PSQL[@]}" -d "$DB" -tAc "select 'scorecard tables: '||count(*) from pg_tables where schemaname='scorecard'"
