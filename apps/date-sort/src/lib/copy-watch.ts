/**
 * Is a running copy still alive? Decided from the page's side, because the
 * page is what goes quiet when the connection dies: after a laptop sleeps, a
 * connection can hang without ever reporting an error, leaving a progress bar
 * that looks busy but will never move again. That happened on the CEO's
 * first full copy and needed a browser refresh (and a fresh scan) to escape.
 *
 * The copy sends a heartbeat every few seconds even between photos, so:
 *   - no message at all for LOST_AFTER_MS  -> the connection is gone; say so
 *   - heartbeats, but no photo finished for STALLED_AFTER_MS -> say it looks
 *     stuck (an unplugged drive, a disk that went to sleep) and what to do
 */

export const HEARTBEAT_MS = 5_000;
export const LOST_AFTER_MS = 30_000;
export const STALLED_AFTER_MS = 120_000;

export type CopyHealth = "ok" | "stalled" | "lost";

export function copyHealth(
  now: number,
  lastMessageAt: number,
  lastPhotoAt: number,
): CopyHealth {
  if (now - lastMessageAt >= LOST_AFTER_MS) return "lost";
  if (now - lastPhotoAt >= STALLED_AFTER_MS) return "stalled";
  return "ok";
}
