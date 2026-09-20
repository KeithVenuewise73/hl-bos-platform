import "server-only";

import {
  afterFailure,
  afterSuccess,
  mayAttempt,
  NO_FAILURES,
  type AttemptState,
} from "@/lib/throttle";

/**
 * Where the guess counter lives.
 *
 * In memory, in this process. `next start` serves this app from a single Node
 * process, so one module instance is one counter -- which is the whole
 * household, which is what throttle.ts is deliberately counting.
 *
 * It is lost on restart. Worth being explicit that this is a real limitation
 * and not an oversight: someone who can restart SceneFlow can clear the wait,
 * but someone who can restart SceneFlow is already on the machine, and
 * everything this protects is a file on that machine. The threat is a stranger
 * on the network, and a stranger cannot restart it.
 */

let state: AttemptState = NO_FAILURES;

export function guessAllowed(now = Date.now()): {
  readonly allowed: boolean;
  readonly waitMs: number;
} {
  return mayAttempt(state, now);
}

export function recordWrongGuess(now = Date.now()): void {
  state = afterFailure(state, now);
}

export function recordRightGuess(): void {
  state = afterSuccess();
}

/** For tests and for the console, never for a decision. */
export function attemptState(): AttemptState {
  return state;
}
