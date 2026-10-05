import { describe, expect, it } from "vitest";

import { dateMatches, isEmptySearch, parseSearch } from "./search.ts";

describe("parseSearch", () => {
  it("reads 24 and #24 as a jersey number", () => {
    expect(parseSearch("24").numbers).toEqual(["24"]);
    expect(parseSearch("#24").numbers).toEqual(["24"]);
  });
  it("reads a name as text", () => {
    expect(parseSearch("Dominic Herman")).toEqual({
      numbers: [],
      dates: [],
      terms: ["dominic", "herman"],
    });
  });
  it("reads 'October 3' as a day, not jersey #3", () => {
    expect(parseSearch("October 3")).toEqual({
      numbers: [],
      dates: [{ month: 10, day: 3, year: null }],
      terms: [],
    });
  });
  it("reads 'Oct 3, 2026' and 'Oct 3rd'", () => {
    expect(parseSearch("Oct 3, 2026").dates).toEqual([
      { month: 10, day: 3, year: 2026 },
    ]);
    expect(parseSearch("oct 3rd").dates).toEqual([{ month: 10, day: 3, year: null }]);
  });
  it("reads a month alone", () => {
    expect(parseSearch("September").dates).toEqual([
      { month: 9, day: null, year: null },
    ]);
  });
  it("reads numeric dates", () => {
    expect(parseSearch("2026-10-03").dates).toEqual([
      { month: 10, day: 3, year: 2026 },
    ]);
    expect(parseSearch("10/3/26").dates).toEqual([{ month: 10, day: 3, year: 2026 }]);
    expect(parseSearch("10/3").dates).toEqual([{ month: 10, day: 3, year: null }]);
  });
  it("combines pieces", () => {
    expect(parseSearch("#24 West Seneca october 3")).toEqual({
      numbers: ["24"],
      dates: [{ month: 10, day: 3, year: null }],
      terms: ["west", "seneca"],
    });
  });
  it("treats three digits and years as text", () => {
    expect(parseSearch("2026").terms).toEqual(["2026"]);
    expect(parseSearch("100").terms).toEqual(["100"]);
  });
  it("knows an empty search", () => {
    expect(isEmptySearch(parseSearch("   "))).toBe(true);
  });
});

describe("dateMatches", () => {
  it("matches any year when none is given", () => {
    expect(dateMatches("2025-10-03", { month: 10, day: 3, year: null })).toBe(true);
    expect(dateMatches("2026-10-04", { month: 10, day: 3, year: null })).toBe(false);
    expect(dateMatches("2026-10-04", { month: 10, day: null, year: 2026 })).toBe(true);
    expect(dateMatches("not a date", { month: 10, day: null, year: null })).toBe(false);
  });
});
