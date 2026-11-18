#!/usr/bin/env bash
# Runs the whole experiment against a throwaway local PostgreSQL. Never touches Supabase.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BIN=/usr/lib/postgresql/16/bin
WORK=/tmp/hscs-kpi-test; PORT=5455
id pgtest >/dev/null 2>&1 || useradd -m pgtest
rm -rf "$WORK"; mkdir -p "$WORK"; chown pgtest "$WORK"; chmod a+rx "$HERE" "$HERE"/*.sql
run() { su pgtest -c "$*"; }
run "$BIN/initdb -D $WORK/data -U postgres --auth=trust >/dev/null"
run "$BIN/pg_ctl -D $WORK/data -o '-p $PORT -k $WORK' -l $WORK/log -w start >/dev/null"
trap 'run "$BIN/pg_ctl -D $WORK/data -m immediate stop >/dev/null" || true' EXIT
P() { run "$BIN/psql -X -q -h $WORK -p $PORT -U postgres -v ON_ERROR_STOP=1 $*"; }
P "-c 'create database kpi'"
D="-d kpi"
for f in replica.sql helpers.sql; do P "$D -f $HERE/$f"; done
echo "== 1. BEFORE the fix (must show the hole)"; P "$D -f $HERE/before.sql" 2>&1 | grep -E 'PASS|FAIL|CONFIRMED'
echo "== 2. apply migration.sql";                 P "$D -f $HERE/migration.sql" 2>&1 | tail -1
echo "== 3. AFTER the fix";                       P "$D -f $HERE/after.sql" 2>&1 | grep -E 'PASS|FAIL|CONFIRMED'
echo "== 4. migration is idempotent (apply again, rerun suite)"
P "$D -f $HERE/migration.sql" >/dev/null; P "$D -f $HERE/after.sql" 2>&1 | grep -cE 'PASS' | sed 's/^/   passes: /'
echo "== 5. MUTATION: reopen one table's policy; the suite must FAIL"
P "$D -c \"create policy sneaky on public.ltr_data for select to anon using (true); grant select on public.ltr_data to anon\""
if P "$D -f $HERE/after.sql" >/dev/null 2>&1; then echo "   SUITE DID NOT CATCH THE MUTATION"; exit 1; else echo "   suite failed as it should"; fi
P "$D -c 'drop policy sneaky on public.ltr_data; revoke select on public.ltr_data from anon'"
echo "== 6. rollback.sql restores the open state (before-suite passes again)"
P "$D -f $HERE/rollback.sql" >/dev/null; P "$D -f $HERE/before.sql" 2>&1 | grep -E 'CONFIRMED'
echo "ALL LOCAL CHECKS DONE"
