import { describe, it, expect } from "vitest";
import { analyst } from "@hl-bos/bti-engine";
import { buildReportView, workflowStages } from "./report-model";

// Drive the real engine over representative homepage HTML (no network) and assert
// the executive view-model is well-formed and HONEST — nothing quantitative
// invented, unknowns preserved, recommendations evidence-gated.

const WEAK_HTML = `<!doctype html><html><head><title>Ace Movers</title></head>
<body><h1>Ace Movers</h1><p>We move things.</p></body></html>`;

const STRONG_HTML = `<!doctype html><html lang="en"><head>
<title>Summit Logistics — Freight & Fleet Solutions</title>
<meta name="description" content="Summit Logistics provides reliable regional freight, warehousing, and fleet management.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="canonical" href="https://summit.example.com">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Summit Logistics","telephone":"+1-555-0100","address":"100 Dock St"}</script>
<script src="https://www.googletagmanager.com/gtag/js"></script>
</head><body>
<h1>Summit Logistics</h1><h2>Freight</h2><h2>Warehousing</h2><h2>Fleet</h2>
<p>${"Reliable regional freight and warehousing for growing businesses. ".repeat(20)}</p>
<img src="/a.jpg" alt="warehouse"><img src="/b.jpg" alt="truck">
<a href="/contact">Contact</a><a href="mailto:hi@summit.example.com">Email us</a>
<a href="https://facebook.com/summit">Facebook</a><a href="https://linkedin.com/company/summit">LinkedIn</a>
<form action="/lead"><input name="email"><button>Get a quote</button></form>
</body></html>`;

function view(html: string, name = "Sample Co", industry = "transportation") {
  const analysis = analyst.analyzeBusiness({
    name,
    website: "https://sample.example.com",
    industry,
    html,
  });
  return buildReportView(analysis, { analyzedAtIso: "2026-08-06T12:00:00.000Z" });
}

describe("executive report view-model", () => {
  it("carries business identity, analysis time, and pages analyzed", () => {
    const v = view(WEAK_HTML, "Ace Movers");
    expect(v.business.name).toBe("Ace Movers");
    expect(v.analyzedAtIso).toBe("2026-08-06T12:00:00.000Z");
    expect(v.pagesAnalyzed).toBe(1); // single-page helper
  });

  it("builds a scorecard covering every analyzed dimension with benchmark + confidence", () => {
    const v = view(WEAK_HTML);
    expect(v.scorecard.length).toBeGreaterThan(0);
    expect(v.dimensionsTotal).toBe(v.scorecard.length);
    for (const s of v.scorecard) {
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(100);
      expect(s.benchmark).toBe(80);
      expect(["High", "Moderate", "Low"]).toContain(s.confidence);
      expect(s.statusLabel.length).toBeGreaterThan(0);
    }
  });

  it("derives a business-specific executive briefing from the top findings", () => {
    const v = view(WEAK_HTML, "Ace Movers");
    expect(v.executiveBriefing.situation).toContain("Ace Movers");
    expect(v.executiveBriefing.situation.length).toBeGreaterThan(40);
    // The constraint names the actual top finding's dimension, not a fixed string.
    if (v.findings.length > 0) {
      expect(v.executiveBriefing.primaryConstraint.toLowerCase()).toContain(
        v.findings[0]!.dimension.toLowerCase(),
      );
    }
  });

  it("de-templates findings — no repeated 'rated N/5 — below target' skeleton", () => {
    const v = view(WEAK_HTML);
    for (const f of v.findings) {
      expect(f.title).not.toMatch(/rated \d\/5 — below target/i);
      expect(f.problem.length).toBeGreaterThan(0);
      expect(["High", "Moderate", "Low"]).toContain(f.confidence);
      // Claim classification is surfaced.
      expect(
        f.claims.every((c) => ["Fact", "Inference", "Opinion"].includes(c.type)),
      ).toBe(true);
    }
    // Titles are not all identical (real de-templating).
    const titles = new Set(v.findings.map((f) => f.title));
    if (v.findings.length > 1) expect(titles.size).toBeGreaterThan(1);
  });

  it("does NOT fabricate ROI without financial inputs", () => {
    const v = view(WEAK_HTML);
    expect(v.roi.quantified).toBe(false);
    expect(v.roi.lines).toEqual([]);
    expect(v.roi.note.toLowerCase()).toContain("not yet quantified");
    for (const t of v.recommendedTransformations) {
      expect(t.price).toBe("To be confirmed");
      expect(t.roi.toLowerCase()).toContain("not quantified");
    }
  });

  it("evidence-gates recommendations — every one traces to findings", () => {
    const v = view(WEAK_HTML);
    for (const t of v.recommendedTransformations) {
      expect(t.supportedBy.length).toBeGreaterThan(0);
      expect(t.outcome.length).toBeGreaterThan(0);
    }
  });

  it("produces materially different reports for strong vs weak sites", () => {
    const weak = view(WEAK_HTML, "Ace Movers");
    const strong = view(STRONG_HTML, "Summit Logistics");
    // A stronger site should score higher and surface fewer high-priority gaps.
    expect(strong.score ?? 0).toBeGreaterThan(weak.score ?? 0);
    expect(strong.criticalHighCount).toBeLessThanOrEqual(weak.criticalHighCount);
    expect(strong.executiveBriefing.situation).not.toBe(
      weak.executiveBriefing.situation,
    );
  });

  it("provides an evidence-limitation statement and honest coverage note", () => {
    const v = view(WEAK_HTML);
    expect(v.evidenceLimitation.toLowerCase()).toContain("not yet measured");
    expect(v.coverageNote.length).toBeGreaterThan(0);
  });

  it("hands off to blueprint and to a real advisor contact path", () => {
    const v = view(WEAK_HTML);
    expect(v.next.href).toBe("/transformation-blueprint");
    expect(v.secondary.href).toBe("/book");
  });

  it("enriches blueprint horizons with objective and evidence gating", () => {
    const v = view(WEAK_HTML);
    for (const h of v.horizons) {
      expect(h.objective.length).toBeGreaterThan(0);
      expect(h.dependencies.length).toBeGreaterThan(0);
      expect(h.evidenceRequired.length).toBeGreaterThan(0);
    }
  });

  it("de-templates the business-impact line — impacts differ across findings", () => {
    const v = view(WEAK_HTML);
    const impacts = v.findings.map((f) => f.businessImpact);
    // The old engine template repeated one sentence; specific impacts must vary.
    if (impacts.length > 1) expect(new Set(impacts).size).toBeGreaterThan(1);
    for (const i of impacts)
      expect(i).not.toMatch(/limits new-customer acquisition and revenue\.$/);
  });

  it("synthesizes connected themes from real findings", () => {
    const v = view(WEAK_HTML);
    expect(v.connectedInsight.length).toBeGreaterThan(40);
    for (const t of v.synthesisThemes) {
      expect(t.findings.length).toBeGreaterThan(0); // themes only appear with findings
      expect(t.name.length).toBeGreaterThan(0);
    }
  });

  it("surfaces the full transformation surface with unknowns kept unknown", () => {
    const v = view(WEAK_HTML);
    expect(v.transformationScope.notYetAssessed.length).toBeGreaterThan(0);
    for (const a of v.transformationScope.notYetAssessed) {
      expect(a.note.toLowerCase()).toContain("not yet assessed");
    }
    // Assessed areas correspond to themes actually found.
    expect(v.transformationScope.assessed.length).toBe(v.synthesisThemes.length);
  });

  it("carries differentiation and qualitative urgency (no fabricated numbers)", () => {
    const v = view(WEAK_HTML);
    expect(v.whyHermanLegacy.length).toBeGreaterThanOrEqual(3);
    expect(v.beginNow.length).toBeGreaterThan(0);
    // Urgency must not fabricate a dollar/percent/rank figure.
    expect(v.beginNow).not.toMatch(/\$\s?\d|\d+%|\d+\s*(rank|ranking|leads?)/i);
  });
});

describe("workflowStages", () => {
  it("defines the journey spine with a single active stage", () => {
    const stages = workflowStages();
    expect(stages.map((s) => s.id)).toEqual([
      "analysis",
      "report",
      "blueprint",
      "implement",
      "measure",
      "subscription",
    ]);
    expect(stages.filter((s) => s.status === "active")).toHaveLength(1);
  });
});
