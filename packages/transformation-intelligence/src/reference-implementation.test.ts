import { describe, it, expect } from "vitest";
import {
  REFERENCE_ORGS,
  referenceImplementation,
  referenceLibrary,
} from "./reference-implementation";

describe("Reference Implementation Library — the three orgs", () => {
  const lib = referenceLibrary();

  it("produces a reference implementation for all three businesses", () => {
    expect(REFERENCE_ORGS.map((o) => o.key)).toEqual([
      "herman_legacy",
      "venuewise",
      "hscs",
    ]);
    expect(lib.orgCount).toBe(3);
    expect(lib.implementations.map((r) => r.org)).toEqual([
      "Herman Legacy Group",
      "Venuewise",
      "HSCS Consulting",
    ]);
  });

  it("NEVER fabricates metrics — external metrics are UNKNOWN with null values", () => {
    expect(lib.noFabricatedMetrics).toBe(true);
    for (const r of lib.implementations) {
      const vis = r.baselines.find((b) => b.metric === "Visibility")!;
      expect(vis.status).toBe("unknown");
      expect(vis.value).toBeNull();
      // Every unknown cites the missing live scan.
      for (const b of r.baselines) {
        if (b.status === "unknown") expect(b.value).toBeNull();
        else expect(b.value).not.toBeNull();
      }
    }
  });

  it("measures Factory-internal readiness (computed, real)", () => {
    const hl = referenceImplementation("herman_legacy")!;
    expect(hl.capabilityReuseReport.transformationReadinessPct).toBeGreaterThan(0);
    const measured = hl.baselines.filter((b) => b.status === "measured");
    expect(measured.length).toBeGreaterThan(0);
    expect(measured.some((b) => b.metric === "Factory Transformation Readiness")).toBe(
      true,
    );
  });

  it("clearly distinguishes measured / estimated / unknown", () => {
    for (const r of lib.implementations) {
      expect(r.measuredCount).toBeGreaterThan(0);
      expect(r.unknownCount).toBeGreaterThan(0);
      expect(r.measuredCount + r.estimatedCount + r.unknownCount).toBe(
        r.baselines.length,
      );
    }
  });

  it("reuses the org's marketing campaign (assemble, not rebuild)", () => {
    const vw = referenceImplementation("venuewise")!;
    expect(vw.marketingStrategy?.client).toBe("Venuewise");
  });

  it("produces every required output including an honest case study", () => {
    const hscs = referenceImplementation("hscs")!;
    expect(hscs.transformationRoadmap.length).toBeGreaterThan(0);
    expect(hscs.ninetyDayPlan.length).toBe(3);
    expect(hscs.successMetrics.length).toBeGreaterThan(0);
    expect(hscs.caseStudy.currentState).toContain("UNKNOWN");
    // Expected outcomes are labeled TARGETS, not measured results.
    expect(hscs.caseStudy.expectedOutcomes.every((o) => o.includes("TARGET"))).toBe(
      true,
    );
  });

  it("across all three, unknown baselines outnumber measured (honest — no live data)", () => {
    expect(lib.totals.unknown).toBeGreaterThan(lib.totals.measured);
  });
});
