import { describe, it, expect } from "vitest";
import { dossier } from "./btic-data";
import { deriveExecutive } from "./executive-view";

const d = dossier("venuewise")!;

describe("deriveExecutive — executive intelligence from real BTIC evidence", () => {
  it("produces the 12 required sections, in order", () => {
    const v = deriveExecutive(d);
    expect(v.sections.map((s) => s.key)).toEqual([
      "stage",
      "summary",
      "constraint",
      "opportunity",
      "seo",
      "marketing",
      "ai",
      "operational",
      "risks",
      "decisions",
      "next",
      "timeline",
    ]);
  });

  it("every section traces back to a real basis (provenance) — nothing floats free", () => {
    const v = deriveExecutive(d);
    for (const s of v.sections) {
      expect(s.basis.trim().length).toBeGreaterThan(0);
      expect(s.title.trim().length).toBeGreaterThan(0);
    }
  });

  it("uses the real assessment numbers — no fabricated scores", () => {
    const v = deriveExecutive(d);
    expect(v.overallScore).toBe(47); // the seeded deterministic score
    const ai = v.sections.find((s) => s.key === "ai")!;
    expect(ai.headline).toContain("20/100"); // the real AI-readiness domain
    const constraint = v.sections.find((s) => s.key === "constraint")!;
    expect(constraint.headline).toContain("AI readiness"); // lowest domain = 20
  });

  it("records SEO/visibility as an explicit gap, never invented", () => {
    const v = deriveExecutive(d);
    const seo = v.sections.find((s) => s.key === "seo")!;
    expect(seo.hasData).toBe(false);
    expect(seo.confidence).toBe("unknown");
  });

  it("decisions and timeline counts match the underlying dossier exactly", () => {
    const v = deriveExecutive(d);
    const decisions = v.sections.find((s) => s.key === "decisions")!;
    const pending = d.decisions.filter((x) => x.status === "pending");
    expect(decisions.items?.length).toBe(pending.length);
    const timeline = v.sections.find((s) => s.key === "timeline")!;
    expect(timeline.items?.length).toBe(d.phases.length);
  });

  it("critical risks are the real risk + gap records, carrying their own confidence", () => {
    const v = deriveExecutive(d);
    const risks = v.sections.find((s) => s.key === "risks")!;
    const expected = d.intelligence.filter(
      (r) => r.category === "risk" || r.category === "gap",
    );
    expect(risks.items?.length).toBe(expected.length);
    // the explicit "unknown" gap is surfaced as such, not hidden
    expect(risks.items?.some((i) => i.meta === "unknown")).toBe(true);
  });

  it("is deterministic — same dossier yields the same view", () => {
    expect(deriveExecutive(d)).toEqual(deriveExecutive(d));
  });

  it("does not mutate the dossier (current truth / history untouched)", () => {
    const before = JSON.stringify(d);
    deriveExecutive(d);
    expect(JSON.stringify(d)).toBe(before);
  });
});
