#!/usr/bin/env bash
# Run pgTAP-style test files against the local throwaway DB using the shim.
# Usage: PGHOST=/tmp PGPORT=54329 PGUSER=postgres scripts/local-db/run-tests.sh [dbname] [test-glob]
set -uo pipefail
DB="${1:-hlbos_local}"; GLOB="${2:-*.sql}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
psql -qX -d "$DB" -f "$ROOT/scripts/local-db/pgtap_shim.sql" >/dev/null 2>&1
rc=0
cd "$ROOT/supabase/tests"
for t in $GLOB; do
  out=$(psql -qtAX -v ON_ERROR_STOP=0 -d "$DB" -f "$t" 2>&1)
  if grep -qE "^not ok|^# Looks like|ERROR:" <<<"$out" || ! grep -q "^# all " <<<"$out"; then
    echo "FAIL $t"; grep -E "^not ok|^#|ERROR|^psql" <<<"$out" | head -12; rc=1
  else echo "PASS $t  $(grep '^# all' <<<"$out")"; fi
done
exit $rc
