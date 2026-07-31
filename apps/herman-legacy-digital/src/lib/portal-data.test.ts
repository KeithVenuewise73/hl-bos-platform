import { describe, it, expect } from "vitest";
import { clientPortal, marketplaceBoundaryHolds } from "./portal-data";
import { publicSolutions, referenceBusinesses } from "./public-data";

describe("client portal Release 1 — honest no-data states", () => {
  const portal = clientPortal("client@example.com");

  it("shows honest no-data for engagement/roadmap/documents/projects", () => {
    for (const key of [
      "overview",
      "roadmap",
      "documents",
      "projects",
      "solutions_in_use",
    ]) {
      const s = portal.sections.find((x) => x.key === key)!;
      expect(s.status).toBe("no_data");
    }
  });

  it("never fabricates adopted solutions (in-use is empty)", () => {
    expect(portal.marketplace.inUse).toHaveLength(0);
  });

  it("recommendations are general first steps, not a fabricated per-account plan", () => {
    const rec = portal.sections.find((s) => s.key === "recommendations")!;
    expect(rec.message.toLowerCase()).toContain("advisor");
  });
});

describe("marketplace recommendation boundary", () => {
  const portal = clientPortal(null);

  it("holds: no plan-altering action exists in any tier", () => {
    expect(marketplaceBoundaryHolds(portal)).toBe(true);
  });

  it("explore items can ONLY request a discussion (never add to plan)", () => {
    expect(portal.marketplace.explore.length).toBeGreaterThan(0);
    for (const i of portal.marketplace.explore) {
      expect(i.action).toBe("request_discussion");
    }
    // No item anywhere exposes an "add_to_plan"-style action.
    const all = [
      ...portal.marketplace.recommended,
      ...portal.marketplace.inUse,
      ...portal.marketplace.explore,
    ];
    expect(all.some((i) => String(i.action).includes("plan"))).toBe(false);
  });
});

describe("public projection — no internal metrics leak", () => {
  it("public solutions expose only public fields", () => {
    const keys = new Set(Object.keys(publicSolutions()[0] ?? {}));
    expect([...keys].sort()).toEqual(
      ["category", "description", "key", "name", "targetMarket"].sort(),
    );
    // Internal metrics must not be present.
    for (const forbidden of ["assemblyPct", "maturity", "netNewCapabilities", "roi"]) {
      expect(keys.has(forbidden)).toBe(false);
    }
  });

  it("reference businesses are labeled honestly (no unverified claims)", () => {
    for (const r of referenceBusinesses()) {
      expect(r.label).toBe("Internal reference implementation");
      expect(r.status.toLowerCase()).toContain("baseline pending");
    }
  });
});
