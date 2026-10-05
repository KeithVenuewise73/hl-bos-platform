import { describe, expect, it } from "vitest";

import {
  compareJerseyNumbers,
  isCanonicalJerseyNumber,
  normalizeJerseyNumber,
} from "./numbers.ts";

describe("normalizeJerseyNumber", () => {
  it.each([
    ["24", "24"],
    ["#24", "24"],
    [" # 24 ", "24"],
    ["No. 7", "7"],
    ["07", "7"],
    ["0", "0"],
    ["00", "00"],
    ["99", "99"],
  ])("%s -> %s", (raw, expected) => {
    expect(normalizeJerseyNumber(raw)).toBe(expected);
  });

  it.each(["100", "1421", "", "#", "A1", "2.5", "-3"])("refuses %j", (raw) => {
    expect(normalizeJerseyNumber(raw)).toBeNull();
  });

  it("keeps 0 and 00 apart: they are different jerseys", () => {
    expect(normalizeJerseyNumber("0")).not.toBe(normalizeJerseyNumber("00"));
  });
});

describe("isCanonicalJerseyNumber", () => {
  it("accepts only the stored spelling", () => {
    expect(isCanonicalJerseyNumber("7")).toBe(true);
    expect(isCanonicalJerseyNumber("00")).toBe(true);
    expect(isCanonicalJerseyNumber("07")).toBe(false);
    expect(isCanonicalJerseyNumber("#7")).toBe(false);
  });
});

describe("compareJerseyNumbers", () => {
  it("sorts numerically with 0 before 00", () => {
    expect(["24", "00", "7", "0", "18"].sort(compareJerseyNumbers)).toEqual([
      "0",
      "00",
      "7",
      "18",
      "24",
    ]);
  });
});
