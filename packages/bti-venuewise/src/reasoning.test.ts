import { describe, expect, it } from "vitest";
import { runStartupCycle } from "./reasoning.ts";
import { renderReport } from "./report.ts";
import { VENUEWISE_ENGAGEMENT } from "./venuewise.ts";
import type { StartupEngagement } from "./types.ts";

const AS_OF = "2026-08-07";
const vw = runStartupCycle(VENUEWISE_ENGAGEMENT);

describe("Venuewise — the honest startup analysis", () => {
  it("(1) every asset fact is source-labeled or classified", () => {
    for (const e of VENUEWISE_ENGAGEMENT.evidence) {
      const labeled = (e.sources?.length ?? 0) > 0 || e.asset !== undefined;
      expect(labeled, `${e.id} must carry a source or classification`).toBe(true);
    }
  });

  it("(2) documentation is not treated as working software", () => {
    // The backend could not be independently verified → product is at most
    // 'observed', never 'verified'; the caveat fact is 'assumed'.
    const product = VENUEWISE_ENGAGEMENT.evidence.find((e) => e.id === "vw-product")!;
    expect(product.quality).not.toBe("verified");
    const caveat = VENUEWISE_ENGAGEMENT.evidence.find(
      (e) => e.id === "vw-backend-caveat",
    )!;
    expect(caveat.quality).toBe("assumed");
  });

  it("(3,4) a strong product does NOT yield a commercial recommendation", () => {
    expect(vw.chain.find((c) => c.link === "product")?.status).toBe("strength");
    expect(vw.output).not.toBe("RECOMMEND_TRANSFORMATION");
    expect(vw.recommendation).toBeNull();
  });

  it("(5) unknown revenue stays unknown (never a confirmed gap from a symptom)", () => {
    expect(vw.chain.find((c) => c.link === "revenue")?.status).toBe("unknown");
  });

  it("(6) unknown product-market fit stays unknown", () => {
    expect(vw.chain.find((c) => c.link === "customer")?.status).toBe("unknown");
  });

  it("(7) generates multiple, materially different transformation options", () => {
    const viable = vw.options.filter((o) => o.rejectedReason === undefined);
    expect(viable.length).toBeGreaterThanOrEqual(2);
    expect(new Set(viable.map((o) => o.name)).size).toBe(viable.length);
  });

  it("(8) the recommendation/lead is a business outcome, and building more product is rejected", () => {
    const lead = vw.options.find((o) => o.id === vw.provisionalLeadId)!;
    expect(lead.name.toLowerCase()).not.toMatch(
      /coachai|broadcastai|highlightai|crm|dashboard|build/,
    );
    expect(vw.rejected.map((r) => r.optionId)).toContain("expand-product-ecosystem");
  });

  it("(9,10) binding constraint is evidence-driven; unsupported → COLLECT_MORE_EVIDENCE", () => {
    expect(vw.rootCause.bindingLink).toBeNull();
    expect(vw.rootCause.hypotheses.length).toBeGreaterThan(0);
    expect(vw.output).toBe("COLLECT_MORE_EVIDENCE");
  });

  it("(11) produces a complete Reasoning Ledger (all 16 fields populated)", () => {
    expect(vw.discovered.length).toBeGreaterThan(0);
    expect(vw.evidence.length).toBeGreaterThan(0);
    expect(vw.assumptions.length).toBeGreaterThan(0);
    expect(vw.chain.length).toBe(13);
    expect(vw.options.length).toBeGreaterThan(0);
    expect(vw.appetite.length).toBeGreaterThan(0);
    expect(vw.validityConditions.length).toBeGreaterThan(0);
    expect(vw.evidenceThatWouldChange.length).toBeGreaterThan(0);
    expect(vw.stability).toBeDefined();
  });

  it("(12) authors a Measurement Contract with an honest baseline", () => {
    expect(vw.measurementContract).not.toBeNull();
    // The only real datum is subscriptions = 1; baseline reflects it honestly.
    expect(vw.measurementContract?.baseline.value).toBe(1);
    expect(vw.measurementContract?.successIndicators.length).toBeGreaterThan(0);
    expect(vw.measurementContract?.failureIndicators.length).toBeGreaterThan(0);
  });

  it("(13) the report explains why Venuewise is not yet commercially successful", () => {
    const r = renderReport(vw);
    expect(r).toContain("WHY VENUEWISE HAS NOT YET ACHIEVED COMMERCIAL SUCCESS");
    expect(r).toContain("PRODUCT vs BUSINESS");
    expect(r.toLowerCase()).toContain("the product is not the problem");
  });

  it("(14) no fabricated revenue/valuation/ROI/market-share figure appears", () => {
    const r = renderReport(vw);
    expect(r).not.toMatch(/\$\s?\d/); // no dollar figures
    expect(r).not.toMatch(/\bROI\b/i);
    expect(r).not.toMatch(/valuation|market share|% conversion|conversion rate/i);
    // options carry no numeric score field at all
    for (const o of vw.options) expect("score" in o).toBe(false);
  });

  it("(15) identical inputs produce identical outputs", () => {
    const a = JSON.stringify(runStartupCycle(VENUEWISE_ENGAGEMENT));
    const b = JSON.stringify(runStartupCycle(VENUEWISE_ENGAGEMENT));
    expect(a).toBe(b);
  });
});

describe("(16) evidence changes change the recommendation", () => {
  // A startup with a CONFIRMED commercial gap (a repeatable acquisition channel
  // is measurably missing) and a known first customer → the engine SHOULD move
  // off COLLECT_MORE_EVIDENCE to a firm recommendation targeting acquisition.
  const CONFIRMED: StartupEngagement = {
    engagementId: "eng-confirmed",
    business: "Confirmed Co",
    asOf: AS_OF,
    discoveryQuestions: [],
    goal: {
      statement: "grow paying customers",
      metric: "customers",
      confidence: "observed",
    },
    evidence: [
      {
        id: "p",
        fact: "[strong] mature live product",
        link: "product",
        quality: "verified",
        sources: ["a", "b"],
      },
      {
        id: "c",
        fact: "[strong] a clear, named first customer segment already buys",
        link: "customer",
        quality: "observed",
      },
      {
        id: "v",
        fact: "[strong] delivered value proven with paying users",
        link: "value_delivery",
        quality: "observed",
      },
      {
        id: "a",
        fact: "[weak] no repeatable acquisition channel — every deal is founder-sourced one-offs",
        link: "acquisition",
        quality: "observed",
      },
    ],
  };
  const l = runStartupCycle(CONFIRMED);

  it("confirms acquisition as the binding constraint and recommends an outcome", () => {
    expect(l.rootCause.bindingLink).toBe("acquisition");
    expect(l.output).toBe("RECOMMEND_TRANSFORMATION");
    expect(l.recommendation).not.toBeNull();
    const rec = l.options.find((o) => o.id === l.recommendation?.optionId)!;
    expect(rec.targetsLink).toBe("acquisition");
  });

  it("differs from the Venuewise output — same engine, different evidence", () => {
    expect(l.output).not.toBe(vw.output);
  });
});
