#!/usr/bin/env node
// Bring this folder up to date with GitHub, safely, before the console starts.
//
// WHY THIS EXISTS
// The launcher could start the console but never update it, so once a copy of
// this repository was on the CEO's machine there was no way for new work to
// reach him short of typing git commands. That is exactly the chore the
// operating contract forbids. Now the same double-click that starts the console
// also collects whatever has been finished since last time.
//
// RULES THIS OBEYS
//   - It never destroys work. A folder with unsaved changes is left alone.
//   - It never rewrites history. Fast-forward only: if the folder and GitHub
//     have both moved, it stops and says so rather than merging blindly.
//   - It never blocks startup. No network, no GitHub, no permission: it says
//     so in one line and the console starts anyway with what is already here.
//   - It never hangs waiting for a password. Credential prompts are disabled,
//     so a private repository without stored credentials fails in seconds
//     instead of freezing the launcher on a black screen forever.
//
// Exit codes are the launcher's instructions, not error levels:
//   0  nothing changed — start straight up
//   10 code changed — reinstall if needed, rebuild, then start
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const NOTHING_CHANGED = 0;
const CODE_CHANGED = 10;

/**
 * The whole decision, as a pure function of what we found.
 *
 * Separated from the git calls so every branch of it — including the ones that
 * need a diverged repository or a dead network to reproduce — is provable.
 */
export function decide(facts) {
  const { isRepo, hasOrigin, fetchOk, dirty, hasUpstream, ahead, behind } = facts;

  if (!isRepo) {
    return {
      rebuild: false,
      message: "This folder is not connected to GitHub. Starting with what is here.",
    };
  }
  if (!hasOrigin) {
    return {
      rebuild: false,
      message: "No GitHub address is set for this folder. Starting with what is here.",
    };
  }
  if (dirty) {
    return {
      rebuild: false,
      message:
        "You have unsaved changes in this folder, so nothing was touched. Starting as-is.",
    };
  }
  if (!fetchOk) {
    return {
      rebuild: false,
      message:
        "Could not reach GitHub just now. Starting with the copy already on this machine.",
    };
  }
  if (!hasUpstream) {
    return {
      rebuild: false,
      message: "This branch is not tracking anything on GitHub yet. Starting as-is.",
    };
  }
  if (behind === 0 && ahead === 0) {
    return { rebuild: false, message: "Already up to date." };
  }
  if (behind === 0) {
    return {
      rebuild: false,
      message: `Up to date. You have ${ahead} change${ahead === 1 ? "" : "s"} here that GitHub does not.`,
    };
  }
  if (ahead > 0) {
    return {
      rebuild: false,
      message:
        `This folder and GitHub have both moved on (${ahead} here, ${behind} there). ` +
        "Nothing was changed automatically — tell Claude and it will sort it out.",
    };
  }
  return {
    rebuild: true,
    pull: true,
    message: `Collected ${behind} new change${behind === 1 ? "" : "s"} from GitHub.`,
  };
}

async function git(args, timeout = 60_000) {
  try {
    const { stdout } = await run("git", args, {
      cwd: ROOT,
      timeout,
      windowsHide: true,
      // Never sit at a password prompt: the launcher would look frozen.
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" },
    });
    return { ok: true, out: stdout.trim() };
  } catch {
    return { ok: false, out: "" };
  }
}

async function gather() {
  const isRepo = (await git(["rev-parse", "--is-inside-work-tree"])).out === "true";
  if (!isRepo) return { isRepo: false };

  const hasOrigin = (await git(["remote", "get-url", "origin"])).ok;
  const dirty = (await git(["status", "--porcelain"])).out.length > 0;
  const fetchOk =
    hasOrigin && !dirty
      ? (await git(["fetch", "origin", "--quiet"], 120_000)).ok
      : false;
  const upstream = await git([
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{u}",
  ]);
  const counts = upstream.ok
    ? await git(["rev-list", "--left-right", "--count", "@{u}...HEAD"])
    : { ok: false, out: "" };
  const [behindRaw, aheadRaw] = counts.ok ? counts.out.split(/\s+/) : ["0", "0"];

  return {
    isRepo: true,
    hasOrigin,
    dirty,
    fetchOk,
    hasUpstream: upstream.ok,
    behind: Number(behindRaw) || 0,
    ahead: Number(aheadRaw) || 0,
  };
}

async function main() {
  const decision = decide(await gather());
  if (decision.pull) {
    const merged = await git(["merge", "--ff-only", "@{u}"]);
    if (!merged.ok) {
      console.log(
        "   [..]   Could not apply the update cleanly. Starting with what is here.",
      );
      process.exit(NOTHING_CHANGED);
    }
  }
  console.log(`   [ok]   ${decision.message}`);
  process.exit(decision.rebuild ? CODE_CHANGED : NOTHING_CHANGED);
}

// Only run when invoked directly, so the decision can be imported and tested.
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
