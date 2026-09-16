"use client";

import {
  enqueue,
  markFailed,
  markSynced,
  newId,
  normalizeLog,
  parseLog,
  type Game,
  type GameEvent,
  type MinimumTarget,
  type OutboxItem,
  type Player,
  type Sport,
  type Team,
} from "@hl-bos/playtime-engine";
import { CORE_KEY, logKey, ownedKeys, readJson, removeKey, writeJson } from "./storage";

/**
 * The application store.
 *
 * Local-first: every mutation lands on the device immediately and is queued for
 * the server separately. Nothing in this file awaits a network before the data
 * is safe, and nothing in the UI awaits this file.
 */

export const LOCAL_OWNER = "local-device";

export interface Core {
  schema: 1;
  teams: Team[];
  players: Player[];
  games: Game[];
  outbox: OutboxItem[];
  /** Set when a sync attempt failed, so the UI can say what is actually wrong. */
  lastSyncError: string | null;
  lastSyncedAt: string | null;
}

const EMPTY: Core = {
  schema: 1,
  teams: [],
  players: [],
  games: [],
  outbox: [],
  lastSyncError: null,
  lastSyncedAt: null,
};

const listeners = new Set<() => void>();
let cache: Core | null = null;

/**
 * A change counter, not a snapshot.
 *
 * React's useSyncExternalStore compares snapshots by identity and re-renders
 * until two consecutive reads agree. Handing it a freshly built array -- which
 * every selector below returns -- means they never agree, and the component
 * loops until React gives up. A monotonically increasing number always agrees
 * with itself, so it is what the hook subscribes to; the selectors then run as
 * ordinary reads during render.
 */
let version = 0;

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getVersion(): number {
  return version;
}

function notify(): void {
  version += 1;
  for (const fn of listeners) fn();
}

export function getCore(): Core {
  if (cache === null) {
    const loaded = readJson<Partial<Core>>(CORE_KEY, EMPTY);
    cache = {
      ...EMPTY,
      ...loaded,
      teams: loaded.teams ?? [],
      players: loaded.players ?? [],
      games: loaded.games ?? [],
      outbox: loaded.outbox ?? [],
    };
  }
  return cache;
}

function setCore(next: Core): void {
  cache = next;
  writeJson(CORE_KEY, next);
  notify();
}

/** Apply a change to the core and persist it. Throws if the device is full. */
export function mutate(fn: (core: Core) => Core): void {
  setCore(fn(getCore()));
}

const nowIso = (): string => new Date().toISOString();

function queue(
  core: Core,
  kind: OutboxItem["kind"],
  recordId: string,
  payload: unknown,
): OutboxItem[] {
  return enqueue(core.outbox, {
    id: kind === "game_event" ? recordId : newId(),
    kind,
    recordId,
    payload,
    at: nowIso(),
  });
}

// --- Ownership -------------------------------------------------------------

/**
 * Who owns records created right now.
 *
 * Before sign-in, records are owned by the device. That is a real mode, not a
 * degraded one: a coach who downloads the app twenty minutes before kickoff
 * should be tracking a game, not creating an account.
 */
let ownerId: string = LOCAL_OWNER;

export function setOwner(id: string | null): void {
  ownerId = id ?? LOCAL_OWNER;
}

export function currentOwner(): string {
  return ownerId;
}

/**
 * Re-own everything created before sign-in.
 *
 * The person who signs in on this device is the person who made these records
 * minutes earlier. Leaving them stranded under `local-device` would mean a
 * coach signs up and watches their game disappear.
 */
export function claimLocalRecords(newOwnerId: string): number {
  let claimed = 0;
  mutate((core) => {
    const reown = <T extends { ownerId: string }>(rows: T[]): T[] =>
      rows.map((r) => {
        if (r.ownerId !== LOCAL_OWNER) return r;
        claimed += 1;
        return { ...r, ownerId: newOwnerId };
      });
    return {
      ...core,
      teams: reown(core.teams),
      players: reown(core.players),
      games: reown(core.games),
    };
  });
  return claimed;
}

const mine = <T extends { ownerId: string }>(rows: readonly T[]): T[] =>
  rows.filter((r) => r.ownerId === ownerId || r.ownerId === LOCAL_OWNER);

// --- Reads -----------------------------------------------------------------

export const teams = (): Team[] =>
  mine(getCore().teams)
    .filter((t) => t.archivedAt === null)
    .sort((a, b) => a.name.localeCompare(b.name));

export const archivedTeams = (): Team[] =>
  mine(getCore().teams).filter((t) => t.archivedAt !== null);

export const team = (id: string): Team | undefined =>
  mine(getCore().teams).find((t) => t.id === id);

export const players = (teamId: string): Player[] =>
  mine(getCore().players)
    .filter((p) => p.teamId === teamId)
    .sort((a, b) => {
      const na = Number(a.jerseyNumber);
      const nb = Number(b.jerseyNumber);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
      return `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`);
    });

export const player = (id: string): Player | undefined =>
  mine(getCore().players).find((p) => p.id === id);

export const games = (): Game[] =>
  mine(getCore().games).sort(
    (a, b) =>
      b.gameDate.localeCompare(a.gameDate) || b.createdAt.localeCompare(a.createdAt),
  );

export const game = (id: string): Game | undefined =>
  mine(getCore().games).find((g) => g.id === id);

export function gameLog(gameId: string): GameEvent[] {
  const { events } = parseLog(readJson<unknown>(logKey(gameId), []));
  return events;
}

/** How many events in this game's log have not reached the server yet. */
export function pendingCount(): number {
  return getCore().outbox.length;
}

// --- Teams -----------------------------------------------------------------

export function createTeam(name: string, sport: Sport): Team {
  const t: Team = {
    id: newId(),
    ownerId,
    name: name.trim(),
    sport,
    archivedAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  mutate((core) => ({
    ...core,
    teams: [...core.teams, t],
    outbox: queue(core, "team", t.id, t),
  }));
  return t;
}

export function updateTeam(id: string, patch: { name?: string; sport?: Sport }): void {
  mutate((core) => {
    const teamsNext = core.teams.map((t) =>
      t.id === id
        ? {
            ...t,
            ...(patch.name === undefined ? {} : { name: patch.name.trim() }),
            ...(patch.sport === undefined ? {} : { sport: patch.sport }),
            updatedAt: nowIso(),
          }
        : t,
    );
    const updated = teamsNext.find((t) => t.id === id);
    return {
      ...core,
      teams: teamsNext,
      outbox: updated ? queue(core, "team", id, updated) : core.outbox,
    };
  });
}

/**
 * Archive, not delete.
 *
 * A team with games behind it is a season's record of real children. Tidying a
 * list is not a reason to destroy it, so archiving is the default and deletion
 * is a separate, explicit act.
 */
export function archiveTeam(id: string): void {
  mutate((core) => {
    const teamsNext = core.teams.map((t) =>
      t.id === id ? { ...t, archivedAt: nowIso(), updatedAt: nowIso() } : t,
    );
    const updated = teamsNext.find((t) => t.id === id);
    return {
      ...core,
      teams: teamsNext,
      outbox: updated ? queue(core, "team", id, updated) : core.outbox,
    };
  });
}

export function restoreTeam(id: string): void {
  mutate((core) => {
    const teamsNext = core.teams.map((t) =>
      t.id === id ? { ...t, archivedAt: null, updatedAt: nowIso() } : t,
    );
    const updated = teamsNext.find((t) => t.id === id);
    return {
      ...core,
      teams: teamsNext,
      outbox: updated ? queue(core, "team", id, updated) : core.outbox,
    };
  });
}

/** Permanently remove a team, its roster, its games and every game log. */
export function deleteTeam(id: string): void {
  const doomed = getCore().games.filter((g) => g.teamId === id);
  mutate((core) => ({
    ...core,
    teams: core.teams.filter((t) => t.id !== id),
    players: core.players.filter((p) => p.teamId !== id),
    games: core.games.filter((g) => g.teamId !== id),
    outbox: queue(core, "team_delete", id, { id }),
  }));
  for (const g of doomed) removeKey(logKey(g.id));
}

// --- Players ---------------------------------------------------------------

export interface PlayerInput {
  firstName: string;
  lastName: string;
  jerseyNumber: string;
  position: string;
}

export function createPlayer(teamId: string, input: PlayerInput): Player {
  const p: Player = {
    id: newId(),
    ownerId,
    teamId,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    jerseyNumber: input.jerseyNumber.trim(),
    position: input.position.trim() || null,
    active: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  mutate((core) => ({
    ...core,
    players: [...core.players, p],
    outbox: queue(core, "player", p.id, p),
  }));
  return p;
}

export function updatePlayer(
  id: string,
  input: Partial<PlayerInput> & { active?: boolean },
): void {
  mutate((core) => {
    const next = core.players.map((p) =>
      p.id === id
        ? {
            ...p,
            ...(input.firstName === undefined
              ? {}
              : { firstName: input.firstName.trim() }),
            ...(input.lastName === undefined
              ? {}
              : { lastName: input.lastName.trim() }),
            ...(input.jerseyNumber === undefined
              ? {}
              : { jerseyNumber: input.jerseyNumber.trim() }),
            ...(input.position === undefined
              ? {}
              : { position: input.position.trim() || null }),
            ...(input.active === undefined ? {} : { active: input.active }),
            updatedAt: nowIso(),
          }
        : p,
    );
    const updated = next.find((p) => p.id === id);
    return {
      ...core,
      players: next,
      outbox: updated ? queue(core, "player", id, updated) : core.outbox,
    };
  });
}

/**
 * Remove an athlete from the roster.
 *
 * Only ever permitted when they have never appeared in a game. An athlete with
 * minutes behind them is deactivated instead: a child who left the team in
 * October still played those games in September, and the report of a game must
 * not change because a roster did.
 */
export function canDeletePlayer(id: string): boolean {
  return !getCore().games.some((g) =>
    gameLog(g.id).some(
      (e) => (e.type === "player_in" || e.type === "player_out") && e.playerId === id,
    ),
  );
}

export function deletePlayer(id: string): void {
  mutate((core) => ({
    ...core,
    players: core.players.filter((p) => p.id !== id),
    games: core.games.map((g) => ({
      ...g,
      rosterPlayerIds: g.rosterPlayerIds.filter((pid) => pid !== id),
    })),
    outbox: queue(core, "player_delete", id, { id }),
  }));
}

// --- Games -----------------------------------------------------------------

export interface GameInput {
  teamId: string;
  opponent: string;
  gameDate: string;
  periodCount: number;
  periodSeconds: number;
  minimum: MinimumTarget;
  rosterPlayerIds: readonly string[];
}

export function createGame(input: GameInput): Game {
  const g: Game = {
    id: newId(),
    ownerId,
    teamId: input.teamId,
    opponent: input.opponent.trim(),
    gameDate: input.gameDate,
    periodCount: input.periodCount,
    periodSeconds: input.periodSeconds,
    minimum: input.minimum,
    rosterPlayerIds: [...input.rosterPlayerIds],
    score: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  mutate((core) => ({
    ...core,
    games: [...core.games, g],
    outbox: queue(core, "game", g.id, g),
  }));
  return g;
}

export function setScore(
  gameId: string,
  score: { us: number; them: number } | null,
): void {
  mutate((core) => {
    const next = core.games.map((g) =>
      g.id === gameId ? { ...g, score, updatedAt: nowIso() } : g,
    );
    return {
      ...core,
      games: next,
      outbox: queue(core, "game_score", gameId, { id: gameId, score }),
    };
  });
}

export function deleteGame(gameId: string): void {
  mutate((core) => ({
    ...core,
    games: core.games.filter((g) => g.id !== gameId),
    outbox: queue(core, "game_delete", gameId, { id: gameId }),
  }));
  removeKey(logKey(gameId));
}

// --- The event log ---------------------------------------------------------

export type EventDraft =
  | { type: "game_started" }
  | { type: "game_ended" }
  | { type: "clock_paused" }
  | { type: "clock_resumed" }
  | { type: "period_started"; period: number }
  | { type: "period_ended"; period: number }
  | { type: "player_in"; playerId: string }
  | { type: "player_out"; playerId: string };

/**
 * Record one tap.
 *
 * The order here is the whole offline story, and it is deliberate:
 *
 *   1. mint an id and stamp the instant,
 *   2. write it to the device,
 *   3. queue it for the server.
 *
 * Step 3 can fail forever and the game is still complete and correct. Nothing
 * here is awaited, so the screen updates in the same frame as the tap -- which
 * matters when a coach is looking at the field, not the phone.
 */
export function recordEvent(gameId: string, draft: EventDraft): GameEvent {
  const existing = gameLog(gameId);
  const event: GameEvent = {
    ...draft,
    id: newId(),
    gameId,
    at: nowIso(),
    seq: existing.length,
  };

  writeJson(logKey(gameId), normalizeLog([...existing, event]));
  mutate((core) => ({ ...core, outbox: queue(core, "game_event", event.id, event) }));
  return event;
}

/** Merge events that came from the server into the local log. */
export function mergeIntoLog(gameId: string, incoming: readonly GameEvent[]): void {
  const merged = normalizeLog([...gameLog(gameId), ...incoming]);
  writeJson(logKey(gameId), merged);
  notify();
}

// --- Sync bookkeeping ------------------------------------------------------

export function recordSyncSuccess(ids: readonly string[]): void {
  mutate((core) => ({
    ...core,
    outbox: markSynced(core.outbox, ids),
    lastSyncError: null,
    lastSyncedAt: nowIso(),
  }));
}

export function recordSyncFailure(id: string, error: string): void {
  mutate((core) => ({
    ...core,
    outbox: markFailed(core.outbox, id, error, Date.now()),
    lastSyncError: error,
  }));
}

// --- Wiping the device -----------------------------------------------------

/** Remove every trace of this app's data from this device. */
export function wipeDevice(): void {
  for (const key of ownedKeys()) removeKey(key);
  cache = null;
  notify();
}
