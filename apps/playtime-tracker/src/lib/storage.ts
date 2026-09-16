/**
 * The device is the primary database.
 *
 * Not a cache in front of Supabase -- the primary. Every tap is written here
 * first, synchronously, before anything is attempted over a network. A sports
 * field is where connectivity goes to die: a metal bleacher, two hundred phones
 * on one tower, a rural complex with no coverage at all. A tracker that needs a
 * round trip to record a substitution is a tracker that loses the game.
 *
 * WHY localStorage AND NOT IndexedDB. Writes here are synchronous. When iOS
 * suspends a backgrounded app it does not wait for an async transaction to
 * settle, so an IndexedDB write issued as the coach switches to the camera can
 * simply not land. A synchronous write has already happened by the time the
 * function returns. The trade is capacity, and the arithmetic is comfortable:
 * a four-quarter game with a substitution every thirty seconds is roughly 400
 * events, about 60 KB. A whole season of thirty games fits inside 2 MB, well
 * within the 5 MB every browser and web view guarantees.
 *
 * WHY THE EVENT LOG IS KEPT PER GAME. During a live game the only thing being
 * written is one game's log. Splitting it out means a tap rewrites a few
 * kilobytes rather than the entire season.
 */

const PREFIX = "ptt:v1";
export const CORE_KEY = `${PREFIX}:core`;
export const logKey = (gameId: string): string => `${PREFIX}:log:${gameId}`;

/** True when this build is running somewhere with a usable web storage area. */
export function storageAvailable(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    const probe = `${PREFIX}:probe`;
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    // Corrupt or unreadable. Returning the fallback keeps the app usable; the
    // caller decides whether to say so. Throwing here would mean a single bad
    // key makes a coach's whole season unopenable.
    return fallback;
  }
}

export class StorageFullError extends Error {
  constructor() {
    super("This device is out of storage space, so the last change was not saved.");
    this.name = "StorageFullError";
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    // A failed write during a live game is the one error this app must never
    // swallow: the coach would keep tapping and the minutes would quietly stop
    // accumulating. It is surfaced, loudly, wherever it happens.
    const quota =
      err instanceof DOMException &&
      (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED");
    if (quota) throw new StorageFullError();
    throw err;
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* removal failing is not worth interrupting anyone over */
  }
}

/** Every key this app owns. Used by "delete everything on this device". */
export function ownedKeys(): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(`${PREFIX}:`)) keys.push(k);
    }
  } catch {
    /* nothing readable, nothing to clear */
  }
  return keys;
}
