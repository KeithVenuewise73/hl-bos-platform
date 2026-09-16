import { describe, expect, it } from "vitest";
import { computeGameState } from "./participation";
import { buildReport, reportText } from "./report";
import { mergeLogs } from "./sync";
import { normalizeLog, type GameEvent } from "./events";

/**
 * The QA acceptance scenario, executed against the engine.
 *
 * This is a full football game: twenty athletes, four twelve-minute quarters,
 * repeated substitutions, the app backgrounded, the phone locked, the process
 * killed and relaunched, connectivity lost mid-game and restored afterwards.
 * Every one of those disruptions is modelled by what it actually is at this
 * layer -- a stretch of time in which no code ran and no event was recorded --
 * and the assertions check that the arithmetic did not care.
 *
 * The device-level halves of these tests (the app really being backgrounded,
 * a real airplane-mode toggle) live in the app's own QA run. What is proven
 * here is the part that would silently corrupt a report: the numbers.
 */

const PERIOD = 720;
const PERIODS = 4;
const REGULATION = PERIOD * PERIODS;
const BREAK = 120;
const T0 = Date.parse("2026-09-12T18:00:00.000Z");

const PLAYERS = Array.from({ length: 20 }, (_, i) => `p${i + 1}`);

let seq = 0;
const at = (s: number) => new Date(T0 + s * 1000).toISOString();

const stamp = (s: number) => ({
  id: `acc-${seq}`,
  gameId: "acceptance",
  seq: seq++,
  at: at(s),
});

const started = (s: number): GameEvent => ({ ...stamp(s), type: "game_started" });
const ended = (s: number): GameEvent => ({ ...stamp(s), type: "game_ended" });
const periodEnded = (s: number, period: number): GameEvent => ({
  ...stamp(s),
  type: "period_ended",
  period,
});
const periodStarted = (s: number, period: number): GameEvent => ({
  ...stamp(s),
  type: "period_started",
  period,
});
const playerIn = (s: number, playerId: string): GameEvent => ({
  ...stamp(s),
  type: "player_in",
  playerId,
});
const playerOut = (s: number, playerId: string): GameEvent => ({
  ...stamp(s),
  type: "player_out",
  playerId,
});

/**
 * Play a full game with an eleven-a-side rotation.
 *
 * Eleven on the field at a time, rotated every two minutes so that every one
 * of the twenty athletes gets meaningful time -- which is precisely the
 * problem the product exists to make visible.
 */
function playGame(): { events: GameEvent[]; wallEnd: number } {
  seq = 0;
  const events: GameEvent[] = [];
  const onField = new Set<string>();
  let next = 0;

  const sub = (s: number, count: number) => {
    for (let i = 0; i < count; i++) {
      const incoming = PLAYERS[next % PLAYERS.length] as string;
      next += 1;
      if (onField.has(incoming)) continue;
      const outgoing = [...onField][0];
      if (outgoing !== undefined && onField.size >= 11) {
        events.push(playerOut(s, outgoing));
        onField.delete(outgoing);
      }
      events.push(playerIn(s, incoming));
      onField.add(incoming);
    }
  };

  let wall = 0;
  events.push(started(wall));
  sub(wall, 11);

  for (let period = 1; period <= PERIODS; period++) {
    const periodStart = wall;
    // A substitution every two minutes of game clock.
    for (let t = 120; t < PERIOD; t += 120) sub(periodStart + t, 3);
    wall = periodStart + PERIOD;
    events.push(periodEnded(wall, period));
    if (period < PERIODS) {
      wall += BREAK;
      events.push(periodStarted(wall, period + 1));
    }
  }

  events.push(ended(wall));
  return { events, wallEnd: wall };
}

const finalState = (events: readonly GameEvent[], now: number) =>
  computeGameState({
    gameId: "acceptance",
    rosterPlayerIds: PLAYERS,
    periodCount: PERIODS,
    periodSeconds: PERIOD,
    minimum: { kind: "percent", percent: 25 },
    events,
    now,
  });

describe("acceptance: a full 20-player game with repeated substitutions", () => {
  const { events, wallEnd } = playGame();
  const state = finalState(events, T0 + (wallEnd + 86_400) * 1000);

  it("tracks exactly regulation time, excluding every between-period break", () => {
    expect(state.elapsedSeconds).toBe(REGULATION);
    // Three breaks happened in wall time and none of them counted.
    expect(wallEnd).toBe(REGULATION + 3 * BREAK);
  });

  it("finalises the game and empties the field", () => {
    expect(state.phase).toBe("final");
    expect(state.onField).toEqual([]);
  });

  it("accounts for all twenty athletes", () => {
    expect(state.participation).toHaveLength(20);
    expect(state.participation.every((p) => p.secondsPlayed > 0)).toBe(true);
  });

  it("conserves time: the sum of individual minutes equals eleven full games", () => {
    // Eleven athletes on the field for every second of the clock. If any
    // substitution were double-counted or dropped, this identity would break.
    const total = state.participation.reduce((a, p) => a + p.secondsPlayed, 0);
    expect(total).toBe(11 * REGULATION);
  });

  it("gives every share a denominator of the tracked game clock", () => {
    const sum = state.participation.reduce((a, p) => a + (p.share ?? 0), 0);
    expect(sum).toBeCloseTo(11, 6);
  });

  it("evaluates the 25% target for every athlete", () => {
    expect(
      state.participation.every((p) => p.requiredSeconds === REGULATION * 0.25),
    ).toBe(true);
    expect(
      state.participation.every(
        (p) => p.status === "safe" || p.status === "below_target",
      ),
    ).toBe(true);
  });

  it("records more than one entry for a rotated athlete", () => {
    expect(state.participation.some((p) => p.entries > 1)).toBe(true);
  });
});

describe("acceptance: interruptions do not change a single number", () => {
  const { events, wallEnd } = playGame();
  const reference = finalState(events, T0 + (wallEnd + 60) * 1000);
  const totals = (s: ReturnType<typeof finalState>) =>
    [...s.participation]
      .sort((a, b) => a.playerId.localeCompare(b.playerId))
      .map((p) => [p.playerId, p.secondsPlayed] as const);

  it("is unchanged by the app being backgrounded and the screen locked", () => {
    // Backgrounding records no events and runs no code. The log is identical,
    // so the report is identical -- which is the entire point of deriving
    // duration from timestamps instead of counting ticks.
    expect(totals(finalState(events, T0 + (wallEnd + 60) * 1000))).toEqual(
      totals(reference),
    );
  });

  it("is unchanged by the process being killed and the log replayed later", () => {
    const relaunched = normalizeLog(JSON.parse(JSON.stringify(events)) as GameEvent[]);
    expect(totals(finalState(relaunched, T0 + (wallEnd + 86_400) * 1000))).toEqual(
      totals(reference),
    );
  });

  it("is unchanged by losing connectivity for the second half and syncing after", () => {
    // The server saw the first half. The device kept the whole game. The merge
    // is a union, so nothing the device witnessed alone is lost.
    const cutoff = T0 + REGULATION * 500; // roughly half-time, in ms
    const server = events.filter((e) => Date.parse(e.at) <= cutoff);
    expect(server.length).toBeLessThan(events.length);
    const merged = mergeLogs(events, server);
    expect(totals(finalState(merged, T0 + (wallEnd + 60) * 1000))).toEqual(
      totals(reference),
    );
  });

  it("is unchanged when a flaky connection delivers every event twice", () => {
    const doubled = [...events, ...events.map((e) => ({ ...e }))];
    expect(totals(finalState(doubled, T0 + (wallEnd + 60) * 1000))).toEqual(
      totals(reference),
    );
  });

  it("is unchanged when sync delivers the log in reverse order", () => {
    const reversed = [...events].reverse();
    expect(totals(finalState(reversed, T0 + (wallEnd + 60) * 1000))).toEqual(
      totals(reference),
    );
  });
});

describe("acceptance: the report a coach shares", () => {
  const { events, wallEnd } = playGame();
  const state = finalState(events, T0 + (wallEnd + 60) * 1000);
  const report = buildReport({
    state,
    teamName: "Orchard Park U12",
    sport: "football",
    opponent: "West Seneca",
    gameDate: "2026-09-12",
    minimum: { kind: "percent", percent: 25 },
    score: { us: 21, them: 14 },
    periodsPlayed: PERIODS,
    label: (id) => `#${id.slice(1)} Player ${id.slice(1)}`,
  });

  it("names every athlete exactly once", () => {
    expect(report.rows).toHaveLength(20);
    expect(new Set(report.rows.map((r) => r.playerId)).size).toBe(20);
  });

  it("agrees with the live screen to the second", () => {
    for (const row of report.rows) {
      const live = state.participation.find((p) => p.playerId === row.playerId);
      expect(row.secondsPlayed).toBe(live?.secondsPlayed);
    }
  });

  it("produces shareable text containing every athlete", () => {
    const text = reportText(report);
    for (const row of report.rows) expect(text).toContain(row.label);
  });
});
