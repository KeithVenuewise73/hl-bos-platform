import "server-only";

import { spawn } from "node:child_process";
import path from "node:path";

/**
 * Starting JerseySort for "Find jersey numbers". Runs only node, with only
 * scripts/jersey-sort.mjs (which builds JerseySort if needed and starts it in
 * the background). Its last line is READY or PROBLEM <words>.
 *
 * DateSort's server runs in apps/date-sort, so the repository is two up.
 */
export const JERSEYSORT_URL = "http://localhost:4603";
const STARTER = path.resolve(
  /*turbopackIgnore: true*/ process.cwd(),
  "..",
  "..",
  "scripts",
  "jersey-sort.mjs",
);
/** First start builds JerseySort: give it time, then say so plainly. */
const START_TIMEOUT_MS = 6 * 60 * 1000;

let starting: Promise<string | null> | null = null;

/** null once JerseySort answers, or the reason it could not be started. */
export function ensureJerseySort(): Promise<string | null> {
  starting ??= new Promise<string | null>((resolve) => {
    const child = spawn(process.execPath, [STARTER], {
      cwd: path.dirname(path.dirname(STARTER)),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      timeout: START_TIMEOUT_MS,
    });
    let out = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.stderr.on("data", (d: Buffer) => (out += d.toString()));
    child.on("error", (e) => resolve(`JerseySort could not be started: ${e.message}`));
    child.on("close", () => {
      const last = out.trim().split(/\r?\n/).pop() ?? "";
      if (last === "READY") resolve(null);
      else if (last.startsWith("PROBLEM ")) resolve(last.slice("PROBLEM ".length));
      else
        resolve(
          "JerseySort did not start in time. Try the button again; if it keeps happening, tell Claude.",
        );
    });
  }).finally(() => {
    starting = null;
  });
  return starting;
}

/** The JerseySort page that turns this folder into an event. */
export function importUrl(params: {
  readonly folder: string;
  readonly day: string;
  readonly sport: string;
  readonly name: string;
}): string {
  const q = new URLSearchParams({
    folder: params.folder,
    date: params.day,
    sport: params.sport,
    name: params.name,
  });
  return `${JERSEYSORT_URL}/import?${q.toString()}`;
}
