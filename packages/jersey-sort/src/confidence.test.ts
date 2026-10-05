import { describe, expect, it } from "vitest";

import { bandFor, formatConfidence, validateThresholds } from "./confidence.ts";

describe("bandFor (defaults 85 / 60)", () => {
  it.each([
    [0.94, "high"],
    [0.85, "high"],
    [0.849, "medium"],
    [0.6, "medium"],
    [0.599, "low"],
    [0, "low"],
  ])("%s is %s", (c, band) => {
    expect(bandFor(c)).toBe(band);
  });

  it("follows configured thresholds", () => {
    expect(bandFor(0.8, { high: 0.75, medium: 0.5 })).toBe("high");
    expect(bandFor(0.8, { high: 0.95, medium: 0.9 })).toBe("low");
  });
});

describe("validateThresholds", () => {
  it("accepts the defaults", () => {
    expect(validateThresholds({ high: 0.85, medium: 0.6 })).toBeNull();
  });
  it.each([
    [{ high: 0.6, medium: 0.6 }, "lower"],
    [{ high: 0.5, medium: 0.7 }, "lower"],
    [{ high: 1.2, medium: 0.6 }, "100%"],
    [{ high: 0.8, medium: 0 }, "above 0%"],
    [{ high: Number.NaN, medium: 0.5 }, "numbers"],
  ])("refuses %j", (t, message) => {
    expect(validateThresholds(t)).toContain(message);
  });
});

it("formats as a whole percent", () => {
  expect(formatConfidence(0.914)).toBe("91%");
});
