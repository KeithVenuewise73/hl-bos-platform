#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; KPI="$HERE/../hscs-kpi-rls-fix"
BIN=/usr/lib/postgresql/16/bin; WORK=/tmp/hscs-rec-lock; PORT=5458
id pgtest >/dev/null 2>&1 || useradd -m pgtest
rm -rf "$WORK"; mkdir -p "$WORK"; chown pgtest "$WORK"; chmod a+rx "$HERE" "$KPI" "$HERE"/*.sql "$KPI"/*.sql
run() { su pgtest -c "$*"; }
run "$BIN/initdb -D $WORK/data -U postgres --auth=trust >/dev/null"
run "$BIN/pg_ctl -D $WORK/data -o '-p $PORT -k $WORK' -l $WORK/log -w start >/dev/null"
trap 'run "$BIN/pg_ctl -D $WORK/data -m immediate stop >/dev/null" || true' EXIT
P() { run "$BIN/psql -X -q -h $WORK -p $PORT -U postgres -v ON_ERROR_STOP=1 $*"; }
P "-c 'create database rec'"; D="-d rec"
for f in "$KPI/replica.sql" "$KPI/helpers.sql" "$HERE/helpers_recovery.sql" "$HERE/replica_recovery.sql" "$HERE/migration.sql"; do P "$D -f $f" >/dev/null 2>&1; done
echo "== migration applied; tested suite:"; P "$D -f $HERE/after.sql" 2>&1 | grep -E 'CONFIRMED|FAIL'
echo "== apply lockdown"; P "$D -f $HERE/lockdown.sql" >/dev/null 2>&1 && echo "   applied"; P "$D -f $HERE/lockdown.sql" >/dev/null 2>&1 && echo "   applied twice (idempotent)"
echo "== lockdown suite"; P "$D -f $HERE/lockdown_test.sql" 2>&1 | grep -E 'PASS|FAIL|CONFIRMED' | sed -E 's/^psql:[^ ]+ NOTICE:  //'
echo "== lockdown is real: the earlier 'intake allowed' check must now FAIL"
if P "$D -f $HERE/after.sql" >/dev/null 2>&1; then echo "   after.sql still passes: LOCKDOWN HAD NO EFFECT"; exit 1; else echo "   after.sql fails on the intake checks, as it should"; fi
