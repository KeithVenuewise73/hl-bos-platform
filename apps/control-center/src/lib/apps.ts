import "server-only";

import { REPO_ROOT, cmd, pnpm, spawnPnpm } from "./shell";
import {
  LOCAL_APPS,
  appUrl,
  classifyPort,
  describeHealth,
  findApp,
  type LocalApp,
  nodeTooOld,
  portTakenMessage,
  stopListenerCommand,
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
async function probeApp(
  app: LocalApp,
): Promise<{ reached: boolean; ok: boolean; refusing: boolean }> {
  try {
    const response = await fetch(`${appUrl(app)}${app.healthPath}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });
    // The refusing state answers HTTP 200 on purpose (the container is alive),
    // so the status code alone would report a refusal page as "healthy". Read
    // the app's own word for its state.
    let refusing = false;
    try {
      const body = (await response.clone().json()) as { status?: unknown };
      refusing = body.status === "refusing";
    } catch {
      refusing = false;
    }
    return { reached: true, ok: response.ok && !refusing, refusing };
  } catch {
    // Connection refused, DNS, timeout — from the operator's point of view
    // these are all one thing: it is not running.
    return { reached: false, ok: false, refusing: false };
  }
}

export async function appStatus(app: LocalApp): Promise<AppStatus> {
  return { app, url: appUrl(app), ...describeHealth(app, await probeApp(app)) };
}

/** Wait for the port to stop answering, so the new copy can have it. */
async function waitUntilFree(app: LocalApp, budgetMs: number): Promise<boolean> {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (!(await probeApp(app)).reached) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
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

  const port = classifyPort(await probeApp(app));
  if (port === "healthy") {
    return { ok: true, url: appUrl(app), message: "It was already running." };
  }
  if (port === "someone-else") {
    return { ok: false, url: appUrl(app), message: portTakenMessage(app) };
  }
  if (port === "stale-refusing") {
    // An old copy of this very app is holding the port and refusing to serve.
    // Left alone, the new copy cannot bind and the console reports "never
    // answered" while he keeps seeing the old refusal page.
    await cmd("powershell", stopListenerCommand(app.port), { timeoutMs: 20_000 });
    if (!(await waitUntilFree(app, 8_000))) {
      return {
        ok: false,
        url: appUrl(app),
        message: `An old copy of ${app.name} is still holding port ${app.port} and could not be stopped. Nothing new was started. Restarting the computer clears it.`,
      };
    }
  }

  const tooOld = nodeTooOld(app, process.version);
  if (tooOld !== null) return { ok: false, url: appUrl(app), message: tooOld };

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
    ...(app.env !== undefined ? { env: app.env } : {}),
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
