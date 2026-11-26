import { describe, expect, it } from "vitest";

import { choiceQuestion, gameLine, holds } from "./game-choice.ts";

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
