#!/usr/bin/env bash
# Enforce the TypeScript compatibility constraint in CI.
#
# Owner decision (2026-07-15): "Do not silently change this pin."
#
# Dependabot's ignore rule stops it from opening the PR, but it does not stop
# a human editing the catalog by hand. This does: it fails the build if the
# pinned TypeScript falls outside the range typescript-eslint declares it
# supports, so the pin cannot drift silently.
#
# The supported range is read from the INSTALLED typescript-eslint rather than
# hard-coded, so this check keeps working when ts-eslint eventually ships TS 7
# support -- at which point it stops constraining us on its own, with no edit
# required here.
set -euo pipefail

CATALOG_TS=$(grep -E '^\s+typescript:' pnpm-workspace.yaml | head -1 | sed -E 's/.*"([^"]+)".*/\1/')

if [ -z "$CATALOG_TS" ]; then
  echo "FAIL: could not read the typescript pin from the pnpm-workspace.yaml catalog."
  exit 1
fi

# stderr is deliberately NOT silenced. An earlier version piped node errors to
# /dev/null; when a require failed, every input took the failure branch and the
# check reported FAIL for a pin that was perfectly valid. A guard that cannot
# tell "violated" from "broken" is worse than no guard -- it trains people to
# ignore it.
PEER_RANGE=$(node -p "require('typescript-eslint/package.json').peerDependencies.typescript")

if [ -z "$PEER_RANGE" ]; then
  echo "FAIL: could not read the typescript-eslint peer range."
  exit 1
fi

echo "Catalog TypeScript pin  : $CATALOG_TS"
echo "typescript-eslint peers : $PEER_RANGE"

# The comparison runs from a heredoc rather than an inline -e string: an
# apostrophe inside an inline single-quoted script silently terminates the
# bash string and bash then tries to execute the JavaScript.
node - "$CATALOG_TS" "$PEER_RANGE" <<'NODE'
const semver = require("semver");
const pin = process.argv[2];
const range = process.argv[3];

if (semver.satisfies(pin, range)) {
  console.log("OK: TypeScript " + pin + " is inside the supported range.");
  process.exit(0);
}

console.error("");
console.error("FAIL: TypeScript " + pin + " is OUTSIDE the range that");
console.error("      typescript-eslint supports (" + range + ").");
console.error("      Type-aware linting would silently degrade.");
console.error("");
console.error("      Do not fix this by relaxing strict-peer-dependencies.");
console.error("      See docs/architecture/dependency-policy.md section 2.");
process.exit(1);
NODE
