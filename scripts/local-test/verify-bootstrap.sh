#!/usr/bin/env bash
# Proves the logic inside control-center.bat, step for step.
#
# The .bat cannot run here (no Windows), so this runs the SAME sequence with the
# same mechanics: find node -> find npm beside it -> install pinned pnpm into
# .hlbos/toolchain -> use it via bare `node`, with PATH stripped so nothing can
# silently come from the environment.
set -uo pipefail
ROOT="${1:?repo root required}"
cd "$ROOT"
TOOLCHAIN="$ROOT/.hlbos/toolchain"
PNPM_CJS="$TOOLCHAIN/node_modules/pnpm/bin/pnpm.cjs"
PNPM_VERSION="$(node -e "console.log(require('./package.json').packageManager.split('@')[1])")"
fail=0

step() { printf '  %-52s' "$1"; }
ok()   { echo "OK${1:+ — $1}"; }
bad()  { echo "FAILED — $1"; fail=1; }

echo "Bootstrap verification (mirrors control-center.bat)"
echo "---------------------------------------------------------------"

step "1. locate node"
NODE_EXE="$(command -v node || true)"
[ -n "$NODE_EXE" ] && ok "$($NODE_EXE --version)" || { bad "node not found"; exit 1; }

step "2. node major >= 22"
MAJ="$($NODE_EXE -e 'console.log(process.versions.node.split(".")[0])')"
[ "$MAJ" -ge 22 ] && ok "v$MAJ" || bad "v$MAJ is too old"

step "3. locate npm beside node (not via PATH)"
NODE_DIR="$(dirname "$NODE_EXE")"
NPM_CLI=""
for c in "$NODE_DIR/node_modules/npm/bin/npm-cli.js" "$NODE_DIR/../lib/node_modules/npm/bin/npm-cli.js"; do
  [ -f "$c" ] && { NPM_CLI="$c"; break; }
done
[ -n "$NPM_CLI" ] && ok || bad "npm-cli.js not found beside node"

step "4. pinned pnpm version read from package.json"
[ -n "$PNPM_VERSION" ] && ok "$PNPM_VERSION" || bad "packageManager not pinned"

step "5. install pnpm into .hlbos/toolchain"
rm -rf "$TOOLCHAIN"
if env -i HOME="$HOME" "$NODE_EXE" "$NPM_CLI" install "pnpm@$PNPM_VERSION" \
     --prefix "$TOOLCHAIN" --no-save --no-fund --no-audit --silent >/tmp/vb.log 2>&1; then
  [ -f "$PNPM_CJS" ] && ok || bad "pnpm.cjs missing after install"
else
  bad "npm install failed ($(tail -1 /tmp/vb.log))"
fi

step "6. run pnpm with PATH stripped"
GOT="$(env -i HOME="$HOME" "$NODE_EXE" "$PNPM_CJS" --version 2>&1 | tail -1)"
[ "$GOT" = "$PNPM_VERSION" ] && ok "$GOT" || bad "got '$GOT', expected $PNPM_VERSION"

step "7. version matches packageManager exactly"
[ "$GOT" = "$PNPM_VERSION" ] && ok || bad "drift: $GOT != $PNPM_VERSION"

step "8. toolchain is gitignored"
git check-ignore -q .hlbos/toolchain && ok || bad "toolchain would be committed"

echo "---------------------------------------------------------------"
[ "$fail" -eq 0 ] && echo "ALL CHECKS PASSED — a machine with no pnpm can start the console." \
                  || echo "SOME CHECKS FAILED."
exit "$fail"
