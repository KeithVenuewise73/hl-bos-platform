import { describe, expect, it } from "vitest";

import { choiceQuestion, gameLine, holds, timeSpan } from "./game-choice.ts";

const g = (over: Partial<Parameters<typeof holds>[0]> = {}) => ({
  name: "West Seneca Volleyball Semi-Finals",
  sport: "Volleyball",
  team: null,
  photos: 850,
  clips: 6,
  ...over,
});

describe("holds", () => {
  it("says photos and clips, only what is there", () => {
    expect(holds(g())).toBe("850 photos and 6 clips");
    expect(holds(g({ photos: 0 }))).toBe("6 clips");
    expect(holds(g({ clips: 0, photos: 1 }))).toBe("1 photo");
    expect(holds(g({ photos: 0, clips: 0 }))).toBe("nothing yet");
  });
});

describe("gameLine and the question", () => {
  it("names the game, its team and what it holds", () => {
    expect(gameLine(g({ team: "West Seneca West" }))).toBe(
      "West Seneca Volleyball Semi-Finals (West Seneca West) — 850 photos and 6 clips",
    );
  });
  it("asks about one game or several", () => {
    expect(choiceQuestion("2026-11-07", "volleyball", [g()])).toMatch(
      /already has a game on 2026-11-07/,
    );
    expect(choiceQuestion("2026-11-07", "volleyball", [g(), g()])).toMatch(
      /already has 2 games/,
    );
  });
});

describe("timeSpan", () => {
  it("says the span in 12-hour time, with AM or PM once when both are alike", () => {
    expect(timeSpan("14:43", "15:25")).toBe("2:43 to 3:25 PM");
    expect(timeSpan("02:43", "03:25")).toBe("2:43 to 3:25 AM");
  });
  it("says both when the span crosses noon or midnight", () => {
    expect(timeSpan("11:50", "13:10")).toBe("11:50 AM to 1:10 PM");
    expect(timeSpan("23:30", "00:20")).toBe("11:30 PM to 12:20 AM");
  });
  it("says nothing when a game has no times", () => {
    expect(timeSpan(null, null)).toBe("");
    expect(timeSpan("nope", "15:25")).toBe("");
  });
  it("is part of the line for a game", () => {
    expect(gameLine(g({ firstAt: "14:43", lastAt: "15:25" }))).toBe(
      "West Seneca Volleyball Semi-Finals — 850 photos and 6 clips, taken 2:43 to 3:25 PM",
    );
  });
});
