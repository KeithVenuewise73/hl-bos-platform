import { describe, expect, it } from "vitest";
import {
  COLOR_REFERENCE,
  assignTeam,
  chroma,
  classifyJerseyColor,
  deltaE76,
  dominantColors,
  labToRgb,
  rgbToHsv,
  rgbToLab,
  uniformDistanceRgb,
} from "./color";
import type { Rgb } from "./types";

/** Apply an exposure change the way a camera does: all channels together. */
const expose = (c: Rgb, stops: number): Rgb => ({
  r: Math.max(0, Math.min(255, Math.round(c.r + stops))),
  g: Math.max(0, Math.min(255, Math.round(c.g + stops))),
  b: Math.max(0, Math.min(255, Math.round(c.b + stops))),
});

describe("colour space conversions", () => {
  it("round-trips RGB through LAB within a visible-difference tolerance", () => {
    for (const name of ["blue", "white", "red", "gold", "black"] as const) {
      const original = COLOR_REFERENCE[name];
      const back = labToRgb(rgbToLab(original));
      expect(deltaE76(rgbToLab(original), rgbToLab(back))).toBeLessThan(1);
    }
  });

  it("reads hue correctly for primaries", () => {
    expect(rgbToHsv({ r: 255, g: 0, b: 0 }).h).toBeCloseTo(0, 5);
    expect(rgbToHsv({ r: 0, g: 255, b: 0 }).h).toBeCloseTo(120, 5);
    expect(rgbToHsv({ r: 0, g: 0, b: 255 }).h).toBeCloseTo(240, 5);
  });

  it("reports zero saturation and an undefined-but-stable hue for grey", () => {
    const hsv = rgbToHsv({ r: 128, g: 128, b: 128 });
    expect(hsv.s).toBe(0);
    expect(hsv.h).toBe(0);
  });

  it("separates chromatic from achromatic colours by chroma", () => {
    expect(chroma(rgbToLab(COLOR_REFERENCE.red))).toBeGreaterThan(40);
    expect(chroma(rgbToLab(COLOR_REFERENCE.white))).toBeLessThan(18);
    expect(chroma(rgbToLab(COLOR_REFERENCE.gray))).toBeLessThan(18);
  });
});

describe("lighting tolerance — the reason this module exists", () => {
  it("keeps a blue jersey close to itself across a two-stop exposure swing", () => {
    const blue = COLOR_REFERENCE.blue;
    const nightBlue = expose(blue, -55);
    const sunlitBlue = expose(blue, 45);
    expect(uniformDistanceRgb(blue, nightBlue)).toBeLessThan(18);
    expect(uniformDistanceRgb(blue, sunlitBlue)).toBeLessThan(18);
  });

  it("still separates blue from red when both are underexposed", () => {
    const nightBlue = expose(COLOR_REFERENCE.blue, -55);
    const nightRed = expose(COLOR_REFERENCE.red, -55);
    expect(uniformDistanceRgb(nightBlue, nightRed)).toBeGreaterThan(40);
  });

  it("does NOT collapse white into black just because lightness is down-weighted", () => {
    // The trap: down-weighting L for lighting tolerance would make every
    // achromatic uniform identical. uniformDistance switches behaviour instead.
    expect(
      uniformDistanceRgb(COLOR_REFERENCE.white, COLOR_REFERENCE.black),
    ).toBeGreaterThan(60);
    expect(
      uniformDistanceRgb(COLOR_REFERENCE.white, COLOR_REFERENCE.gray),
    ).toBeGreaterThan(25);
  });

  it("treats a muddy jersey as still closer to its own colour than to another", () => {
    const mud: Rgb = { r: 96, g: 62, b: 40 };
    const muddyBlue: Rgb = {
      r: Math.round(COLOR_REFERENCE.blue.r * 0.7 + mud.r * 0.3),
      g: Math.round(COLOR_REFERENCE.blue.g * 0.7 + mud.g * 0.3),
      b: Math.round(COLOR_REFERENCE.blue.b * 0.7 + mud.b * 0.3),
    };
    const toBlue = uniformDistanceRgb(muddyBlue, COLOR_REFERENCE.blue);
    const toWhite = uniformDistanceRgb(muddyBlue, COLOR_REFERENCE.white);
    expect(toBlue).toBeLessThan(toWhite);
  });
});

describe("classifyJerseyColor", () => {
  it("names each reference colour as itself", () => {
    for (const name of [
      "blue",
      "white",
      "red",
      "black",
      "gold",
      "purple",
      "orange",
    ] as const) {
      expect(classifyJerseyColor(COLOR_REFERENCE[name]).name).toBe(name);
    }
  });

  it("returns a full distribution, best first", () => {
    const result = classifyJerseyColor(COLOR_REFERENCE.navy);
    expect(result.distribution.length).toBeGreaterThan(1);
    for (let i = 1; i < result.distribution.length; i++) {
      const prev = result.distribution[i - 1];
      const cur = result.distribution[i];
      expect(prev?.confidence ?? 0).toBeGreaterThanOrEqual(cur?.confidence ?? 0);
    }
    const total = result.distribution.reduce((a, d) => a + d.confidence, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("is less confident on a colour that sits between two names than on a clean one", () => {
    const between: Rgb = {
      r: Math.round((COLOR_REFERENCE.navy.r + COLOR_REFERENCE.royal_blue.r) / 2),
      g: Math.round((COLOR_REFERENCE.navy.g + COLOR_REFERENCE.royal_blue.g) / 2),
      b: Math.round((COLOR_REFERENCE.navy.b + COLOR_REFERENCE.royal_blue.b) / 2),
    };
    const ambiguous = classifyJerseyColor(between);
    const clean = classifyJerseyColor(COLOR_REFERENCE.red);
    expect(ambiguous.confidence).toBeLessThan(clean.confidence);
  });
});

describe("dominantColors", () => {
  it("recovers two team colours from a mixed sample of jersey pixels", () => {
    const samples: Rgb[] = [];
    for (let i = 0; i < 120; i++)
      samples.push(expose(COLOR_REFERENCE.blue, (i % 11) * 4 - 20));
    for (let i = 0; i < 100; i++)
      samples.push(expose(COLOR_REFERENCE.white, (i % 9) * 4 - 16));

    const clusters = dominantColors(samples, 2, 7);
    expect(clusters).toHaveLength(2);
    const names = clusters.map((c) => classifyJerseyColor(c.center).name);
    expect(names).toContain("blue");
    expect(names.some((n) => n === "white" || n === "silver")).toBe(true);
  });

  it("is deterministic for a given seed", () => {
    const samples = Array.from({ length: 60 }, (_, i) =>
      expose(i % 2 === 0 ? COLOR_REFERENCE.red : COLOR_REFERENCE.gold, (i % 7) * 5),
    );
    const a = dominantColors(samples, 2, 42);
    const b = dominantColors(samples, 2, 42);
    expect(a).toEqual(b);
  });

  it("returns nothing for an empty sample rather than inventing a colour", () => {
    expect(dominantColors([], 2)).toEqual([]);
    expect(dominantColors([COLOR_REFERENCE.blue], 0)).toEqual([]);
  });
});

describe("assignTeam", () => {
  const teams = [
    { id: "team-a", jersey: COLOR_REFERENCE.blue },
    { id: "team-b", jersey: COLOR_REFERENCE.white },
  ];

  it("assigns a clean blue jersey to the blue team with high confidence", () => {
    const result = assignTeam(COLOR_REFERENCE.blue, teams);
    expect(result.teamId).toBe("team-a");
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it("still assigns correctly under night-game exposure", () => {
    const result = assignTeam(expose(COLOR_REFERENCE.blue, -50), teams);
    expect(result.teamId).toBe("team-a");
  });

  it("refuses rather than guessing on a colour belonging to neither team", () => {
    const referee: Rgb = { r: 140, g: 140, b: 60 };
    const result = assignTeam(referee, [
      { id: "team-a", jersey: COLOR_REFERENCE.navy },
      { id: "team-b", jersey: COLOR_REFERENCE.maroon },
    ]);
    expect(result.teamId).toBeNull();
  });

  it("reports every distance so a wrong assignment can be diagnosed", () => {
    const result = assignTeam(COLOR_REFERENCE.blue, teams);
    expect(Object.keys(result.distances).sort()).toEqual(["team-a", "team-b"]);
  });

  it("handles a single-team palette without pretending to discriminate", () => {
    const result = assignTeam(COLOR_REFERENCE.blue, [
      { id: "only", jersey: COLOR_REFERENCE.blue },
    ]);
    expect(result.teamId).toBe("only");
    const miss = assignTeam(COLOR_REFERENCE.orange, [
      { id: "only", jersey: COLOR_REFERENCE.navy },
    ]);
    expect(miss.teamId).toBeNull();
  });

  it("returns no assignment when there are no teams", () => {
    expect(assignTeam(COLOR_REFERENCE.blue, []).teamId).toBeNull();
  });
});
