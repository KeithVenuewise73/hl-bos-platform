import { describe, expect, it } from "vitest";

import { filterSince, isSinceChoice, sinceCutoff } from "./since";

const days = ["2017-05-01", "2026-08-01", "2026-09-15", "2026-11-20"].map((day) => ({
  day,
}));

describe("show dates from", () => {
  const now = new Date(2026, 10, 23, 15, 0); // 23 Nov 2026
  it("counts back from today on this computer's calendar", () => {
    expect(sinceCutoff("90", now)).toBe("2026-08-25");
    expect(sinceCutoff("30", now)).toBe("2026-10-24");
    expect(sinceCutoff("365", now)).toBe("2025-11-23");
    expect(sinceCutoff("all", now)).toBeNull();
  });
  it("keeps the cutoff day itself and everything after", () => {
    expect(filterSince(days, "2026-09-15").map((d) => d.day)).toEqual([
      "2026-09-15",
      "2026-11-20",
    ]);
    expect(filterSince(days, sinceCutoff("90", now)).map((d) => d.day)).toEqual([
      "2026-09-15",
      "2026-11-20",
    ]);
  });
  it("shows everything for all dates", () => {
    expect(filterSince(days, null)).toHaveLength(4);
  });
  it("only accepts the listed choices", () => {
    expect(isSinceChoice("60")).toBe(true);
    expect(isSinceChoice("7")).toBe(false);
    expect(isSinceChoice(null)).toBe(false);
  });
});
