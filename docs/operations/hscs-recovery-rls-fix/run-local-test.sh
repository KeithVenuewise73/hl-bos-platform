#!/usr/bin/env bash
# Throwaway local PostgreSQL. Never touches Supabase. Reuses the KPI fix's replica (roles, auth.uid, hscs_glp, fixtures) and helpers.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; KPI="$HERE/../hscs-kpi-rls-fix"
BIN=/usr/lib/postgresql/16/bin; WORK=/tmp/hscs-rec-test; PORT=5457
id pgtest >/dev/null 2>&1 || useradd -m pgtest
rm -rf "$WORK"; mkdir -p "$WORK"; chown pgtest "$WORK"; chmod a+rx "$HERE" "$KPI" "$HERE"/*.sql "$KPI"/*.sql
run() { su pgtest -c "$*"; }
run "$BIN/initdb -D $WORK/data -U postgres --auth=trust >/dev/null"
run "$BIN/pg_ctl -D $WORK/data -o '-p $PORT -k $WORK' -l $WORK/log -w start >/dev/null"
trap 'run "$BIN/pg_ctl -D $WORK/data -m immediate stop >/dev/null" || true' EXIT
P() { run "$BIN/psql -X -q -h $WORK -p $PORT -U postgres -v ON_ERROR_STOP=1 $*"; }
show() { grep -E 'PASS|FAIL|CONFIRMED' || true; }
P "-c 'create database rec'"; D="-d rec"
for f in "$KPI/replica.sql" "$KPI/helpers.sql" "$HERE/helpers_recovery.sql" "$HERE/replica_recovery.sql"; do P "$D -f $f"; done
echo "== 1. BEFORE the fix (must show the holes)"; P "$D -f $HERE/before.sql" 2>&1 | show
echo "== 2. apply migration"; P "$D -f $HERE/migration.sql" >/dev/null 2>&1 && echo "   applied"
echo "== 3. AFTER the fix"; P "$D -f $HERE/after.sql" 2>&1 | show
echo "== 4. idempotent: apply again, rerun suite"; P "$D -f $HERE/migration.sql" >/dev/null 2>&1; P "$D -f $HERE/after.sql" 2>&1 | grep -c 'PASS' | sed 's/^/   passes: /'
echo "== 5. MUTATION A: reopen a table policy for any signed-in user; suite must FAIL"
P "$D -c \"create policy sneaky on public.recovery_clients for select to authenticated using (true)\""
if P "$D -f $HERE/after.sql" >/dev/null 2>&1; then echo "   SUITE DID NOT CATCH IT"; exit 1; else echo "   suite failed as it should"; fi
P "$D -c 'drop policy sneaky on public.recovery_clients'"
echo "== 6. MUTATION B: reopen the bucket upload policy; suite must FAIL"
P "$D -c \"create policy sneaky2 on storage.objects for insert to public with check (bucket_id = 'recovery-documents')\""
if P "$D -f $HERE/after.sql" >/dev/null 2>&1; then echo "   SUITE DID NOT CATCH IT"; exit 1; else echo "   suite failed as it should"; fi
P "$D -c 'drop policy sneaky2 on storage.objects'"
echo "== 7. suite passes again after undoing both mutations"; P "$D -f $HERE/after.sql" 2>&1 | grep CONFIRMED
echo "== 8. rollback.sql restores the open state"; P "$D -f $HERE/rollback.sql" >/dev/null; P "$D -f $HERE/before.sql" 2>&1 | grep CONFIRMED
echo "ALL LOCAL CHECKS DONE"
