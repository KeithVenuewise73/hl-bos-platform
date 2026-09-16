import { z } from "zod";

/**
 * The game event log.
 *
 * Every state change in a live game is one append-only, timestamped record.
 * The coach's phone writes it locally the instant the tap happens; the
 * network gets a copy whenever the network feels like existing. That ordering
 * is the whole offline story: nothing about tracking a game depends on a
 * server being reachable from a bleacher.
 *
 * WHY EVENTS AND NOT A `seconds_played` COLUMN. A counter you increment is a
 * counter you can lose: the app is backgrounded and the tick stops, the phone
 * is killed and the last increment never landed, two devices both add to the
 * same total. An event log has none of those failure modes. Replaying it from
 * the beginning always produces the same answer, on any device, at any later
 * time, with or without connectivity.
 *
 * WHY EVERY EVENT CARRIES ITS OWN `id`. The id is generated on the device at
 * the moment of the tap, before any write is attempted. If a sync is retried
 * because the response was lost rather than because the write failed, the
 * second attempt carries the same id and the database's primary key rejects
 * the duplicate. A substitution cannot be recorded twice, which is the one
 * corruption that would silently inflate an athlete's minutes.
 */

const iso = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: "not an ISO timestamp" });

const base = {
  /** Client-generated UUID. The idempotency key for sync. */
  id: z.string().min(1),
  gameId: z.string().min(1),
  /** Wall-clock instant of the tap, ISO-8601 with timezone. */
  at: iso,
  /**
   * Monotonic per-device sequence. Used ONLY to break ties between events that
   * share a millisecond -- never as the source of duration. Duration always
   * comes from `at`.
   */
  seq: z.number().int().nonnegative(),
};

export const gameEventSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("game_started") }),
  z.object({ ...base, type: z.literal("period_started"), period: z.number().int().positive() }),
  z.object({ ...base, type: z.literal("period_ended"), period: z.number().int().positive() }),
  z.object({ ...base, type: z.literal("clock_paused") }),
  z.object({ ...base, type: z.literal("clock_resumed") }),
  z.object({ ...base, type: z.literal("player_in"), playerId: z.string().min(1) }),
  z.object({ ...base, type: z.literal("player_out"), playerId: z.string().min(1) }),
  z.object({ ...base, type: z.literal("game_ended") }),
]);

export type GameEvent = z.infer<typeof gameEventSchema>;
export type GameEventType = GameEvent["type"];

/** Events that start or stop the game clock. */
export const CLOCK_EVENTS: ReadonlySet<GameEventType> = new Set<GameEventType>([
  "game_started",
  "period_started",
  "period_ended",
  "clock_paused",
  "clock_resumed",
  "game_ended",
]);

/**
 * Deterministic ordering. Timestamp first, then device sequence, then id.
 *
 * The id tiebreak is not decoration: without it, two events recorded in the
 * same millisecond on two devices could sort differently on each of them, and
 * the same log would produce two different reports. Sorting must be a total
 * order or replay is not reproducible.
 */
export function compareEvents(a: GameEvent, b: GameEvent): number {
  const ta = Date.parse(a.at);
  const tb = Date.parse(b.at);
  if (ta !== tb) return ta - tb;
  if (a.seq !== b.seq) return a.seq - b.seq;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Sort a log into replay order, discarding exact duplicate ids.
 *
 * Deduplication here is the second half of the idempotency guarantee. The
 * database rejects a duplicate id on write; this rejects one that reached the
 * local log twice (a retried queue flush, a restored backup merged with live
 * state). Either path alone would leave a hole.
 */
export function normalizeLog(events: readonly GameEvent[]): GameEvent[] {
  const seen = new Set<string>();
  const out: GameEvent[] = [];
  for (const e of events) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  out.sort(compareEvents);
  return out;
}

/** Parse an event from untrusted input (a sync payload, a restored file). */
export function parseEvent(input: unknown): GameEvent {
  return gameEventSchema.parse(input);
}

/**
 * Parse a whole log, dropping records that do not validate rather than
 * throwing the entire game away.
 *
 * A coach who loses one malformed record and keeps the other four hundred is
 * in a far better position than one whose game refuses to load. The caller is
 * told exactly how many were dropped so the app can say so out loud instead
 * of quietly reporting short minutes.
 */
export function parseLog(input: unknown): { events: GameEvent[]; dropped: number } {
  if (!Array.isArray(input)) return { events: [], dropped: 0 };
  const events: GameEvent[] = [];
  let dropped = 0;
  for (const raw of input) {
    const result = gameEventSchema.safeParse(raw);
    if (result.success) events.push(result.data);
    else dropped += 1;
  }
  return { events: normalizeLog(events), dropped };
}
