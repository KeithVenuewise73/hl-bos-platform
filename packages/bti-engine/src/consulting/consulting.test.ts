import { describe, it, expect } from "vitest";
import {
  generateConsultingReport,
  renderReportMarkdown,
  templateFor,
  FINANCIAL_REQUIRED_NOTE,
  type AssessmentInput,
} from "./index.ts";

const INPUT: AssessmentInput = {
  businessName: "Test Logistics Co",
  industryPack: "transportation",
  mode: "full_transformation",
  ratings: [
    { domain: "operations", dimension: "automation", rating: 1 }, // critical
    { domain: "growth", dimension: "seo", rating: 2 }, // high
    { domain: "technology", dimension: "security", rating: 0 }, // critical + extreme
    { domain: "business", dimension: "leadership", rating: 3 }, // medium
    { domain: "operations", dimension: "operations", rating: 5 }, // strength, not a finding
    { domain: "financial", dimension: "cost_reduction", rating: 2 }, // high
  ],
  evidence: [
    {
      domain: "growth",
      dimension: "seo",
      label: "Site audit: no schema, thin metadata",
    },
  ],
  notes: { operations: "Manual dispatch, no KPIs" },
};

describe("consulting framework — deterministic + evidence-traced", () => {
  it("is deterministic (same input → identical output)", () => {
    const a = JSON.stringify(generateConsultingReport(INPUT));
    const b = JSON.stringify(generateConsultingReport(INPUT));
    expect(a).toBe(b);
  });

  it("produces a 12-part finding for each weakness, not for strengths", () => {
    const r = generateConsultingReport(INPUT);
    // 5 ratings <= 3 (automation, seo, security, leadership, cost_reduction); operations=5 excluded
    expect(r.findings).toHaveLength(5);
    expect(r.findings.some((f) => f.dimension === "operations")).toBe(false);
    for (const f of r.findings) {
      expect(f.finding).toBeTruthy();
      expect(f.supportingEvidence.length).toBeGreaterThan(0);
      expect(f.rootCause).toBeTruthy();
      expect(f.recommendedAction).toBeTruthy();
      expect(f.successMetrics.length).toBeGreaterThan(0);
      expect(f.services.length).toBeGreaterThan(0);
    }
  });

  it("every finding traces to its verified rating (FACT)", () => {
    const r = generateConsultingReport(INPUT);
    for (const f of r.findings) {
      expect(f.supportingEvidence[0]).toContain(`= ${f.rating}/5`);
      expect(f.claims.some((c) => c.type === "fact")).toBe(true);
      expect(f.claims.some((c) => c.type === "inference")).toBe(true);
      expect(f.claims.some((c) => c.type === "opinion")).toBe(true);
    }
  });

  it("classifies claims and never presents inference/opinion as fact", () => {
    const r = generateConsultingReport(INPUT);
    expect(r.meta.factCount).toBeGreaterThan(0);
    expect(r.meta.inferenceCount).toBeGreaterThan(0);
    expect(r.meta.opinionCount).toBeGreaterThan(0);
    // root cause is an inference, recommended action is an opinion — never facts
    const f = r.findings[0]!;
    const rootClaim = f.claims.find((c) =>
      c.text.includes(f.rootCause.toLowerCase().slice(0, 10)),
    );
    expect(rootClaim?.type).not.toBe("fact");
  });

  it("prioritizes deterministically: critical findings first, in immediate roadmap", () => {
    const r = generateConsultingReport(INPUT);
    expect(r.findings[0]!.priority).toBe("critical");
    const immediateLabels = r.roadmap.immediate.map((i) => i.dimension);
    expect(immediateLabels).toContain("security"); // rating 0 → critical → immediate
    for (const item of r.roadmap.immediate) expect(item.justification).toBeTruthy();
  });

  it("maps Herman Legacy services only from findings", () => {
    const r = generateConsultingReport(INPUT);
    expect(r.solutions.length).toBeGreaterThan(0);
    for (const s of r.solutions) expect(s.supportedBy.length).toBeGreaterThan(0);
    // no findings → no solutions
    const empty = generateConsultingReport({
      ...INPUT,
      ratings: [{ domain: "operations", dimension: "operations", rating: 5 }],
    });
    expect(empty.solutions).toHaveLength(0);
    expect(empty.findings).toHaveLength(0);
  });

  it("never fabricates financials — missing inputs say 'additional information required'", () => {
    const r = generateConsultingReport(INPUT); // no financial input
    expect(
      r.financial.every((l) => l.value === null || typeof l.value === "number"),
    ).toBe(true);
    const revenue = r.financial.find((l) => l.label.includes("Revenue"));
    expect(revenue?.value).toBeNull();
    expect(revenue?.note).toContain(FINANCIAL_REQUIRED_NOTE);
  });

  it("computes a financial value only when evidence supports it", () => {
    const withFin = generateConsultingReport({
      ...INPUT,
      financial: { laborHoursPerMonth: 1000, laborCostPerHour: 30 },
    });
    const auto = withFin.financial.find((l) =>
      l.label.startsWith("Estimated automation savings"),
    );
    expect(auto?.value).toBe(6000); // 1000 * 0.2 * 30
  });

  it("CEO review flags thin evidence and asks the next question", () => {
    const r = generateConsultingReport(INPUT);
    const sec = r.review.find((x) => x.subject.startsWith("Security"));
    expect(sec?.missingInformation.join(" ")).toContain("No corroborating evidence");
    // extreme 0/5 flagged
    expect(sec?.missingInformation.join(" ")).toContain("extreme");
    expect(sec?.nextQuestions.length).toBeGreaterThan(0);
    // the SEO finding HAS attached evidence → higher confidence
    const seo = r.review.find((x) => x.subject.startsWith("SEO"));
    expect(seo?.confidence).toBe("high");
  });

  it("executive narrative is honest about missing data", () => {
    const empty = generateConsultingReport({ ...INPUT, ratings: [] });
    const summary = empty.narrative.find((s) => s.key === "executive_summary")!;
    expect(summary.hasData).toBe(false);
    expect(summary.note).toBeTruthy();
  });

  it("renders a Markdown case study with claim classification", () => {
    const md = renderReportMarkdown(generateConsultingReport(INPUT), { sample: true });
    expect(md).toContain("Executive Business Transformation Blueprint");
    expect(md).toContain("Illustrative sample");
    expect(md).toContain("FACT:");
    expect(md).toContain("INFERENCE:");
    expect(md).toContain("OPINION:");
    expect(md).toContain("Transformation Roadmap");
  });

  it("analysis-only reports render without proposal/implementation framing", () => {
    const md = renderReportMarkdown(
      generateConsultingReport({ ...INPUT, mode: "analysis_only" }),
    );
    expect(md).toContain("Analysis Only");
    expect(md).toContain("No proposal, implementation, billing, or migration");
  });

  it("industry templates are configurable, not hardcoded", () => {
    expect(templateFor("transportation").emphasis[0]).toBe("operations");
    expect(templateFor("salon").emphasis[0]).toBe("growth");
    expect(templateFor("unknown-industry").key).toBe("general"); // safe fallback
  });
});
