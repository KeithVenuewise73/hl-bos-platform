#!/usr/bin/env bash
# What would `supabase db push` do to production? Measured, not inferred.
#
# On a DISPOSABLE production-equivalent copy (build-prod-equivalent.sh), for each
# replay hazard reported by scripts/check-replay-safety.mjs:
#   1. replay main's file alone, in one transaction, and report whether it fails
#      and which functions' LOGIC (comments/whitespace ignored) it changes;
#   2. then simulate the push: every not-yet-applied main file in version order,
#      one transaction each, stopping at the first failure (as the CLI does).
# Never connects to a hosted project.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres scripts/local-test/replay-hazard-matrix.sh
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT"
case "${PGHOST:-}" in /*|localhost|127.0.0.1) ;; *) echo "Refusing non-local PGHOST '${PGHOST:-}'"; exit 1;; esac
export PGOPTIONS="${PGOPTIONS:-} -c search_path=\"\$user\",public,extensions"
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
bash scripts/local-test/build-prod-equivalent.sh rh_base >/dev/null
strip() { sed -E '/create extension if not exists (pgtap|pg_net|pg_cron)/d' "$1"; }
# Each function's body with comments and whitespace removed, hashed: logic changes only.
logic() {
  psql -qAtF$'\t' -d "$1" -c "select p.oid::regprocedure::text,
      md5(btrim(regexp_replace(regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.prokind in ('f','p') and n.nspname not in ('pg_catalog','information_schema','extensions','auth','storage','realtime',
      'vault','graphql','graphql_public','net','cron','pgbouncer','supabase_functions','tests')" | LC_ALL=C sort
}
logic rh_base > "$W/base"
node -e 'import("./scripts/check-replay-safety.mjs").then(m=>m.classify().filter(r=>r.status!="applied").forEach(r=>console.log(r.file, r.status, r.productionVersion??"-", r.sameContent??"-")))' > "$W/todo"
echo "# 1. Each hazard replayed alone"
printf 'migration\tproduction_version\tsame_sql\treplay_result\tlogic_reverted\n'
while read -r f st pv same; do
  [ "$st" = replay_hazard ] || continue
  psql -qd postgres -c "drop database if exists rh_one" -c "create database rh_one template rh_base" >/dev/null 2>&1
  if strip "supabase/migrations/$f" | psql -q --single-transaction -v ON_ERROR_STOP=1 -d rh_one -f - >/dev/null 2>"$W/err"; then res=ok
  else res="FAILS: $(grep -m1 -o 'ERROR: .*' "$W/err" | cut -c8-90)"; fi
  logic rh_one > "$W/one"
  rev=$(LC_ALL=C join -t$'\t' "$W/base" "$W/one" | awk -F'\t' '$2!=$3{print $1}' | paste -sd' ')
  printf '%s\t%s\t%s\t%s\t%s\n' "${f:15:-4}" "$pv" "$same" "$res" "${rev:-none}"
done < "$W/todo"
echo; echo "# 2. Simulated push (one transaction per file, stop at first failure)"
psql -qd postgres -c "drop database if exists rh_push" -c "create database rh_push template rh_base" >/dev/null 2>&1
while read -r f st pv same; do
  if strip "supabase/migrations/$f" | psql -q --single-transaction -v ON_ERROR_STOP=1 -d rh_push -f - >/dev/null 2>"$W/err"; then echo "applied  ${f:15:-4} ($st)"
  else echo "STOPPED  ${f:15:-4} ($st): $(grep -m1 -o 'ERROR: .*' "$W/err" | cut -c8-110)"; break; fi
done < "$W/todo"
logic rh_push > "$W/push"
rev=$(LC_ALL=C join -t$'\t' "$W/base" "$W/push" | awk -F'\t' '$2!=$3{print $1}' | paste -sd' ')
echo "function logic changed at the stop point: ${rev:-none}"
psql -qd postgres -c "drop database rh_one" -c "drop database rh_push" -c "drop database rh_base" >/dev/null 2>&1
