import { beforeEach, describe, expect, it } from "vitest";
import { compareEvents, normalizeLog, parseEvent, parseLog } from "./events";
import { log, playerIn, resetSeq, start } from "./test-support";

beforeEach(resetSeq);

describe("parseEvent", () => {
  it("accepts a well-formed event", () => {
    const e = log("g", [playerIn(0, "p1")])[0]!;
    expect(parseEvent(e)).toEqual(e);
  });

  it("rejects an unknown event type", () => {
    expect(() =>
      parseEvent({
        id: "1",
        gameId: "g",
        at: new Date().toISOString(),
        seq: 0,
        type: "nope",
      }),
    ).toThrow();
  });

  it("rejects a timestamp that is not a date", () => {
    expect(() =>
      parseEvent({
        id: "1",
        gameId: "g",
        at: "sometime tuesday",
        seq: 0,
        type: "game_started",
      }),
    ).toThrow();
  });

  it("rejects a player event with no player", () => {
    expect(() =>
      parseEvent({
        id: "1",
        gameId: "g",
        at: new Date().toISOString(),
        seq: 0,
        type: "player_in",
      }),
    ).toThrow();
  });
});

describe("parseLog", () => {
  it("keeps the valid records and reports how many it dropped", () => {
    const good = log("g", [start(0), playerIn(10, "p1")]);
    const result = parseLog([...good, { id: "x", nonsense: true }]);
    expect(result.events).toHaveLength(2);
    expect(result.dropped).toBe(1);
  });

  it("returns an empty log for input that is not a list", () => {
    expect(parseLog("corrupt")).toEqual({ events: [], dropped: 0 });
  });
});

describe("normalizeLog", () => {
  it("drops duplicate ids", () => {
    const events = log("g", [start(0), playerIn(10, "p1")]);
    expect(normalizeLog([...events, ...events])).toHaveLength(2);
  });

  it("orders by timestamp", () => {
    const events = log("g", [playerIn(50, "p1"), start(0)]);
    expect(normalizeLog(events).map((e) => e.type)).toEqual([
      "game_started",
      "player_in",
    ]);
  });

  it("is a total order, so two devices sort the same log identically", () => {
    const a = log("g", [start(0)])[0]!;
    const b = { ...a, id: "zzz" };
    const c = { ...a, id: "aaa" };
    expect(compareEvents(b, c)).toBeGreaterThan(0);
    expect(compareEvents(c, b)).toBeLessThan(0);
    expect(compareEvents(b, b)).toBe(0);
  });
});
