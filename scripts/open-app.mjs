#!/usr/bin/env node
// Open the Development Control Center in its own window, like an app.
//
//   node scripts/open-app.mjs [url]        (default http://localhost:4000)
//
// control-center.bat starts this in the background, beside the console. It:
//
//   1. waits until the console actually answers (a window onto a page that
//      has not started yet would show an error, which looks like a fault),
//   2. opens it in an "app window": Microsoft Edge (every Windows 10/11
//      computer has it) or Google Chrome, with no address bar or tabs, its own
//      taskbar button, and the Control Center's own icon,
//   3. falls back to an ordinary browser tab if neither can be found, and says
//      so, so the console is never unreachable because of this file.
//
// The app window gets its own small profile folder (.hlbos/app-profile,
// gitignored) so it is a window of its own and never joins, or changes, the
// windows or settings of the browser used for everything else.
//
// It only opens a window. It never starts, stops or changes the console, and
// it never throws: any problem is one line of output and the exit code is 0.
//
// Environment (for the Windows CI test; never needed by a person):
//   HLBOS_APP_BROWSER   a browser program to use instead of looking for one
//   HLBOS_APP_ARGS      extra browser arguments, separated by spaces
//   HLBOS_APP_WAIT_MS   how long to wait for the console (default 120000)
/* global fetch, AbortSignal, setTimeout -- Node 22 globals */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_URL = "http://localhost:4000";

const say = (tag, text) =>
  console.log(`  [${tag}]${" ".repeat(Math.max(1, 6 - tag.length))}${text}`);

/**
 * Browsers that can show an app window, best first, with where each is
 * installed on Windows. Pure: the environment is passed in, so it can be tested.
 */
export function browserCandidates(env = process.env) {
  const out = [];
  if (env.HLBOS_APP_BROWSER) {
    out.push({ name: "the browser chosen for this test", exe: env.HLBOS_APP_BROWSER });
  }
  const dirs = [env["ProgramFiles(x86)"], env.ProgramFiles, env.LOCALAPPDATA].filter(
    Boolean,
  );
  for (const d of dirs.slice(0, 2)) {
    out.push({
      name: "Microsoft Edge",
      exe: path.join(d, "Microsoft", "Edge", "Application", "msedge.exe"),
    });
  }
  for (const d of dirs) {
    out.push({
      name: "Google Chrome",
      exe: path.join(d, "Google", "Chrome", "Application", "chrome.exe"),
    });
  }
  return out;
}

/** The first candidate that exists, or null. */
export function findBrowser(env = process.env, exists = existsSync) {
  return browserCandidates(env).find((c) => exists(c.exe)) ?? null;
}

/** The arguments that make a browser show `url` as an app window. Pure. */
export function appArguments(url, profileDir, extra = "") {
  return [
    `--app=${url}`,
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1360,900",
    ...extra.split(/\s+/).filter(Boolean),
  ];
}

/** Wait until the console answers. true when it did, false when time ran out. */
export async function waitForConsole(url, totalMs, sleep = defaultSleep) {
  const end = Date.now() + totalMs;
  for (;;) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.status < 500) return true;
    } catch {
      // not up yet
    }
    if (Date.now() >= end) return false;
    await sleep(1000);
  }
}
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Start a program that outlives this one. Resolves true once the operating
 * system has really started it, false if it could not (not found, not
 * allowed), so nothing is ever reported as opened when it was not.
 */
export function launch(exe, args) {
  return new Promise((resolve) => {
    try {
      const child = spawn(exe, args, { detached: true, stdio: "ignore" });
      child.once("error", () => resolve(false));
      child.once("spawn", () => {
        child.unref();
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}

/** Open `url` in whatever the computer's default browser is. */
const openTab = (url, start) => start("explorer.exe", [url]);

/**
 * Open the console. Returns a sentence saying what happened. Never throws.
 * `deps` are the real things by default and replaced in tests.
 */
export async function openApp(url = DEFAULT_URL, env = process.env, deps = {}) {
  const {
    wait = waitForConsole,
    find = findBrowser,
    start = launch,
    profile = path.join(ROOT, ".hlbos", "app-profile"),
  } = deps;
  try {
    const waitMs = Number(env.HLBOS_APP_WAIT_MS) || 120_000;
    if (!(await wait(url, waitMs))) {
      return `the console did not answer at ${url} within ${Math.round(waitMs / 1000)} seconds, so no window was opened. Open ${url} in your browser once the black window says it is ready.`;
    }
    const browser = find(env);
    if (browser !== null) {
      mkdirSync(profile, { recursive: true });
      if (
        await start(browser.exe, appArguments(url, profile, env.HLBOS_APP_ARGS ?? ""))
      ) {
        return `opened the Control Center in its own window (${browser.name}).`;
      }
    }
    const why =
      browser === null
        ? "Microsoft Edge and Google Chrome were not found"
        : `${browser.name} could not be started`;
    if (await openTab(url, start)) {
      return `${why}, so the console opened as a tab in your browser instead: ${url}`;
    }
    return `${why}, and no browser could be opened for you. Open ${url} in your browser yourself.`;
  } catch (e) {
    return `could not open the window (${e instanceof Error ? e.message : String(e)}). Open ${url} in your browser instead.`;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const url =
    process.argv[2] && /^https?:\/\//.test(process.argv[2])
      ? process.argv[2]
      : DEFAULT_URL;
  say("ok", await openApp(url));
}
