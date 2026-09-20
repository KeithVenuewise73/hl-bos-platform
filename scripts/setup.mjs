#!/usr/bin/env node
/**
 * First-time setup. Puts HL-BOS on this machine and starts it.
 *
 * WHY THIS EXISTS
 *
 * The operating contract says starting the console is one double-click on
 * scripts\control-center.bat. Every session, including many of mine, said
 * exactly that — and none of us noticed that nothing had ever put that file on
 * the CEO's computer. He had nothing to click, and said so. This is the missing
 * step.
 *
 * WHAT IT WILL NOT DO
 *
 * It never writes into a folder that already has something in it. A setup
 * script that "helpfully" overwrites is how somebody loses work they cannot get
 * back, and the folder it is aiming at lives in the user's home directory where
 * their own files are.
 *
 * The decision is a pure function of what was found, exactly as update.mjs is,
 * so the branches that need a missing git or an occupied folder are provable
 * without arranging either.
 */

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export const REPO_URL = "https://github.com/KeithVenuewise73/hl-bos-platform.git";
export const ZIP_URL =
  "https://codeload.github.com/KeithVenuewise73/hl-bos-platform/zip/refs/heads/main";
export const FOLDER_NAME = "HL-BOS";

/**
 * The whole decision, as a pure function of what was found.
 *
 * Kept separate from the filesystem and the network so every branch — including
 * "git is missing" and "that folder already has something in it" — is provable
 * without arranging either on the machine running the test.
 */
export function decide(facts) {
  const { targetExists, targetIsOurRepo, targetEmpty, hasGit } = facts;

  if (targetIsOurRepo) {
    return {
      action: "start",
      selfUpdating: true,
      message: "HL-BOS is already on this machine. Starting it.",
    };
  }

  if (targetExists && !targetEmpty) {
    return {
      action: "refuse",
      selfUpdating: false,
      message:
        `There is already a folder called ${FOLDER_NAME} in your home directory, ` +
        "and it is not HL-BOS. Nothing was changed. Rename or move that folder, " +
        "then run this again.",
    };
  }

  if (hasGit) {
    return {
      action: "clone",
      selfUpdating: true,
      message: "Downloading HL-BOS. This takes a minute or two the first time.",
    };
  }

  return {
    action: "download",
    selfUpdating: false,
    message:
      "Downloading HL-BOS. Git is not installed, so this copy will NOT update " +
      "itself — install Git later and it will start keeping itself current.",
  };
}

async function has(bin, args) {
  try {
    await run(bin, args, { timeout: 20_000 });
    return true;
  } catch {
    return false;
  }
}

/** Is this folder a checkout of OUR repository, rather than some other one? */
async function isOurRepo(dir) {
  if (!existsSync(join(dir, ".git"))) return false;
  try {
    const { stdout } = await run("git", ["-C", dir, "remote", "get-url", "origin"], {
      timeout: 20_000,
    });
    return stdout
      .trim()
      .replace(/\.git$/, "")
      .endsWith("KeithVenuewise73/hl-bos-platform");
  } catch {
    return false;
  }
}

function isEmptyDir(dir) {
  try {
    return readdirSync(dir).length === 0;
  } catch {
    return false;
  }
}

export async function gather(target) {
  const targetExists = existsSync(target);
  return {
    targetExists,
    targetIsOurRepo: targetExists ? await isOurRepo(target) : false,
    targetEmpty: targetExists ? isEmptyDir(target) : false,
    // GIT_TERMINAL_PROMPT=0 everywhere: a credential prompt in a window nobody
    // is watching looks exactly like a hang, and this repository is public so
    // no credential is needed.
    hasGit: await has("git", ["--version"]),
  };
}

async function clone(target) {
  await run("git", ["clone", "--depth", "50", REPO_URL, target], {
    timeout: 900_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

async function download(target) {
  const zip = join(target, "..", "hl-bos-download.zip");
  // curl and tar both ship with Windows 10 and 11. No extra tool to install,
  // which is the whole point of this branch.
  await run("curl", ["-fSL", "-o", zip, ZIP_URL], { timeout: 900_000 });
  mkdirSync(target, { recursive: true });
  await run("tar", ["-xf", zip, "-C", target, "--strip-components=1"], {
    timeout: 900_000,
  });
}

export async function main() {
  const target = join(homedir(), FOLDER_NAME);
  const facts = await gather(target);
  const plan = decide(facts);

  console.log("");
  console.log("  HL-BOS setup");
  console.log("  =================================================");
  console.log("");
  console.log(`  Folder: ${target}`);
  console.log(`  ${plan.message}`);
  console.log("");

  if (plan.action === "refuse") return { ...plan, target, ok: false };

  try {
    if (plan.action === "clone") await clone(target);
    if (plan.action === "download") await download(target);
  } catch (error) {
    console.log("  Could not download HL-BOS.");
    console.log(`  ${error instanceof Error ? error.message : String(error)}`);
    console.log("");
    console.log("  Check the internet connection and run this again.");
    return { ...plan, target, ok: false };
  }

  // One launcher, same name everywhere. (An earlier draft had a ternary here
  // whose branches were identical — a decision that decided nothing.)
  const launcher = join(target, "scripts", "control-center.bat");
  console.log("  Done.");
  console.log("");
  console.log("  From now on, open HL-BOS by double-clicking:");
  console.log(`    ${launcher}`);
  if (!plan.selfUpdating) {
    console.log("");
    console.log("  NOTE: this copy cannot update itself, because Git is not");
    console.log("  installed. Install Git and it will start keeping itself current.");
  }
  console.log("");
  return { ...plan, target, launcher, ok: true };
}

// Only run when executed directly, so the decision can be imported and tested.
if (process.argv[1] && process.argv[1].endsWith("setup.mjs")) {
  main().then((r) => process.exit(r.ok ? 0 : 1));
}
