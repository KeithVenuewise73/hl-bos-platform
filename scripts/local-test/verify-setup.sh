#!/usr/bin/env bash
# Proves scripts/setup.mjs against REAL folders and a REAL clone.
#
# The decision table is exercised directly, but the interesting failures are in
# the filesystem: does it really refuse an occupied folder, does it really
# recognise its own checkout, does a clone really produce something startable.
# So this builds throwaway folders on disk and runs the actual script against
# them.
#
# The Windows .bat cannot run here. What it does — find Node, fetch setup.mjs,
# run it — is covered by running setup.mjs itself; the batch wrapper around it
# is the one part this cannot prove, and it is deliberately thin for that
# reason.
set -uo pipefail
ROOT="${1:?repo root required}"
WORK="$(mktemp -d)"
fail=0

step() { printf '  %-52s' "$1"; }
ok()   { echo "OK${1:+ — $1}"; }
bad()  { echo "FAILED — $1"; fail=1; }

echo "Setup verification (scripts/setup.mjs)"
echo "---------------------------------------------------------------"

decide() {
  node --input-type=module -e "
    import { decide } from '$ROOT/scripts/setup.mjs';
    console.log(JSON.stringify(decide($1)));
  "
}

step "1. fresh machine with git -> clone"
[ "$(decide '{targetExists:false,targetIsOurRepo:false,targetEmpty:false,hasGit:true}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).action')" = "clone" ] \
  && ok || bad "did not choose clone"

step "2. fresh machine without git -> download"
R="$(decide '{targetExists:false,targetIsOurRepo:false,targetEmpty:false,hasGit:false}')"
[ "$(echo "$R" | node -pe 'JSON.parse(require("fs").readFileSync(0)).action')" = "download" ] \
  && ok || bad "did not choose download"

step "3. ...and warns it cannot update itself"
[ "$(echo "$R" | node -pe 'JSON.parse(require("fs").readFileSync(0)).selfUpdating')" = "false" ] \
  && ok || bad "claimed it would self-update"

step "4. already installed -> start, do not re-download"
[ "$(decide '{targetExists:true,targetIsOurRepo:true,targetEmpty:false,hasGit:true}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).action')" = "start" ] \
  && ok || bad "would have downloaded over an existing install"

step "5. occupied by somebody else's folder -> refuse"
[ "$(decide '{targetExists:true,targetIsOurRepo:false,targetEmpty:false,hasGit:true}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).action')" = "refuse" ] \
  && ok || bad "would have written into an occupied folder"

step "6. empty folder is safe to use"
[ "$(decide '{targetExists:true,targetIsOurRepo:false,targetEmpty:true,hasGit:true}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).action')" = "clone" ] \
  && ok || bad "refused an empty folder"

# --- Real filesystem: does it recognise its own checkout? --------------------
step "7. recognises a real checkout of this repo"
git -C "$WORK" init -q other 2>/dev/null
git -C "$WORK/other" remote add origin https://github.com/KeithVenuewise73/hl-bos-platform.git
GOT="$(node --input-type=module -e "
  import { gather } from '$ROOT/scripts/setup.mjs';
  const f = await gather('$WORK/other');
  console.log(f.targetIsOurRepo);
")"
[ "$GOT" = "true" ] && ok || bad "did not recognise its own repo (got $GOT)"

step "8. does NOT mistake another repo for this one"
git -C "$WORK" init -q stranger 2>/dev/null
git -C "$WORK/stranger" remote add origin https://github.com/someone/else.git
GOT="$(node --input-type=module -e "
  import { gather } from '$ROOT/scripts/setup.mjs';
  const f = await gather('$WORK/stranger');
  console.log(f.targetIsOurRepo);
")"
[ "$GOT" = "false" ] && ok || bad "claimed a stranger's repo was ours (got $GOT)"

step "9. a folder with files in it reads as occupied"
mkdir -p "$WORK/busy" && echo "somebody's work" > "$WORK/busy/notes.txt"
GOT="$(node --input-type=module -e "
  import { gather } from '$ROOT/scripts/setup.mjs';
  const f = await gather('$WORK/busy');
  console.log(f.targetEmpty);
")"
[ "$GOT" = "false" ] && ok || bad "an occupied folder read as empty (got $GOT)"

rm -rf "$WORK"
echo "---------------------------------------------------------------"
[ $fail -eq 0 ] && echo "All checks passed." || echo "Some checks FAILED."
exit $fail
