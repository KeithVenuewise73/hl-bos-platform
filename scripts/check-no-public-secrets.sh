#!/usr/bin/env bash
# Fail if a browser-visible variable name looks like a private secret.
#
# The brief: "Never prefix private secrets with NEXT_PUBLIC."
# NEXT_PUBLIC_ variables are inlined into the client bundle at build time, so
# a secret behind that prefix is public the moment it ships. This is cheap to
# check and catastrophic to miss, so it gates every PR.
set -euo pipefail

# Words that mark a value as private. NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is
# an intentional exception: a publishable key is public by design.
PATTERN='NEXT_PUBLIC_[A-Z0-9_]*(SECRET|PRIVATE|SERVICE_ROLE|PASSWORD|CREDENTIAL)'
ALLOWLIST='NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'

echo "Scanning for private secrets behind NEXT_PUBLIC_..."

# Exclude this script and its own test, which necessarily contain the pattern.
if matches=$(grep -rInE "$PATTERN" . \
      --exclude-dir=node_modules \
      --exclude-dir=.git \
      --exclude-dir=dist \
      --exclude-dir=.next \
      --exclude="check-no-public-secrets.sh" \
      --exclude="*.test.ts" \
    | grep -vE "$ALLOWLIST" || true); then
  if [ -n "$matches" ]; then
    echo ""
    echo "FAIL: browser-visible variable(s) named like a private secret:"
    echo ""
    echo "$matches"
    echo ""
    echo "NEXT_PUBLIC_ is inlined into the client bundle. A secret behind it"
    echo "is already public. Remove the prefix and read it server-side via"
    echo "@hl-bos/config."
    exit 1
  fi
fi

echo "OK: no private secrets behind NEXT_PUBLIC_."
