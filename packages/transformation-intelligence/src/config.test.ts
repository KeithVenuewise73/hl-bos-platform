import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG, resolveConfig, ENGINE_VERSION } from "./config";

describe("engine config", () => {
  it("returns the defaults when no overrides are given", () => {
    expect(resolveConfig()).toEqual(DEFAULT_CONFIG);
    expect(DEFAULT_CONFIG.version).toBe(ENGINE_VERSION);
  });

  it("defaults match existing bti-engine behaviour (finding 3, strength 70, 20%)", () => {
    expect(DEFAULT_CONFIG.scoring.findingThreshold).toBe(3);
    expect(DEFAULT_CONFIG.scoring.strengthThreshold).toBe(70);
    expect(DEFAULT_CONFIG.impact.automatableHoursFraction).toBe(0.2);
  });

  it("merges a partial scoring override without erasing other fields", () => {
    const c = resolveConfig({ scoring: { findingThreshold: 2 } });
    expect(c.scoring.findingThreshold).toBe(2);
    // untouched fields survive
    expect(c.scoring.strengthThreshold).toBe(70);
    expect(c.scoring.domainWeights).toEqual(DEFAULT_CONFIG.scoring.domainWeights);
  });

  it("merges nested domainWeights field-by-field", () => {
    const c = resolveConfig({ scoring: { domainWeights: { growth: 12 } } });
    expect(c.scoring.domainWeights.growth).toBe(12);
    // other domain weights are preserved, not erased
    expect(c.scoring.domainWeights.business).toBe(9);
  });

  it("does not mutate the DEFAULT_CONFIG", () => {
    resolveConfig({ scoring: { domainWeights: { growth: 99 } } });
    expect(DEFAULT_CONFIG.scoring.domainWeights.growth).toBe(8);
  });
});
