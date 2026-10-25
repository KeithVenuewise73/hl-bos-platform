#!/usr/bin/env node
// Start JerseySort in the background, for DateSort's "Find jersey numbers"
// button. DateSort runs this; nobody needs to.
//
//   1. If JerseySort already answers, says so and stops.
//   2. Checks Node is new enough (JerseySort's database is Node's built-in
//      SQLite, 22.13 or newer), and says so plainly if not.
//   3. Builds JerseySort if it was never built, or its code changed since.
//   4. Starts it DETACHED and hidden, so it keeps running after this script
//      and after DateSort close (a second game opens instantly), with its
//      output in jersey-sort.log beside DateSort's settings. Waits until it
//      really answers before saying it is ready.
//
// Libraries are not installed here: DateSort's own start already installed
// the whole workspace. The last line printed is the result, for DateSort:
//   READY            JerseySort answers on port 4603
//   PROBLEM <words>  why it could not start, in words for the CEO
//
// Environment: PNPM_CJS, the build tool (inherited from DateSort.bat).
/* global fetch, AbortSignal, setTimeout -- Node 22 globals */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP_DIR = path.join(ROOT, "apps", "jersey-sort");
const ENGINE_DIR = path.join(ROOT, "packages", "jersey-sort");
const FILTER = "@hl-bos/jersey-sort-app";
const PORT = 4603;
const STAMP = path.join(APP_DIR, ".next", "jerseysort-source.sha256");
const MIN_NODE = [22, 13, 0];
const LOG_DIR =
  process.platform === "win32"
    ? path.join(homedir(), "AppData", "Local", "DateSort")
    : path.join(homedir(), ".config", "datesort");

const done = (line, code) => {
  console.log(line);
  process.exit(code);
};

export async function jerseySortAnswers() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/health`, {
      signal: AbortSignal.timeout(1500),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.app === "jersey-sort") return "up";
    return "other";
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

/** A fingerprint of everything that goes into JerseySort's build. */
function sourceHash() {
  const h = createHash("sha256");
  const all = [
    ...files(APP_DIR),
    ...files(path.join(ENGINE_DIR, "src")),
    path.join(ENGINE_DIR, "package.json"),
  ]
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

function pnpmArgs(args) {
  const cjs = process.env.PNPM_CJS;
  return cjs
    ? [process.execPath, [cjs, ...args], false]
    : ["pnpm", args, process.platform === "win32"];
}

async function main() {
  const now = await jerseySortAnswers();
  if (now === "up") done("READY", 0);
  if (now === "other") {
    done(
      `PROBLEM Something else is using port ${PORT}, so JerseySort cannot start there. Close other HL-BOS windows and try again.`,
      1,
    );
  }

  const have = process.versions.node.split(".").map(Number);
  const older = (a, b) => {
    for (let k = 0; k < 3; k++) if ((a[k] ?? 0) !== b[k]) return (a[k] ?? 0) < b[k];
    return false;
  };
  const tooOld = older(have, MIN_NODE);
  if (tooOld) {
    done(
      `PROBLEM JerseySort needs Node ${MIN_NODE.join(".")} or newer; this computer has ${process.versions.node}. Install the current LTS from nodejs.org, then try again.`,
      1,
    );
  }

  mkdirSync(LOG_DIR, { recursive: true });
  const logFile = path.join(LOG_DIR, "jersey-sort.log");
  const log = openSync(logFile, "w");

  const source = sourceHash();
  const built = existsSync(path.join(APP_DIR, ".next", "BUILD_ID"));
  let stamp = null;
  try {
    stamp = readFileSync(STAMP, "utf8").trim();
  } catch {
    // never built by this script
  }
  if (!built || stamp !== source) {
    console.log("..  Preparing JerseySort (about a minute when it has changed)");
    const [bin, args, shell] = pnpmArgs(["--filter", FILTER, "build"]);
    const r = spawnSync(bin, args, {
      cwd: ROOT,
      stdio: ["ignore", log, log],
      shell,
      windowsHide: true,
    });
    if (r.status !== 0) {
      done(
        `PROBLEM JerseySort could not be built. This is an engineering fault, not something you did; tell Claude (details in ${logFile}).`,
        1,
      );
    }
    writeFileSync(STAMP, source);
  }

  const [bin, args, shell] = pnpmArgs(["--filter", FILTER, "start"]);
  const child = spawn(bin, args, {
    cwd: ROOT,
    stdio: ["ignore", log, log],
    shell,
    detached: true,
    windowsHide: true,
  });
  child.unref();
  let exited = false;
  child.on("exit", () => (exited = true));

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline && !exited) {
    if ((await jerseySortAnswers()) === "up") done("READY", 0);
    await new Promise((r) => setTimeout(r, 1000));
  }
  done(
    `PROBLEM JerseySort was started but never answered. Tell Claude (details in ${logFile}).`,
    1,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
