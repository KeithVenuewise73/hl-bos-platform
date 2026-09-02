#!/usr/bin/env bash
# Proves scripts/update.mjs against REAL git repositories.
#
# The decision table is unit-tested, but the interesting failures are all in the
# git plumbing: does a dirty tree really stop it, does it really refuse to merge
# a diverged branch, does it really fast-forward. So this builds throwaway
# repositories on disk and runs the actual script against them.
#
#   scripts/local-test/verify-update.sh
set -uo pipefail
SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/update.mjs"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
fail=0

step() { printf '  %-46s' "$1"; }
ok()   { echo "OK — $1"; }
bad()  { echo "FAILED — $1"; fail=1; }

export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t

# A bare "GitHub", and a clone of it standing in for the CEO's folder.
# --initial-branch matters: without it the bare repo's HEAD points at a branch
# that never gets created, and every later clone comes out with nothing checked
# out. That cost a debugging round the first time this was written.
git init -q --bare --initial-branch=main "$WORK/origin.git"
git clone -q "$WORK/origin.git" "$WORK/clone" 2>/dev/null
cd "$WORK/clone"
git checkout -q -b main 2>/dev/null || true
echo one > file.txt && git add -A && git commit -qm one && git push -q -u origin main

# The script lives in <root>/scripts, so give it a matching shape.
mkdir -p "$WORK/clone/scripts" && cp "$SCRIPT" "$WORK/clone/scripts/update.mjs"
git add -A && git commit -qm scripts && git push -q origin main >/dev/null 2>&1
RUN="$WORK/clone/scripts/update.mjs"

# Another clone plays the part of work being pushed from elsewhere.
git clone -q "$WORK/origin.git" "$WORK/other"
cd "$WORK/other" && echo two >> file.txt && git add -A && git commit -qm two && git push -q origin main >/dev/null 2>&1

echo "update.mjs verification (real git repositories)"
echo "---------------------------------------------------------------"

cd "$WORK/clone"

step "1. behind origin -> fast-forwards, asks for rebuild"
out="$(node "$RUN" 2>&1)"; code=$?
if [ "$code" -eq 10 ] && [ "$(cat file.txt | tail -1)" = "two" ]; then ok "exit 10, file updated"
else bad "exit $code, out: $out"; fi

step "2. already up to date -> no rebuild"
out="$(node "$RUN" 2>&1)"; code=$?
if [ "$code" -eq 0 ] && echo "$out" | grep -q "Already up to date"; then ok "exit 0"
else bad "exit $code, out: $out"; fi

step "3. unsaved work -> refuses to touch anything"
echo "mine" >> file.txt
cd "$WORK/other" && echo three >> file.txt && git add -A && git commit -qm three && git push -q origin main >/dev/null 2>&1
cd "$WORK/clone"
out="$(node "$RUN" 2>&1)"; code=$?
if [ "$code" -eq 0 ] && echo "$out" | grep -q "unsaved changes" && grep -q "mine" file.txt; then ok "left alone"
else bad "exit $code, out: $out"; fi
git checkout -q -- file.txt

step "4. diverged -> refuses, changes nothing"
echo local >> file.txt && git add -A && git commit -qm local
before="$(git rev-parse HEAD)"
out="$(node "$RUN" 2>&1)"; code=$?
if [ "$code" -eq 0 ] && echo "$out" | grep -q "both moved on" && [ "$(git rev-parse HEAD)" = "$before" ]; then ok "history untouched"
else bad "exit $code, out: $out"; fi

step "5. no remote -> starts anyway, does not error"
git remote remove origin
out="$(node "$RUN" 2>&1)"; code=$?
if [ "$code" -eq 0 ]; then ok "exit 0"; else bad "exit $code, out: $out"; fi

step "6. unreachable remote -> starts anyway, quickly"
git remote add origin "$WORK/does-not-exist.git"
git config branch.main.remote origin
start=$(date +%s)
out="$(node "$RUN" 2>&1)"; code=$?
elapsed=$(( $(date +%s) - start ))
if [ "$code" -eq 0 ] && [ "$elapsed" -lt 30 ]; then ok "exit 0 in ${elapsed}s"
else bad "exit $code after ${elapsed}s, out: $out"; fi

step "7. not a git folder at all -> starts anyway"
mkdir -p "$WORK/plain/scripts" && cp "$SCRIPT" "$WORK/plain/scripts/update.mjs"
out="$(cd "$WORK/plain" && node scripts/update.mjs 2>&1)"; code=$?
if [ "$code" -eq 0 ] && echo "$out" | grep -q "not connected to GitHub"; then ok "exit 0"
else bad "exit $code, out: $out"; fi

# ---------------------------------------------------------------------------
# The bootstrap: one file dropped into an older folder collects the rest.
#
# A self-updating launcher cannot deliver itself, so control-center.bat has a
# fallback that runs git directly when scripts/update.mjs is not there yet.
# The .bat cannot run here, so this reproduces that fallback exactly against
# real repositories -- including the case that matters most, where the folder
# has unsaved work and must not be trampled.
# ---------------------------------------------------------------------------
echo
echo "launcher bootstrap (mirrors control-center.bat's git fallback)"
echo "---------------------------------------------------------------"

bootstrap() { # runs in $PWD, mirrors the .bat's else-branch
  git fetch origin --quiet 2>/dev/null
  git merge --ff-only >/dev/null 2>&1
  [ -f scripts/update.mjs ] && echo collected || echo nothing
}

# An older copy of the folder: it predates scripts/update.mjs entirely.
git clone -q "$WORK/origin.git" "$WORK/old"
cd "$WORK/old"
git checkout -q "$(git rev-list --max-parents=0 HEAD)" 2>/dev/null
git checkout -q -B main HEAD
git branch -q --set-upstream-to=origin/main main 2>/dev/null

step "8. old folder without the helper -> collects it"
rm -rf scripts
if [ ! -f scripts/update.mjs ]; then
  result="$(bootstrap)"
  if [ "$result" = "collected" ]; then ok "helper arrived"; else bad "helper did not arrive"; fi
else
  bad "test setup: helper was already present"
fi

step "9. bootstrap leaves unsaved work alone"
git clone -q "$WORK/origin.git" "$WORK/old2"
cd "$WORK/old2"
git checkout -q -B main origin/main~1 2>/dev/null || git checkout -q -B main origin/main
git branch -q --set-upstream-to=origin/main main 2>/dev/null
echo "my unsaved edit" >> file.txt
before="$(cat file.txt)"
bootstrap >/dev/null
if [ "$(cat file.txt)" = "$before" ]; then ok "edit intact"; else bad "edit was lost"; fi

# ---------------------------------------------------------------------------
# The launcher's own decision, mirrored.
#
# control-center.bat cannot run here, so this reproduces the flag logic it uses
# to decide whether to rebuild. The bug this guards against is real: the first
# draft used `if exist X if not defined Y (...) else (...)`, where batch binds
# the else to the inner if, so a fresh clone with no build would have done
# nothing at all and started a console that was never built.
# ---------------------------------------------------------------------------
echo
echo "launcher rebuild decision (mirrors control-center.bat)"
echo "---------------------------------------------------------------"

need_build() { # $1 = .next exists (1/0), $2 = fresh code (1/0)
  local need=""
  [ "$1" = "0" ] && need=1
  [ "$2" = "1" ] && need=1
  echo "${need:-}"
}

check() { # name, next_exists, fresh, expected
  step "$1"
  local got; got="$(need_build "$2" "$3")"
  local want="$4"
  if [ "${got:-no}" = "$want" ]; then ok "${got:-no build}"; else bad "got '${got:-no}', wanted '$want'"; fi
}

check "10. fresh clone, nothing built -> builds"        0 0 1
check "11. fresh clone AND new code -> builds"          0 1 1
check "12. built already, new code arrived -> rebuilds" 1 1 1
check "13. built already, nothing new -> starts fast"   1 0 no

echo "---------------------------------------------------------------"
[ "$fail" -eq 0 ] && echo "All checks passed." || echo "SOMETHING FAILED."
exit $fail
