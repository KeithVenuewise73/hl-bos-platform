#!/usr/bin/env bash
# Build a DISPOSABLE production-equivalent HL-BOS Core schema from the recovered
# production migration archive (PR #113), in production's exact version order.
# Stamp-only ledger rows are replaced by the source from the commits they name.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres scripts/local-test/build-prod-equivalent.sh [db]
# Never connects to a hosted project.
set -euo pipefail
DB="${1:-prodeq}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REC_REF="${REC_REF:-origin/recovery/hlbos-production-2026-11}"
REC_DIR=supabase/recovery/production-2026-11/migrations
# Production ran its migrations with this search_path (verified read-only). It
# changes how operators resolve: with "extensions" present, `citext ~ pattern`
# uses citext's case-INSENSITIVE regex. Replaying without it builds different checks.
export PGOPTIONS="${PGOPTIONS:-} -c search_path=\"\$user\",public,extensions"
case "${PGHOST:-}" in /*|localhost|127.0.0.1) ;; *) echo "Refusing non-local PGHOST '${PGHOST:-}'"; exit 1;; esac
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
cd "$ROOT"
for f in $(git ls-tree --name-only "$REC_REF" "$REC_DIR/" | grep '\.sql$'); do git show "$REC_REF:$f" > "$WORK/$(basename "$f")"; done
# Stamp rows ("-- applied from git <sha> ...") -> the file from that commit.
for f in "$WORK"/*.sql; do
  if [ "$(wc -c <"$f")" -lt 200 ] && grep -q '^-- applied from git ' "$f"; then
    sha=$(sed -nE 's/^-- applied from git ([0-9a-f]+).*/\1/p' "$f")
    git show "$sha:supabase/migrations/$(basename "$f")" > "$f"
    echo "stamp replaced from $sha: $(basename "$f")"
  fi
done
psql -qd postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f scripts/local-test/supabase-shim.sql >/dev/null 2>&1
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f scripts/local-test/prod-equivalent-shim.sql >/dev/null
n=0
for f in $(ls "$WORK"/*.sql | sort); do
  sed -E '/create extension if not exists (pgtap|pg_net|pg_cron)/d' "$f" | psql -q -v ON_ERROR_STOP=1 -d "$DB" -f - >/dev/null 2>"$WORK/err" \
    || { echo "FAILED: $(basename "$f")"; cat "$WORK/err"; exit 1; }
  n=$((n+1))
done
echo "applied $n recovered production migrations to $DB"
