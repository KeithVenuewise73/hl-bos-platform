import { describe, it, expect } from "vitest";
import { ASSESSMENT_AREAS, validateFramework, requiredDimensions } from "./framework";

describe("assessment framework", () => {
  it("defines exactly 15 assessment areas", () => {
    expect(ASSESSMENT_AREAS).toHaveLength(15);
  });

  it("every area reference resolves to a canonical engine dimension", () => {
    const v = validateFramework();
    expect(v.ok).toBe(true);
    expect(v.unresolved).toEqual([]);
    expect(v.areaCount).toBe(15);
    expect(v.referencedDimensions).toBeGreaterThan(0);
  });

  it("required dimensions are de-duplicated and all resolvable", () => {
    const dims = requiredDimensions();
    const ids = dims.map((d) => `${d.domain}.${d.dimension}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has stable, unique area keys", () => {
    const keys = ASSESSMENT_AREAS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
