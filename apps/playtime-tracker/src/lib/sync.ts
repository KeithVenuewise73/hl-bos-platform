"use client";

import {
  dueItems,
  parseEvent,
  type GameEvent,
  type OutboxItem,
} from "@hl-bos/playtime-engine";
import {
  currentOwner,
  getCore,
  mergeIntoLog,
  recordSyncFailure,
  recordSyncSuccess,
} from "./store";
import { supabase } from "./supabase";

/**
 * Draining the outbox.
 *
 * Sync is entirely one-directional at write time: the device decides what
 * happened, the server records it. There is no merge conflict to resolve
 * because there is nothing to conflict with -- an event log is append-only and
 * every record carries an id minted before the first attempt, so sending the
 * same thing twice is a no-op the database enforces.
 *
 * Nothing in the UI waits for any of this. If it never succeeds, every game is
 * still complete and correct on the device.
 */

export type SyncOutcome =
  | { state: "idle"; reason: "nothing-queued" }
  | { state: "skipped"; reason: "no-account-service" | "signed-out" | "offline" }
  | { state: "synced"; sent: number }
  | { state: "failed"; sent: number; error: string };

export const table = (kind: OutboxItem["kind"]): string => {
  switch (kind) {
    case "team":
    case "team_delete":
      return "teams";
    case "player":
    case "player_delete":
      return "players";
    case "game":
    case "game_delete":
    case "game_score":
      return "games";
    case "game_player":
      return "game_players";
    case "game_event":
      return "game_events";
  }
};

interface TeamPayload {
  id: string;
  name: string;
  sport: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
interface PlayerPayload {
  id: string;
  teamId: string;
  firstName: string;
  lastName: string;
  jerseyNumber: string;
  position: string | null;
  active: boolean;
}
interface GamePayload {
  id: string;
  teamId: string;
  opponent: string;
  gameDate: string;
  periodCount: number;
  periodSeconds: number;
  minimum: { kind: string; percent?: number; seconds?: number };
  rosterPlayerIds: readonly string[];
  score: { us: number; them: number } | null;
}

/** Translate one queued item into the row shape migration 0049 defines. */
export function rowFor(item: OutboxItem, ownerId: string): Record<string, unknown> {
  switch (item.kind) {
    case "team": {
      const t = item.payload as TeamPayload;
      return {
        id: t.id,
        owner_id: ownerId,
        name: t.name,
        sport: t.sport,
        archived_at: t.archivedAt,
      };
    }
    case "player": {
      const p = item.payload as PlayerPayload;
      return {
        id: p.id,
        owner_id: ownerId,
        team_id: p.teamId,
        first_name: p.firstName,
        last_name: p.lastName,
        jersey_number: p.jerseyNumber,
        position: p.position,
        active: p.active,
      };
    }
    case "game": {
      const g = item.payload as GamePayload;
      return {
        id: g.id,
        owner_id: ownerId,
        team_id: g.teamId,
        opponent: g.opponent,
        game_date: g.gameDate,
        period_count: g.periodCount,
        period_seconds: g.periodSeconds,
        minimum_kind: g.minimum.kind,
        minimum_value:
          g.minimum.kind === "percent"
            ? (g.minimum.percent ?? null)
            : g.minimum.kind === "seconds"
              ? (g.minimum.seconds ?? null)
              : null,
        score_us: g.score?.us ?? null,
        score_them: g.score?.them ?? null,
      };
    }
    case "game_score": {
      const s = item.payload as {
        id: string;
        score: { us: number; them: number } | null;
      };
      return {
        id: s.id,
        owner_id: ownerId,
        score_us: s.score?.us ?? null,
        score_them: s.score?.them ?? null,
      };
    }
    case "game_event": {
      const e = item.payload as GameEvent;
      return {
        id: e.id,
        owner_id: ownerId,
        game_id: e.gameId,
        type: e.type,
        occurred_at: e.at,
        seq: e.seq,
        player_id: "playerId" in e ? e.playerId : null,
        period: "period" in e ? e.period : null,
      };
    }
    case "game_player":
    case "team_delete":
    case "player_delete":
    case "game_delete":
      return item.payload as Record<string, unknown>;
  }
}

const isDelete = (kind: OutboxItem["kind"]): boolean =>
  kind === "team_delete" || kind === "player_delete" || kind === "game_delete";

/**
 * Push everything that is due.
 *
 * Stops at the first failure rather than hammering a dead network: the items
 * are ordered so that a parent row precedes the rows referencing it, and
 * pushing a child after its parent failed would only produce a second,
 * confusing error.
 */
export async function flushOutbox(): Promise<SyncOutcome> {
  const client = supabase();
  if (client === null) return { state: "skipped", reason: "no-account-service" };

  const owner = currentOwner();
  if (owner === "local-device") return { state: "skipped", reason: "signed-out" };

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { state: "skipped", reason: "offline" };
  }

  const due = dueItems(getCore().outbox, Date.now());
  if (due.length === 0) return { state: "idle", reason: "nothing-queued" };

  const sentIds: string[] = [];
  for (const item of due) {
    try {
      const row = rowFor(item, owner);
      const query = client.from(table(item.kind));
      const { error } = isDelete(item.kind)
        ? await query.delete().eq("id", (row as { id: string }).id)
        : item.kind === "game_event"
          ? // Events never change. `ignoreDuplicates` makes a retried send a
            // no-op instead of an error, which is what idempotency looks like
            // from the client side.
            await query.upsert(row, { onConflict: "id", ignoreDuplicates: true })
          : await query.upsert(row, { onConflict: "id" });

      if (error) {
        recordSyncSuccess(sentIds);
        recordSyncFailure(item.id, error.message);
        return { state: "failed", sent: sentIds.length, error: error.message };
      }
      sentIds.push(item.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed.";
      recordSyncSuccess(sentIds);
      recordSyncFailure(item.id, message);
      return { state: "failed", sent: sentIds.length, error: message };
    }
  }

  recordSyncSuccess(sentIds);
  return { state: "synced", sent: sentIds.length };
}

/**
 * Pull a game's events back from the server and merge them in.
 *
 * Union, never replace. The device is the only witness to a tap made in a dead
 * zone, so a server copy that is shorter must not be allowed to shorten the
 * local one.
 */
export async function pullGameLog(gameId: string): Promise<number> {
  const client = supabase();
  if (client === null) return 0;

  const { data, error } = await client
    .from("game_events")
    .select("id, game_id, type, occurred_at, seq, player_id, period")
    .eq("game_id", gameId);
  if (error || !data) return 0;

  const events: GameEvent[] = [];
  for (const row of data as Record<string, unknown>[]) {
    try {
      events.push(
        parseEvent({
          id: row["id"],
          gameId: row["game_id"],
          type: row["type"],
          at: row["occurred_at"],
          seq: row["seq"] ?? 0,
          ...(row["player_id"] ? { playerId: row["player_id"] } : {}),
          ...(row["period"] ? { period: row["period"] } : {}),
        }),
      );
    } catch {
      // A row the client cannot parse is skipped rather than allowed to abort
      // the whole pull. Losing one record beats losing the game.
    }
  }
  mergeIntoLog(gameId, events);
  return events.length;
}
