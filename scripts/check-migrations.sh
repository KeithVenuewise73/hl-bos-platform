#!/usr/bin/env bash
# Structural checks on Supabase migrations.
#
# Context (see docs/architecture/current-state-audit.md): the production
# database carries 52 migrations applied from OUTSIDE this repository, using
# four inconsistent naming schemes, with two independent counters that both
# use the 0009-0017 range. Ordinal prefixes there are decorative and
# actively misleading.
#
# HL-BOS migrations are prefixed hl bos and validated here so that problem is
# not reproduced.
set -euo pipefail

DIR="supabase/migrations"
FAILED=0

if [ ! -d "$DIR" ]; then
  echo "No $DIR yet -- nothing to check."
  exit 0
fi

shopt -s nullglob
FILES=("$DIR"/*.sql)

if [ ${#FILES[@]} -eq 0 ]; then
  echo "No migrations yet -- nothing to check."
  exit 0
fi

echo "Checking ${#FILES[@]} migration(s)..."

# <timestamp>_hlbos_<ordinal>_<description>.sql
NAME_RE='^[0-9]{14}_hlbos_[0-9]{4}(r[0-9]{2})?_[a-z0-9_]+\.sql$'

for f in "${FILES[@]}"; do
  base=$(basename "$f")

  if ! [[ "$base" =~ $NAME_RE ]]; then
    echo "FAIL [$base]: filename must match <timestamp>_hlbos_<NNNN>_<desc>.sql"
    FAILED=1
  fi

  # Every migration must document how to undo it. The brief requires
  # migrations be "reversible when practical"; requiring the block forces an
  # explicit decision rather than silent omission.
  if ! grep -qi -- '-- rollback:' "$f"; then
    echo "FAIL [$base]: missing '-- rollback:' block."
    FAILED=1
  fi

  # No secrets in migrations, ever.
  if grep -qiE "(service_role_key|sb_secret_|sk_live_|password\s*=\s*'[^']{8,})" "$f"; then
    echo "FAIL [$base]: looks like it contains a secret."
    FAILED=1
  fi

  # Destructive DDL requires an explicit, signed-off marker. Principle 9:
  # no destructive implementation without approval.
  if grep -qiE '^\s*(DROP\s+(TABLE|SCHEMA|COLUMN)|TRUNCATE)' "$f"; then
    if ! grep -qi -- '-- approved-destructive:' "$f"; then
      echo "FAIL [$base]: destructive DDL without an '-- approved-destructive:' marker."
      FAILED=1
    fi
  fi
done

# Duplicate ordinals are how the existing project ended up with two
# colliding 0009-0017 sequences.
DUPES=$(for f in "${FILES[@]}"; do basename "$f" | sed -E 's/^[0-9]{14}_hlbos_([0-9]{4}).*/\1/'; done | sort | uniq -d)
if [ -n "$DUPES" ]; then
  echo "FAIL: duplicate migration ordinal(s): $DUPES"
  FAILED=1
fi

if [ $FAILED -ne 0 ]; then
  echo ""
  echo "Migration checks failed. See docs/operations/migration-plan.md."
  exit 1
fi

echo "OK: all migration checks passed."
