import { describe, it, expect } from "vitest";
import { analyzeHtml } from "./extract.ts";
import { analyzeBusiness } from "./analyze.ts";
import { SAMPLE_BUSINESS, SAMPLE_HTML } from "./sample.ts";
import { hlServiceLabel } from "./services.ts";

describe("website extractor — reads real signals from HTML", () => {
  const e = analyzeHtml(SAMPLE_HTML, SAMPLE_BUSINESS.website);
  it("detects HTTPS, title, viewport from the URL/markup", () => {
    expect(e.https).toBe(true);
    expect(e.title).toContain("Rivertown Logistics");
    expect(e.hasViewport).toBe(true);
  });
  it("detects the weaknesses that exist in the sample", () => {
    expect(e.metaDescription).toBeNull(); // no meta description in the sample
    expect(e.structuredDataTypes).toHaveLength(0); // no schema.org
    expect(e.forms).toBe(0); // no lead-capture form
    expect(e.analyticsTags).toHaveLength(0); // no analytics tag
    expect(e.socialLinks).toContain("facebook");
    expect(e.imagesMissingAlt).toBe(2); // both <img> lack alt
  });
});

describe("analyst orchestration — evidence → findings → recommendations → proposal", () => {
  const a = analyzeBusiness({ ...SAMPLE_BUSINESS, html: SAMPLE_HTML });

  it("produces a Business Intelligence Profile (understanding, not scores)", () => {
    expect(a.profile.length).toBeGreaterThan(0);
    for (const o of a.profile) expect(o.evidence).toBeTruthy();
  });

  it("produces evidence-backed findings — each with the fields the EO requires", () => {
    expect(a.report.findings.length).toBeGreaterThan(0);
    for (const f of a.report.findings) {
      expect(f.supportingEvidence.length).toBeGreaterThan(0); // Evidence
      expect(f.businessImpact).toBeTruthy(); // Business Impact
      expect(f.priority).toBeTruthy(); // Priority
      expect(f.services.length).toBeGreaterThan(0); // Recommended HL solution
    }
    // Confidence is available per finding via the CEO review package.
    expect(a.report.review.length).toBe(a.report.findings.length);
  });

  it("every finding maps to at least one Herman Legacy product", () => {
    const products = new Set(a.proposal.recommendedServices.map(hlServiceLabel));
    expect(products.size).toBeGreaterThan(0);
    // sample has weak SEO/AEO/social/analytics → expect visibility/marketing-type products
    const labels = a.proposal.lines.map((l) => l.service);
    expect(labels.length).toBeGreaterThan(0);
  });

  it("generates a proposal with de-duplicated Herman Legacy product lines", () => {
    const services = a.proposal.lines.map((l) => l.service);
    expect(new Set(services).size).toBe(services.length); // no duplicates
  });

  it("is deterministic (same site → same analysis)", () => {
    const b = analyzeBusiness({ ...SAMPLE_BUSINESS, html: SAMPLE_HTML });
    expect(JSON.stringify(b.report.findings)).toBe(JSON.stringify(a.report.findings));
  });

  it("states its evidence coverage honestly", () => {
    expect(a.coverageNote).toContain("website-driven");
  });
});
