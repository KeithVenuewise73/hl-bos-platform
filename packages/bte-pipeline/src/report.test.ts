import { describe, it, expect } from "vitest";
import { buildReport } from "./report.ts";
import { collectEvidence } from "./evidence.ts";
import {
  SAMPLE_INTAKE,
  SAMPLE_SITE_HTML,
  fetchCollected,
  fetchBlocked,
  fetchNoUrl,
} from "./sample.ts";

const AT = "2026-08-04T12:00:00.000Z";

const ELEVEN_SECTIONS = [
  "executive_summary",
  "business_profile",
  "digital_presence",
  "initial_strengths",
  "initial_constraints",
  "primary_constraint",
  "growth_opportunities",
  "risks",
  "unknowns",
  "recommended_next_step",
  "evidence_provenance",
];

describe("initial report — collected website", () => {
  const evidence = collectEvidence(SAMPLE_INTAKE, fetchCollected(), AT);
  const built = buildReport({
    intake: SAMPLE_INTAKE,
    evidence,
    html: SAMPLE_SITE_HTML,
    generatedAt: AT,
    version: 1,
  });

  it("produces exactly the eleven required sections, in order", () => {
    expect(built.report.sections.map((s) => s.key)).toEqual(ELEVEN_SECTIONS);
  });

  it("is always a draft_ai_generated report", () => {
    expect(built.report.status).toBe("draft_ai_generated");
  });

  it("keeps verified and inferred/needs-confirmation findings distinct", () => {
    const kinds = new Set(built.report.findings.map((f) => f.confidence));
    // Observed website facts are verified; the owner-stated challenge is not.
    expect(built.report.confidence.verified).toBeGreaterThan(0);
    expect(kinds.has("needs_confirmation")).toBe(true);
    // Every finding carries an explicit confidence + provenance (no bare claims).
    for (const f of built.report.findings) {
      expect(f.confidence).toBeTruthy();
      expect(f.provenance.length).toBeGreaterThan(0);
    }
  });

  it("names a primary constraint drawn from real evidence", () => {
    expect(built.primaryConstraint).not.toBeNull();
    expect(built.primaryConstraint?.confidence).not.toBe("unavailable");
  });

  it("recognizes a supported industry pack", () => {
    expect(built.industrySupported).toBe(true);
  });
});

describe("initial report — blocked website is not fabricated", () => {
  const evidence = collectEvidence(SAMPLE_INTAKE, fetchBlocked(), AT);
  const built = buildReport({
    intake: SAMPLE_INTAKE,
    evidence,
    generatedAt: AT,
    version: 1,
  });

  it("labels the website evidence blocked, observing nothing", () => {
    const rec = evidence.records.find((r) => r.key === "website.homepage");
    expect(rec?.status).toBe("blocked");
    expect(evidence.site).toBeNull();
  });

  it("records the digital-presence finding as unavailable, not a clean scan", () => {
    const dp = built.report.findings.find((f) => f.category === "digital_presence");
    expect(dp?.confidence).toBe("unavailable");
    const digital = built.report.sections.find((s) => s.key === "digital_presence");
    expect(digital?.hasData).toBe(false);
  });

  it("still generates a full draft report from the intake", () => {
    expect(built.report.sections).toHaveLength(11);
    expect(built.report.status).toBe("draft_ai_generated");
  });
});

describe("initial report — no website supplied", () => {
  const { website: _omitted, ...intake } = SAMPLE_INTAKE;
  const evidence = collectEvidence(intake, fetchNoUrl(), AT);
  const built = buildReport({ intake, evidence, generatedAt: AT, version: 1 });

  it("marks website evidence unavailable and says why", () => {
    const rec = evidence.records.find((r) => r.key === "website.homepage");
    expect(rec?.status).toBe("unavailable");
    expect(rec?.detail).toContain("No website");
    expect(built.report.sections).toHaveLength(11);
  });
});

describe("initial report — unsupported industry is handled truthfully", () => {
  const intake = { ...SAMPLE_INTAKE, industry: "Artisanal Cheese" };
  const evidence = collectEvidence(intake, fetchCollected(), AT);
  const built = buildReport({
    intake,
    evidence,
    html: SAMPLE_SITE_HTML,
    generatedAt: AT,
    version: 1,
  });

  it("flags the unsupported pack and still analyzes with a general lens", () => {
    expect(built.industrySupported).toBe(false);
    const summary = built.report.sections.find((s) => s.key === "executive_summary");
    expect(summary?.body).toContain("general transformation lens");
    expect(built.report.findings.length).toBeGreaterThan(0);
  });
});
