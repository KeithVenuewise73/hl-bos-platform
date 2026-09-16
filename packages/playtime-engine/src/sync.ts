import { normalizeLog, type GameEvent } from "./events";

/**
 * The outbox.
 *
 * A sports field is where connectivity goes to die: a metal bleacher, two
 * hundred phones on one tower, a rural complex with no coverage at all. So
 * nothing in PlayTime Tracker waits for a network. Every change is written
 * locally first and queued here; the queue drains when a network reappears,
 * and if it never does, the game is still complete and correct on the device.
 *
 * This module is pure queue arithmetic -- what to send, in what order, when to
 * retry -- so it can be tested exhaustively without a network, a database or a
 * fake server.
 */

export type OutboxKind =
  | "team"
  | "player"
  | "game"
  | "game_player"
  | "game_event"
  | "game_score"
  | "game_delete"
  | "team_delete"
  | "player_delete";

export interface OutboxItem {
  /** Idempotency key. The same value the server will store as the row's id. */
  id: string;
  kind: OutboxKind;
  /** The row this item writes. For `game_event`, equal to `id`. */
  recordId: string;
  payload: unknown;
  queuedAt: string;
  attempts: number;
  /** Epoch ms before which this item must not be retried. */
  nextAttemptAt: number;
  lastError: string | null;
}

/**
 * Kinds whose queued items may be collapsed to the newest one.
 *
 * Renaming a team four times offline should send one row, not four. An event
 * is the opposite case and is never collapsed: the log is append-only and each
 * record is a distinct fact about a distinct instant. Collapsing two
 * substitutions would erase an athlete's minutes, which is the exact failure
 * this whole design exists to prevent.
 */
const COLLAPSIBLE: ReadonlySet<OutboxKind> = new Set<OutboxKind>([
  "team",
  "player",
  "game",
  "game_player",
  "game_score",
]);

export function isCollapsible(kind: OutboxKind): boolean {
  return COLLAPSIBLE.has(kind);
}

export interface EnqueueInput {
  id: string;
  kind: OutboxKind;
  recordId: string;
  payload: unknown;
  at: string;
}

/** Append to the queue, collapsing a superseded write of the same mutable row. */
export function enqueue(
  outbox: readonly OutboxItem[],
  input: EnqueueInput,
): OutboxItem[] {
  const item: OutboxItem = {
    id: input.id,
    kind: input.kind,
    recordId: input.recordId,
    payload: input.payload,
    queuedAt: input.at,
    attempts: 0,
    nextAttemptAt: 0,
    lastError: null,
  };

  const kept = outbox.filter((existing) => {
    if (existing.id === item.id) return false;
    if (!isCollapsible(item.kind)) return true;
    return !(existing.kind === item.kind && existing.recordId === item.recordId);
  });

  kept.push(item);
  return kept;
}

/** Retry backoff: 2s, 4s, 8s, 16s, 32s, then every minute. */
export function backoffMs(attempts: number): number {
  if (attempts <= 0) return 0;
  if (attempts >= 6) return 60_000;
  return 2_000 * 2 ** (attempts - 1);
}

/**
 * Items eligible to send now, oldest first.
 *
 * Order matters and is not incidental: a `game_event` referencing a game the
 * server has never seen would be rejected, so parents are drained before
 * children. Within a kind, insertion order is preserved.
 */
const KIND_ORDER: readonly OutboxKind[] = [
  "team",
  "player",
  "game",
  "game_player",
  "game_event",
  "game_score",
  "player_delete",
  "game_delete",
  "team_delete",
];

export function dueItems(outbox: readonly OutboxItem[], now: number): OutboxItem[] {
  return outbox
    .filter((i) => i.nextAttemptAt <= now)
    .slice()
    .sort((a, b) => {
      const ka = KIND_ORDER.indexOf(a.kind);
      const kb = KIND_ORDER.indexOf(b.kind);
      if (ka !== kb) return ka - kb;
      return Date.parse(a.queuedAt) - Date.parse(b.queuedAt);
    });
}

export function markSynced(
  outbox: readonly OutboxItem[],
  ids: readonly string[],
): OutboxItem[] {
  const done = new Set(ids);
  return outbox.filter((i) => !done.has(i.id));
}

export function markFailed(
  outbox: readonly OutboxItem[],
  id: string,
  error: string,
  now: number,
): OutboxItem[] {
  return outbox.map((i) => {
    if (i.id !== id) return i;
    const attempts = i.attempts + 1;
    return {
      ...i,
      attempts,
      lastError: error,
      nextAttemptAt: now + backoffMs(attempts),
    };
  });
}

/**
 * Reconcile a local log with one fetched from the server.
 *
 * Union, not "server wins". The device is the only witness to a tap made in a
 * dead zone; a sync that let the server's shorter copy overwrite it would
 * delete minutes an athlete actually played. Duplicate ids collapse to one
 * record, so re-syncing the same game any number of times is a no-op.
 */
export function mergeLogs(
  local: readonly GameEvent[],
  remote: readonly GameEvent[],
): GameEvent[] {
  return normalizeLog([...local, ...remote]);
}

/** Events present locally but not on the server -- the real sync backlog. */
export function unsyncedEvents(
  local: readonly GameEvent[],
  remoteIds: ReadonlySet<string>,
): GameEvent[] {
  return normalizeLog(local).filter((e) => !remoteIds.has(e.id));
}
