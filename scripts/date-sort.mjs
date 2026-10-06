#!/usr/bin/env node
// Start DateSort: the part of DateSort.bat that is easier to get right in
// Node than in batch. DateSort.bat finds Node and the build tool, then runs
// this. It:
//
//   1. If DateSort is already running, just opens it.
//   2. Downloads libraries if this copy has never had them, or the lockfile
//      changed since they were installed.
//   3. Builds DateSort if it was never built, or its code changed since the
//      last build (so new work that arrived through the Control Center is
//      picked up without anyone having to know it needs a rebuild).
//   4. Starts it, waits until it actually answers, then opens the browser.
//      A link to a page that will not load is worse than no link, so the
//      browser opens only after a real health check passes.
//
// It never touches photos, and it does not update from GitHub: the Control
// Center owns updates, and two launchers pulling code into one folder would
// leave the other one's build stale without it knowing.
//
// Environment (for the Windows CI test; never needed by a person):
//   PNPM_CJS             the build tool (DateSort.bat sets this)
//   DATESORT_NO_BROWSER  1 = do not open a browser window
/* global fetch, AbortSignal, setTimeout -- Node 22 globals */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP_DIR = path.join(ROOT, "apps", "date-sort");
const ENGINE_DIR = path.join(ROOT, "packages", "date-sort");
const FILTER = "@hl-bos/date-sort-app";
export const PORT = 4604;
const URL_ = `http://localhost:${PORT}`;
const BUILD_STAMP = path.join(APP_DIR, ".next", "datesort-source.sha256");
const INSTALL_STAMP = path.join(ROOT, "node_modules", ".datesort-lockfile.sha256");

const say = (tag, text) =>
  console.log(`  [${tag}]${" ".repeat(Math.max(1, 6 - tag.length))}${text}`);

async function healthy() {
  try {
    const res = await fetch(`${URL_}/api/health`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return "unhealthy";
    const body = await res.json().catch(() => ({}));
    return body.app === "date-sort" ? "up" : "other";
  } catch {
    return "down";
  }
}

function files(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next" || e.name.startsWith("."))
      continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files(full, out);
    else if (e.isFile()) out.push(full);
  }
  return out;
}

/** A fingerprint of everything that goes into the build. */
export function sourceHash() {
  const h = createHash("sha256");
  const all = [
    ...files(APP_DIR),
    ...files(path.join(ENGINE_DIR, "src")),
    path.join(ENGINE_DIR, "package.json"),
  ]
    // Tests do not go into the build; next-env.d.ts and *.tsbuildinfo are
    // written BY the build, so counting them would force a rebuild every time.
    .filter((f) => !/(\.test\.ts|next-env\.d\.ts|\.tsbuildinfo)$/.test(f))
    .sort();
  for (const f of all) {
    h.update(path.relative(ROOT, f).replace(/\\/g, "/"));
    h.update("\0");
    h.update(readFileSync(f));
    h.update("\0");
  }
  return h.digest("hex");
}

function lockHash() {
  return createHash("sha256")
    .update(readFileSync(path.join(ROOT, "pnpm-lock.yaml")))
    .digest("hex");
}

function read(file) {
  try {
    return readFileSync(file, "utf8").trim();
  } catch {
    return null;
  }
}

function pnpm(args) {
  const cjs = process.env.PNPM_CJS;
  const [bin, full] = cjs ? [process.execPath, [cjs, ...args]] : ["pnpm", args];
  const r = spawnSync(bin, full, {
    cwd: ROOT,
    stdio: "inherit",
    shell: !cjs && process.platform === "win32",
  });
  return r.status === 0;
}

function openBrowser() {
  if (process.env.DATESORT_NO_BROWSER === "1") return;
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", URL_], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
  } else if (process.platform === "darwin") {
    spawn("open", [URL_], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("xdg-open", [URL_], { detached: true, stdio: "ignore" })
      .on("error", () => {})
      .unref();
  }
}

function fail(lines) {
  console.log("");
  for (const l of lines) say("--", l);
  console.log("");
  process.exit(1);
}

async function main() {
  console.log("");
  console.log("  DateSort");
  console.log("  =================================================");
  console.log("");

  const now = await healthy();
  if (now === "up") {
    say("ok", `DateSort is already running. Opening ${URL_}`);
    openBrowser();
    return;
  }
  if (now !== "down") {
    fail([
      `Something else is already using port ${PORT}, so DateSort cannot start there.`,
      "Close other HL-BOS windows and try again. If it keeps happening, tell Claude.",
    ]);
  }

  // Libraries
  const lock = lockHash();
  const needInstall =
    !existsSync(path.join(ROOT, "node_modules")) ||
    !existsSync(path.join(APP_DIR, "node_modules", "next")) ||
    read(INSTALL_STAMP) !== lock;
  if (needInstall) {
    say("..", "Getting DateSort's libraries. A few minutes the first time, once.");
    if (!pnpm(["install", "--frozen-lockfile"])) {
      fail([
        "Could not download the libraries. Nothing is broken; this is usually the",
        "internet dropping. Try again. If it keeps happening, send Claude the lines above.",
      ]);
    }
    writeFileSync(INSTALL_STAMP, lock);
    say("ok", "Libraries ready");
  } else {
    say("ok", "Libraries ready");
  }

  // Build
  const source = sourceHash();
  const needBuild =
    !existsSync(path.join(APP_DIR, ".next", "BUILD_ID")) ||
    read(BUILD_STAMP) !== source;
  if (needBuild) {
    say("..", "Preparing DateSort (about a minute when it has changed)...");
    if (!pnpm(["--filter", FILTER, "build"])) {
      fail([
        "Could not build DateSort. This is an engineering fault, not something you did.",
        "Your photos were not touched. Send Claude the lines above.",
      ]);
    }
    writeFileSync(BUILD_STAMP, source);
    say("ok", "DateSort built");
  } else {
    say("ok", "DateSort ready");
  }

  // Start
  say("..", "Starting DateSort...");
  const cjs = process.env.PNPM_CJS;
  const child = cjs
    ? spawn(process.execPath, [cjs, "--filter", FILTER, "start"], {
        cwd: ROOT,
        stdio: "inherit",
      })
    : spawn("pnpm", ["--filter", FILTER, "start"], {
        cwd: ROOT,
        stdio: "inherit",
        shell: process.platform === "win32",
      });
  let exited = false;
  child.on("exit", (code) => {
    exited = true;
    process.exitCode = code ?? 0;
  });

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline && !exited) {
    if ((await healthy()) === "up") break;
    await new Promise((r) => setTimeout(r, 750));
  }
  if (exited || (await healthy()) !== "up") {
    child.kill();
    fail([
      `DateSort was started but never answered on port ${PORT}, so no browser was opened.`,
      "Your photos were not touched. Send Claude the lines above.",
    ]);
  }
  console.log("");
  say("ok", `DateSort is running: ${URL_}`);
  console.log(
    "         Leave this window open while you use it. Close it to stop DateSort.",
  );
  console.log("");
  openBrowser();
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
