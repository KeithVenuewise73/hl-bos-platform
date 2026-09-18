import { describe, expect, it } from "vitest";

import {
  JERSEY_COLORS,
  colorReliability,
  confusableWith,
  findJerseyColor,
  isLikelyOcrConfusion,
  jerseyColorLabel,
  jerseyNumbersMatch,
  normaliseJerseyNumber,
} from "./jersey.ts";

describe("jersey numbers", () => {
  it("reads a leading zero the way a person in the rink would", () => {
    expect(normaliseJerseyNumber("07")).toBe("7");
    expect(jerseyNumbersMatch("07", "7")).toBe(true);
    expect(jerseyNumbersMatch("7", "07")).toBe(true);
  });

  it("keeps number zero rather than collapsing it to nothing", () => {
    expect(normaliseJerseyNumber("00")).toBe("0");
    expect(jerseyNumbersMatch("00", "0")).toBe(true);
  });

  it("strips the punctuation OCR adds without changing the number", () => {
    expect(normaliseJerseyNumber(" 7. ")).toBe("7");
    expect(normaliseJerseyNumber("#17")).toBe("17");
  });

  it("does not match an empty read against anything", () => {
    expect(jerseyNumbersMatch("", "7")).toBe(false);
    expect(jerseyNumbersMatch("abc", "7")).toBe(false);
  });

  it("tells a one-digit OCR slip from a different player", () => {
    expect(isLikelyOcrConfusion("11", "17")).toBe(true);
    expect(isLikelyOcrConfusion("58", "56")).toBe(true);
    expect(isLikelyOcrConfusion("23", "17")).toBe(false);
  });

  it("does not call a two-digit difference a slip", () => {
    expect(isLikelyOcrConfusion("18", "57")).toBe(false);
  });

  it("does not treat a different-length read as a slip", () => {
    expect(isLikelyOcrConfusion("7", "17")).toBe(false);
  });
});

describe("jersey colours", () => {
  it("has a unique id and a label for every colour", () => {
    const ids = JERSEY_COLORS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const colour of JERSEY_COLORS) {
      expect(colour.label.length).toBeGreaterThan(0);
      expect(colour.swatch).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("gives red two hue windows because it wraps around the seam", () => {
    expect(findJerseyColor("red")?.hueRanges).toHaveLength(2);
  });

  it("separates navy from blue by darkness, not by hue", () => {
    const navy = findJerseyColor("navy");
    const blue = findJerseyColor("blue");
    expect(navy?.maxValue).toBeLessThan(blue?.maxValue ?? 0);
  });

  it("marks colours with no meaningful hue as achromatic", () => {
    expect(findJerseyColor("white")?.achromatic).toBe(true);
    expect(findJerseyColor("black")?.achromatic).toBe(true);
    expect(findJerseyColor("red")?.achromatic).toBe(false);
  });

  it("trusts a colour with look-alikes less than one without", () => {
    expect(colorReliability("green")).toBeGreaterThan(colorReliability("navy"));
    expect(confusableWith("navy")).toContain("black");
  });

  it("never trusts a colour completely", () => {
    for (const colour of JERSEY_COLORS) {
      expect(colorReliability(colour.id)).toBeLessThan(1);
      expect(colorReliability(colour.id)).toBeGreaterThan(0);
    }
  });

  it("falls back to the raw id rather than showing nothing for an unknown colour", () => {
    expect(jerseyColorLabel("chartreuse")).toBe("chartreuse");
    expect(colorReliability("chartreuse")).toBeGreaterThan(0);
  });
});
