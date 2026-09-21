import "server-only";

import { REPO_ROOT, pnpm, spawnPnpm } from "./shell";
import {
  LOCAL_APPS,
  appUrl,
  describeHealth,
  findApp,
  type LocalApp,
} from "./apps-registry";

export { LOCAL_APPS, appUrl, findApp } from "./apps-registry";
export type { LocalApp } from "./apps-registry";

/**
 * Local apps the console can start for the CEO.
 *
 * The operating contract is explicit: no instruction may require Keith to open
 * a terminal. An app he cannot start from this console is an app he cannot
 * use, however finished it is — so "run pnpm dev" is a feature request for
 * this file, not an instruction for him.
 *
 * Status is answered by asking the app itself, never by remembering a pid.
 * A pid we spawned tells us a process existed; its health endpoint tells us
 * the app is actually serving, which is the thing he is about to click into.
 */

export interface AppStatus {
  readonly app: LocalApp;
  readonly running: boolean;
  readonly url: string;
  /** Plain English, for the panel. Never jargon. */
  readonly detail: string;
}

/** Ask the app whether it is up. A short timeout: this runs on a page render. */
export async function appStatus(app: LocalApp): Promise<AppStatus> {
  const url = appUrl(app);
  let probe: { reached: boolean; ok: boolean };
  try {
    const response = await fetch(`${url}${app.healthPath}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });
    probe = { reached: true, ok: response.ok };
  } catch {
    // Connection refused, DNS, timeout — from the operator's point of view
    // these are all one thing: it is not running.
    probe = { reached: false, ok: false };
  }
  return { app, url, ...describeHealth(app, probe) };
}

export async function localAppStatuses(): Promise<AppStatus[]> {
  return Promise.all(LOCAL_APPS.map((app) => appStatus(app)));
}

export interface StartResult {
  readonly ok: boolean;
  readonly url: string;
  /** Plain English. On failure, this is what went wrong, not a stack trace. */
  readonly message: string;
}

/**
 * Build if needed, start, then wait until it actually answers.
 *
 * It would be easy to spawn the process and report success. That would be a
 * button that does not do its job: the browser would open on a connection
 * error a second later. So this waits for a real health response, and says so
 * honestly if one never arrives.
 */
export async function startApp(key: string): Promise<StartResult> {
  const app = findApp(key);
  if (app === undefined) {
    return { ok: false, url: "", message: `No local app called "${key}".` };
  }

  const already = await appStatus(app);
  if (already.running) {
    return { ok: true, url: already.url, message: "It was already running." };
  }

  const build = await pnpm(["--filter", app.filter, "build"], {
    timeoutMs: 600_000,
  });
  if (!build.ok) {
    return {
      ok: false,
      url: appUrl(app),
      message: `${app.name} could not be built, so it was not started. ${build.output.slice(-400)}`,
    };
  }

  const spawned = spawnPnpm(["--filter", app.filter, "start"], {
    cwd: REPO_ROOT,
  });
  if (!spawned.ok) {
    return {
      ok: false,
      url: appUrl(app),
      message: `${app.name} would not start. ${spawned.error ?? ""}`.trim(),
    };
  }

  const ready = await waitUntilHealthy(app, 40_000);
  return ready
    ? { ok: true, url: appUrl(app), message: `${app.name} is running.` }
    : {
        ok: false,
        url: appUrl(app),
        message: `${app.name} was started but never answered on port ${app.port}. Nothing was opened, because a link to a page that will not load is worse than no link.`,
      };
}

async function waitUntilHealthy(app: LocalApp, budgetMs: number): Promise<boolean> {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const status = await appStatus(app);
    if (status.running) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}
