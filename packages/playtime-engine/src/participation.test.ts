import { beforeEach, describe, expect, it } from "vitest";
import { classify, computeGameState, requiredSecondsFor } from "./participation";
import type { GameEvent } from "./events";
import type { MinimumTarget } from "./types";
import {
  end,
  endPeriod,
  log,
  now,
  pause,
  playerIn,
  playerOut,
  resetSeq,
  resume,
  start,
  startPeriod,
} from "./test-support";

beforeEach(resetSeq);

const FOUR_TWELVES = { periodCount: 4, periodSeconds: 720 };

function state(
  events: readonly GameEvent[],
  atSeconds: number,
  opts: { roster?: string[]; minimum?: MinimumTarget } = {},
) {
  return computeGameState({
    gameId: "g",
    rosterPlayerIds: opts.roster ?? ["p1", "p2", "p3"],
    ...FOUR_TWELVES,
    minimum: opts.minimum ?? { kind: "none" },
    events,
    now: now(atSeconds),
  });
}

const timeOf = (s: ReturnType<typeof state>, id: string): number =>
  s.participation.find((p) => p.playerId === id)?.secondsPlayed ?? -1;

describe("computeGameState", () => {
  it("shows every rostered athlete before the game starts, at zero", () => {
    const s = state([], 0);
    expect(s.phase).toBe("scheduled");
    expect(s.participation).toHaveLength(3);
    expect(s.participation.every((p) => p.secondsPlayed === 0)).toBe(true);
    // Not 0%: nobody has played because no game has happened.
    expect(s.participation.every((p) => p.share === null)).toBe(true);
  });

  it("counts a single completed session", () => {
    const s = state(log("g", [start(0), playerIn(0, "p1"), playerOut(258, "p1")]), 300);
    // 4:18, the example from the brief.
    expect(timeOf(s, "p1")).toBe(258);
    expect(s.participation.find((p) => p.playerId === "p1")?.entries).toBe(1);
  });

  it("adds a second session to the same athlete's total", () => {
    const s = state(
      log("g", [
        start(0),
        playerIn(0, "p1"),
        playerOut(258, "p1"),
        playerIn(400, "p1"),
        playerOut(581, "p1"),
      ]),
      600,
    );
    expect(timeOf(s, "p1")).toBe(258 + 181);
    expect(s.participation.find((p) => p.playerId === "p1")?.entries).toBe(2);
  });

  it("keeps counting an athlete who is still on the field", () => {
    const s = state(log("g", [start(0), playerIn(60, "p1")]), 300);
    expect(timeOf(s, "p1")).toBe(240);
    expect(s.onField).toEqual(["p1"]);
  });

  it("does not count time while the clock is stopped", () => {
    // On the field the whole time, but the clock was paused for five minutes.
    const s = state(log("g", [start(0), playerIn(0, "p1"), pause(100), resume(400)]), 500);
    expect(timeOf(s, "p1")).toBe(200);
    expect(s.elapsedSeconds).toBe(200);
  });

  it("does not count halftime for an athlete left on the field", () => {
    const s = state(
      log("g", [start(0), playerIn(0, "p1"), endPeriod(720, 1), startPeriod(1500, 2)]),
      1800,
    );
    expect(timeOf(s, "p1")).toBe(1020);
  });

  it("survives the app being backgrounded with no code running", () => {
    // No events between second 60 and second 900. Nothing ticked. The athlete
    // still played fourteen minutes, because the time is derived on demand.
    const s = state(log("g", [start(0), playerIn(60, "p1")]), 900);
    expect(timeOf(s, "p1")).toBe(840);
  });

  it("produces the identical answer when the same log is replayed later", () => {
    // Close the app, reopen it, replay from storage: same numbers, no drift.
    const events = log("g", [start(0), playerIn(0, "p1"), playerOut(600, "p1"), end(720)]);
    expect(timeOf(state(events, 720), "p1")).toBe(timeOf(state(events, 50_000), "p1"));
  });

  it("checks an athlete out at the final whistle rather than counting forever", () => {
    const s = state(log("g", [start(0), playerIn(0, "p1"), end(600)]), 9_999);
    expect(timeOf(s, "p1")).toBe(600);
    expect(s.onField).toEqual([]);
    expect(s.phase).toBe("final");
  });

  it("ignores a duplicated player_in rather than opening a second session", () => {
    // The single most dangerous duplicate: two concurrent sessions would make
    // an athlete's minutes count twice.
    const base = log("g", [start(0), playerIn(0, "p1")]);
    const duplicate: GameEvent = { ...(base[1] as GameEvent), id: "different-id", seq: 99 };
    const s = state([...base, duplicate], 600);
    expect(timeOf(s, "p1")).toBe(600);
    expect(s.participation.find((p) => p.playerId === "p1")?.entries).toBe(1);
  });

  it("is a no-op when the exact same event is delivered twice", () => {
    const events = log("g", [start(0), playerIn(0, "p1"), playerOut(300, "p1")]);
    expect(timeOf(state([...events, ...events], 600), "p1")).toBe(300);
  });

  it("ignores a player_out for an athlete who is not on the field", () => {
    const s = state(log("g", [start(0), playerOut(100, "p1"), playerIn(200, "p1")]), 400);
    expect(timeOf(s, "p1")).toBe(200);
  });

  it("tracks several athletes independently", () => {
    const s = state(
      log("g", [
        start(0),
        playerIn(0, "p1"),
        playerIn(0, "p2"),
        playerOut(120, "p2"),
        playerIn(120, "p3"),
      ]),
      300,
    );
    expect(timeOf(s, "p1")).toBe(300);
    expect(timeOf(s, "p2")).toBe(120);
    expect(timeOf(s, "p3")).toBe(180);
    expect([...s.onField].sort()).toEqual(["p1", "p3"]);
  });

  it("reports participation share against the elapsed game clock", () => {
    const s = state(log("g", [start(0), playerIn(0, "p1"), playerOut(300, "p1")]), 600);
    expect(s.participation.find((p) => p.playerId === "p1")?.share).toBeCloseTo(0.5, 6);
  });

  it("records the period a session belongs to", () => {
    const s = state(
      log("g", [
        start(0),
        endPeriod(720, 1),
        startPeriod(900, 2),
        playerIn(960, "p1"),
        playerOut(1200, "p1"),
      ]),
      1200,
    );
    const sessions = s.participation.find((p) => p.playerId === "p1")?.sessions ?? [];
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.periodNumber).toBe(2);
  });

  it("still reports an athlete who has been taken off the roster since", () => {
    const s = state(log("g", [start(0), playerIn(0, "gone"), playerOut(300, "gone")]), 600, {
      roster: ["p1"],
    });
    expect(timeOf(s, "gone")).toBe(300);
  });

  it("tracks period elapsed separately from game elapsed", () => {
    const s = state(log("g", [start(0), endPeriod(720, 1), startPeriod(900, 2)]), 1200);
    expect(s.elapsedSeconds).toBe(1020);
    expect(s.periodElapsedSeconds).toBe(300);
    expect(s.currentPeriod).toBe(2);
  });
});

describe("requiredSecondsFor", () => {
  it("resolves a percentage against regulation time", () => {
    expect(requiredSecondsFor({ kind: "percent", percent: 25 }, 2880)).toBe(720);
  });
  it("passes an absolute target through", () => {
    expect(requiredSecondsFor({ kind: "seconds", seconds: 600 }, 2880)).toBe(600);
  });
  it("returns null when no target is configured", () => {
    expect(requiredSecondsFor({ kind: "none" }, 2880)).toBeNull();
  });
});

describe("classify", () => {
  const base = { requiredSeconds: 720, regulationSeconds: 2880, remainingSeconds: 2880 };

  it("says nothing when no target is set", () => {
    expect(classify({ ...base, requiredSeconds: null, secondsPlayed: 0, elapsedSeconds: 0 }))
      .toBe("no_target");
  });

  it("is safe once the target is met", () => {
    expect(classify({ ...base, secondsPlayed: 720, elapsedSeconds: 1000 })).toBe("safe");
  });

  it("is safe while on pace, before the target is met", () => {
    // Half the game gone, half the requirement banked.
    expect(
      classify({ ...base, secondsPlayed: 360, elapsedSeconds: 1440, remainingSeconds: 1440 }),
    ).toBe("safe");
  });

  it("is at risk when behind the pace but still able to get there", () => {
    expect(
      classify({ ...base, secondsPlayed: 60, elapsedSeconds: 1440, remainingSeconds: 1440 }),
    ).toBe("at_risk");
  });

  it("is below target once the arithmetic rules it out", () => {
    expect(
      classify({ ...base, secondsPlayed: 100, elapsedSeconds: 2400, remainingSeconds: 480 }),
    ).toBe("below_target");
  });

  it("is below target at the final whistle when unmet", () => {
    expect(
      classify({ ...base, secondsPlayed: 719, elapsedSeconds: 2880, remainingSeconds: 0 }),
    ).toBe("below_target");
  });
});
