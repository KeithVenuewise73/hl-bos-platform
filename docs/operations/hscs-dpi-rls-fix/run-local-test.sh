#!/usr/bin/env bash
# Throwaway local PostgreSQL. Never touches Supabase. Reuses the KPI fix's replica, helpers and migration,
# because the dpi migration depends on the helpers that migration creates.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; KPI="$HERE/../hscs-kpi-rls-fix"
BIN=/usr/lib/postgresql/16/bin; WORK=/tmp/hscs-dpi-test; PORT=5456
id pgtest >/dev/null 2>&1 || useradd -m pgtest
rm -rf "$WORK"; mkdir -p "$WORK"; chown pgtest "$WORK"; chmod a+rx "$HERE" "$KPI" "$HERE"/*.sql "$KPI"/*.sql
run() { su pgtest -c "$*"; }
run "$BIN/initdb -D $WORK/data -U postgres --auth=trust >/dev/null"
run "$BIN/pg_ctl -D $WORK/data -o '-p $PORT -k $WORK' -l $WORK/log -w start >/dev/null"
trap 'run "$BIN/pg_ctl -D $WORK/data -m immediate stop >/dev/null" || true' EXIT
P() { run "$BIN/psql -X -q -h $WORK -p $PORT -U postgres -v ON_ERROR_STOP=1 $*"; }
show() { grep -E 'PASS|FAIL|CONFIRMED' || true; }
P "-c 'create database dpi'"; P "-c 'create database lonely'"
D="-d dpi"
for f in "$KPI/replica.sql" "$KPI/helpers.sql" "$HERE/replica_dpi.sql"; do P "$D -f $f"; done
echo "== 1. BEFORE the dpi fix (must show the hole)"; P "$D -f $HERE/before.sql" 2>&1 | show
echo "== 2. guard: dpi migration refuses to run before the KPI migration"
OUT=$(P "$D -f $HERE/migration.sql" 2>&1 || true)
if grep -q 'Apply hscs-kpi-rls-fix/migration.sql first' <<<"$OUT"; then echo "   refused, as it should"; else echo "   GUARD DID NOT FIRE: $OUT"; exit 1; fi
echo "== 3. apply KPI migration, then dpi migration"; P "$D -f $KPI/migration.sql" >/dev/null 2>&1; P "$D -f $HERE/migration.sql" >/dev/null 2>&1 && echo "   applied"
echo "== 4. AFTER the dpi fix"; P "$D -f $HERE/after.sql" 2>&1 | show
echo "== 5. idempotent: apply again, rerun suite"; P "$D -f $HERE/migration.sql" >/dev/null 2>&1; P "$D -f $HERE/after.sql" 2>&1 | grep -c 'PASS' | sed 's/^/   passes: /'
echo "== 6. KPI suite still passes after the dpi fix (nothing broken)"; P "$D -f $KPI/after.sql" 2>&1 | grep -E 'CONFIRMED|FAIL'
echo "== 7. MUTATION: reopen one dpi table; the suite must FAIL"
P "$D -c \"create policy sneaky on dpi.deliveries for select to public using (true); grant select on dpi.deliveries to anon\""
if P "$D -f $HERE/after.sql" >/dev/null 2>&1; then echo "   SUITE DID NOT CATCH THE MUTATION"; exit 1; else echo "   suite failed as it should"; fi
P "$D -c 'drop policy sneaky on dpi.deliveries; revoke select on dpi.deliveries from anon'"
echo "== 8. rollback.sql restores the open state"; P "$D -f $HERE/rollback.sql" >/dev/null; P "$D -f $HERE/before.sql" 2>&1 | grep CONFIRMED
echo "ALL LOCAL CHECKS DONE"
