import "server-only";

import type { CheckResult } from "@hl-bos/date-sort/free-card";

/**
 * The last check's result, kept in memory so "Delete" can only ever act on
 * exactly what a person was shown. One at a time, used once: after a delete (or
 * a new check) the old result is gone, and a restart forgets it, so the page
 * says to check again.
 */
interface Held {
  readonly id: string;
  readonly scanId: string;
  readonly destination: string;
  readonly check: CheckResult;
}

let held: Held | null = null;

export function holdCheck(
  scanId: string,
  destination: string,
  check: CheckResult,
): string {
  const id = crypto.randomUUID();
  held = { id, scanId, destination, check };
  return id;
}

export function takeCheck(id: string): Held | null {
  if (held === null || held.id !== id) return null;
  const h = held;
  held = null; // one delete per check
  return h;
}

export function forgetCheck(): void {
  held = null;
}
