/**
 * How long a wrong code has to wait before the next guess.
 *
 * On the home Wi-Fi a six-digit code was a reasonable lock: the people who can
 * reach the address are the people in the house, plus whatever else joined the
 * network. Reachable from outside the house it is a different problem. A
 * million combinations is nothing to a script that can guess without pausing —
 * minutes, not years.
 *
 * So guessing pauses. Three attempts are free, because people mistype. After
 * that each wrong answer doubles the wait, to a ceiling of thirty seconds.
 * At the ceiling an attacker manages two guesses a minute, which turns a
 * million combinations into about a year of uninterrupted attacking, and a
 * correct code clears the whole thing instantly.
 *
 * WHY THERE IS NO PER-ADDRESS KEY. The obvious design counts failures per
 * source address. Behind a tunnel every request arrives from the tunnel's own
 * local connection, so that key collapses to one bucket anyway — it would read
 * as a defence and be none. One global counter is the honest version of what
 * this can actually enforce.
 *
 * The cost of one counter is that someone guessing can slow the owner down
 * too. That is why this delays rather than locks: the wait is capped, it never
 * refuses outright, and getting it right resets it. Being made to wait thirty
 * seconds is an annoyance; being locked out of your own photographs by a
 * stranger on the internet is a denial of service.
 *
 * Pure: the caller passes the state and the clock.
 */

export interface AttemptState {
  /** Consecutive wrong answers. */
  readonly failures: number;
  /** Epoch milliseconds before which the next attempt is refused. */
  readonly nextAllowedAt: number;
}

export const NO_FAILURES: AttemptState = { failures: 0, nextAllowedAt: 0 };

/** Free attempts before the wait starts. */
export const FREE_ATTEMPTS = 3;

/** The ceiling. Long enough to defeat a script, short enough to sit through. */
export const MAX_DELAY_MS = 30_000;

/**
 * The wait earned by `failures` consecutive wrong answers.
 *
 * 0 for the first three, then 1s, 2s, 4s, 8s, 16s, 30s, 30s...
 */
export function delayAfter(failures: number): number {
  if (failures <= FREE_ATTEMPTS) return 0;
  const doublings = failures - FREE_ATTEMPTS - 1;
  // Cap the exponent before computing it. 2 ** 5000 is Infinity, and
  // Math.min(Infinity, cap) would still be the cap -- but only by luck, and a
  // number that large has no business existing here.
  if (doublings > 20) return MAX_DELAY_MS;
  return Math.min(1000 * 2 ** doublings, MAX_DELAY_MS);
}

/** May this attempt be answered yet? */
export function mayAttempt(
  state: AttemptState,
  now: number,
): { readonly allowed: boolean; readonly waitMs: number } {
  const waitMs = state.nextAllowedAt - now;
  return waitMs > 0 ? { allowed: false, waitMs } : { allowed: true, waitMs: 0 };
}

export function afterFailure(state: AttemptState, now: number): AttemptState {
  const failures = state.failures + 1;
  return { failures, nextAllowedAt: now + delayAfter(failures) };
}

/** A correct code clears everything. */
export function afterSuccess(): AttemptState {
  return NO_FAILURES;
}

/** "Wait 8 seconds", in the words shown on the phone. */
export function describeWait(waitMs: number): string {
  const seconds = Math.max(1, Math.ceil(waitMs / 1000));
  return seconds === 1
    ? "Too many wrong codes. Wait a second and try again."
    : `Too many wrong codes. Wait ${seconds} seconds and try again.`;
}
