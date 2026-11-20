import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  isHexColor,
  mixHex,
  onColor,
  relativeLuminance,
} from "./color.ts";

describe("contrastRatio", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    // #767676 on white is the well-known 4.54:1 boundary grey
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });
  it("is symmetric", () => {
    expect(contrastRatio("#112233", "#c8a24a")).toBeCloseTo(
      contrastRatio("#c8a24a", "#112233"),
      10,
    );
  });
  it("rejects a non-hex colour rather than guessing", () => {
    expect(() => contrastRatio("red", "#fff")).toThrow();
    expect(isHexColor("#abcdef")).toBe(true);
    expect(isHexColor("#abc")).toBe(false);
  });
});

describe("onColor", () => {
  it("picks white on dark and black on light", () => {
    expect(onColor("#112233")).toBe("#ffffff");
    expect(onColor("#f5f5dc")).toBe("#000000");
  });
  it("meets 4.5:1 for every colour on a coarse grid of the whole RGB cube", () => {
    let worst = Infinity;
    const steps = [0, 32, 64, 96, 128, 160, 192, 224, 255];
    for (const r of steps)
      for (const g of steps)
        for (const b of steps) {
          const hex = `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
          worst = Math.min(worst, contrastRatio(hex, onColor(hex)));
        }
    expect(worst).toBeGreaterThanOrEqual(4.5);
  });
  it("meets 4.5:1 for 5000 random colours", () => {
    let seed = 12345;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let i = 0; i < 5000; i++) {
      const hex = `#${Math.floor(rnd() * 0x1000000)
        .toString(16)
        .padStart(6, "0")}`;
      expect(contrastRatio(hex, onColor(hex)), hex).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("mixHex", () => {
  it("interpolates and clamps at the ends", () => {
    expect(mixHex("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mixHex("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(relativeLuminance("#000000")).toBe(0);
  });
});
