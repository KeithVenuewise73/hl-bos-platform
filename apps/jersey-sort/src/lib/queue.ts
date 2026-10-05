import "server-only";

import { config } from "./config.ts";
import { db } from "./db.ts";
import { resolveProvider } from "./providers.ts";
import { drain, recoverInterrupted, type QueueDeps } from "./queue-core.ts";
import { getSettings } from "./repo/settings.ts";

/**
 * The background worker. Runs inside the app's server process, so analysis
 * continues while the person navigates anywhere in the app; it stops when
 * the app stops and resumes (interrupted photos re-queued) when it starts.
 */

const g = globalThis as unknown as {
  __jerseysortQueue?: { running: boolean; again: boolean; started: boolean };
};

function state() {
  g.__jerseysortQueue ??= { running: false, again: false, started: false };
  return g.__jerseysortQueue;
}

function deps(): QueueDeps {
  return {
    db: db(),
    dataDir: config().dataDir,
    provider: (org) => resolveProvider(getSettings(db(), org).provider),
  };
}

/** Wake the worker. Safe to call as often as you like. */
export function kickQueue(): void {
  const s = state();
  if (!s.started) {
    s.started = true;
    recoverInterrupted(db());
    // A safety net: anything queued while the worker slept is picked up.
    setInterval(kickQueue, 10_000).unref();
  }
  if (s.running) {
    s.again = true;
    return;
  }
  s.running = true;
  void (async () => {
    try {
      do {
        s.again = false;
        await drain(deps(), config().workers);
      } while (s.again);
    } catch (e) {
      console.error("[jerseysort] queue worker stopped:", e);
    } finally {
      s.running = false;
    }
  })();
}
