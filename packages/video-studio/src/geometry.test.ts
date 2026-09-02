import { describe, expect, it } from "vitest";

import {
  clamp,
  containRect,
  coverToAspect,
  cropToAspect,
  lerpRect,
  scaleRect,
} from "./geometry";

const aspect16x9 = 16 / 9;
const ratio = (r: { width: number; height: number }): number => r.width / r.height;

describe("cropToAspect", () => {
  it("takes the full height of a too-wide box and centres horizontally", () => {
    const result = cropToAspect({ x: 0, y: 0, width: 400, height: 100 }, aspect16x9);
    expect(result.height).toBe(100);
    expect(ratio(result)).toBeCloseTo(aspect16x9);
    expect(result.x).toBeCloseTo((400 - 100 * aspect16x9) / 2);
  });

  it("takes the full width of a too-tall box and centres vertically", () => {
    const result = cropToAspect({ x: 10, y: 20, width: 100, height: 400 }, aspect16x9);
    expect(result.width).toBe(100);
    expect(ratio(result)).toBeCloseTo(aspect16x9);
  });

  it("always lands inside the box it was given", () => {
    const outer = { x: 5, y: 7, width: 300, height: 500 };
    const result = cropToAspect(outer, aspect16x9);
    expect(result.x).toBeGreaterThanOrEqual(outer.x);
    expect(result.y).toBeGreaterThanOrEqual(outer.y);
    expect(result.x + result.width).toBeLessThanOrEqual(outer.x + outer.width + 1e-9);
    expect(result.y + result.height).toBeLessThanOrEqual(outer.y + outer.height + 1e-9);
  });
});

describe("coverToAspect", () => {
  it("contains the whole box and matches the aspect", () => {
    const outer = { x: 0, y: 0, width: 1536, height: 1024 };
    const result = coverToAspect(outer, aspect16x9);
    expect(ratio(result)).toBeCloseTo(aspect16x9);
    expect(result.x).toBeLessThanOrEqual(0);
    expect(result.width).toBeGreaterThanOrEqual(outer.width);
    expect(result.height).toBeGreaterThanOrEqual(outer.height);
  });
});

describe("scaleRect", () => {
  it("shrinks about the centre by default", () => {
    const result = scaleRect({ x: 0, y: 0, width: 100, height: 50 }, 0.5);
    expect(result).toEqual({ x: 25, y: 12.5, width: 50, height: 25 });
  });

  it("keeps the aspect ratio it was given", () => {
    const result = scaleRect({ x: 3, y: 4, width: 320, height: 180 }, 0.84);
    expect(ratio(result)).toBeCloseTo(aspect16x9);
  });
});

describe("containRect", () => {
  it("slides an overhanging rectangle back inside without resizing it", () => {
    const bounds = { x: 0, y: 0, width: 100, height: 100 };
    const result = containRect({ x: 90, y: -20, width: 40, height: 40 }, bounds);
    expect(result).toEqual({ x: 60, y: 0, width: 40, height: 40 });
  });

  it("centres a rectangle that is simply too big to fit", () => {
    const result = containRect(
      { x: 0, y: 0, width: 200, height: 50 },
      {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      },
    );
    expect(result.x).toBe(-50);
    expect(result.width).toBe(200);
  });
});

describe("lerpRect", () => {
  it("returns the endpoints at 0 and 1", () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 20, y: 30, width: 40, height: 50 };
    expect(lerpRect(a, b, 0)).toEqual(a);
    expect(lerpRect(a, b, 1)).toEqual(b);
    expect(lerpRect(a, b, 0.5)).toEqual({ x: 10, y: 15, width: 25, height: 30 });
  });
});

describe("clamp", () => {
  it("bounds a value both ways", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(50, 0, 10)).toBe(10);
    expect(clamp(5, 0, 10)).toBe(5);
  });
});
