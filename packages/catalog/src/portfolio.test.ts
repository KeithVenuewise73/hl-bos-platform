import { describe, it, expect } from "vitest";
import {
  hermanLegacyOperatingModel,
  HERMAN_LEGACY_OPERATING_MODEL,
} from "./operating-model";
import {
  PORTFOLIO_LIFECYCLE,
  OPPORTUNITY_CATALOG,
  productCatalog,
  productByKey,
  portfolioDashboard,
  evaluateIdea,
} from "./portfolio";

describe("Part 1 — Herman Legacy operating model", () => {
  const model = hermanLegacyOperatingModel();

  it("assembles the exact 14-stage internal operating system", () => {
    expect(HERMAN_LEGACY_OPERATING_MODEL).toHaveLength(14);
    expect(model.stages).toHaveLength(14);
    expect(model.stages.map((s) => s.name)).toContain("CEO Dashboard");
    expect(model.stages.map((s) => s.name)).toContain("HL-BTI");
  });

  it("resolves each stage against real capabilities and reports honest gaps", () => {
    // HL-BTI stage is fully built (transformation/blueprint/scoring/dashboards).
    const btiStage = model.stages.find((s) => s.name === "HL-BTI")!;
    expect(btiStage.blueprint.netNewCount).toBe(0);
    // Support + Customer Success have honest net-new gaps (ticketing / CS desk).
    expect(model.netNewCapabilities).toContain("support ticketing");
    expect(model.netNewCapabilities).toContain("customer success desk");
  });

  it("computes an honest assemblable share (not 100%)", () => {
    expect(model.assemblablePct).toBeGreaterThan(0);
    expect(model.assemblablePct).toBeLessThan(100);
  });
});

describe("Part 3 — the one product lifecycle", () => {
  it("defines the 11-stage lifecycle with CEO approval gated", () => {
    expect(PORTFOLIO_LIFECYCLE).toHaveLength(11);
    expect(PORTFOLIO_LIFECYCLE.map((s) => s.seq)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
    const approval = PORTFOLIO_LIFECYCLE.find((s) => s.id === "ceo_approval");
    expect(approval?.gated).toBe(true);
  });
});

describe("Part 4/5 — the product & opportunity catalog", () => {
  const catalog = productCatalog();

  it("enriches every opportunity with a computed assembly picture", () => {
    expect(catalog).toHaveLength(OPPORTUNITY_CATALOG.length);
    for (const p of catalog) {
      expect(p.assemblyPct).toBeGreaterThanOrEqual(0);
      expect(p.assemblyPct).toBeLessThanOrEqual(100);
      expect(Array.isArray(p.netNewCapabilities)).toBe(true);
    }
  });

  it("never fabricates ROI, market size, or customers (Principle 10)", () => {
    for (const p of catalog) {
      expect(p.roi.status).toBe("not_estimated");
      expect(p.marketSize.status).toBe("not_estimated");
      expect(p.currentCustomers).toBe(0); // nothing is commercially live
    }
  });

  it("Sports Intelligence is assemblable now (reuses the Venuewise sports set)", () => {
    const si = productByKey("sports_intelligence")!;
    expect(si.netNewCapabilities).toHaveLength(0);
    expect(si.assemblableNow).toBe(true);
    expect(si.assemblyPct).toBe(100);
  });

  it("HockeyIQ is high-assembly with exactly the hockey-specific net-new work", () => {
    const h = productByKey("hockey_iq")!;
    expect(h.netNewCapabilities).toContain("hockey analytics engine");
    expect(h.assemblyPct).toBeGreaterThanOrEqual(70);
    expect(h.assemblableNow).toBe(false);
  });

  it("concept verticals honestly show low assembly and named net-new work", () => {
    const edu = productByKey("education")!;
    expect(edu.maturity).toBe("concept");
    expect(edu.netNewCapabilities).toContain("education vertical workflows");
  });

  it("assigns a computed engineering priority to every product", () => {
    for (const p of catalog) {
      expect(["P1", "P2", "P3", "P4"]).toContain(p.engineeringPriority);
    }
  });
});

describe("Part 6 — the executive portfolio dashboard", () => {
  const d = portfolioDashboard();

  it("tells the CEO what exists, what is assemblable, and what needs engineering", () => {
    expect(d.total).toBe(OPPORTUNITY_CATALOG.length);
    expect(d.assemblableNow.length).toBeGreaterThan(0);
    expect(d.needsEngineering.length).toBeGreaterThan(0);
    // assemblable + needs-engineering partition the non-legacy catalog.
    expect(d.assemblableNow.length + d.needsEngineering.length).toBeGreaterThanOrEqual(
      d.total - 1,
    );
  });

  it("honestly reports zero revenue-generating products", () => {
    expect(d.revenueGenerating).toEqual([]);
  });

  it("surfaces built products awaiting CEO go-to-market approval", () => {
    expect(d.awaitingApproval).toContain(
      "HL-BTI (Business Transformation Intelligence)",
    );
  });

  it("ranks highest engineering-readiness (P1) products", () => {
    expect(d.byPriority.P1).toBeGreaterThan(0);
    expect(d.highestPriority.length).toBe(d.byPriority.P1);
  });
});

describe("Definition of Done — evaluateIdea", () => {
  it("detects an idea that already exists", () => {
    const e = evaluateIdea({ name: "HockeyIQ", market: "sports" });
    expect(e.alreadyExists).toBe(true);
    expect(e.existingMatches.some((m) => m.key === "hockey_iq")).toBe(true);
  });

  it("answers the full DoD question set for a new idea with capabilities", () => {
    const e = evaluateIdea({
      name: "LacrosseIQ",
      description: "Lacrosse development platform",
      market: "sports",
      capabilities: [
        "identity",
        "scheduling",
        "messaging",
        "team roster",
        "athlete development",
        "lacrosse analytics engine",
      ],
      knownNetNew: ["lacrosse analytics engine"],
    });
    expect(e.alreadyExists).toBe(false); // no lacrosse product yet
    expect(e.reusableCapabilities.length).toBeGreaterThan(0); // reuse exists
    expect(e.requiredEngineering).toContain("lacrosse analytics engine"); // net-new named
    expect(e.assemblyPct).toBeGreaterThan(0);
    expect(e.pathToLaunch.length).toBeGreaterThan(0); // path to launch given
    expect(e.pathToLaunch.some((s) => s.includes("gated"))).toBe(true); // gates shown
  });

  it("flags when capabilities are not specified rather than inventing them", () => {
    const e = evaluateIdea({ name: "Some Brand New Thing" });
    expect(e.capabilitiesSpecified).toBe(false);
    expect(e.note.toLowerCase()).toContain("not specified");
  });
});
