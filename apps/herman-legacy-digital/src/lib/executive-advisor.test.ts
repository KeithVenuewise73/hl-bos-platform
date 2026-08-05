import { describe, it, expect } from "vitest";
import { dossier } from "./btic-data";
import { deriveAdvisor, type Priority } from "./executive-advisor";

const d = dossier("venuewise")!;

const RANK: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  informational: 3,
};

describe("deriveAdvisor — evidence-backed executive recommendations", () => {
  it("produces at least one recommendation from the seeded dossier", () => {
    const r = deriveAdvisor(d);
    expect(r.recommendations.length).toBeGreaterThan(0);
  });

  it("NEVER produces a recommendation without supporting evidence", () => {
    const r = deriveAdvisor(d);
    for (const rec of r.recommendations) {
      expect(rec.supportingEvidence.length).toBeGreaterThan(0);
      for (const ev of rec.supportingEvidence) {
        expect(ev.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("every recommendation carries all seven required attributes", () => {
    const r = deriveAdvisor(d);
    for (const rec of r.recommendations) {
      expect(rec.priority.length).toBeGreaterThan(0);
      expect(rec.businessImpact.trim().length).toBeGreaterThan(0);
      expect(rec.confidence.length).toBeGreaterThan(0);
      expect(rec.estimatedEffort.length).toBeGreaterThan(0);
      expect(rec.supportingEvidence.length).toBeGreaterThan(0);
      expect(rec.relatedBticSection.trim().length).toBeGreaterThan(0);
      expect(rec.relatedPhase.trim().length).toBeGreaterThan(0);
    }
  });

  it("is sorted by priority, highest first", () => {
    const r = deriveAdvisor(d);
    const ranks = r.recommendations.map((x) => RANK[x.priority]);
    const sorted = [...ranks].sort((a, b) => a - b);
    expect(ranks).toEqual(sorted);
  });

  it("makes unblocking the pending owner decisions the top (critical) recommendation", () => {
    const r = deriveAdvisor(d);
    const top = r.recommendations[0]!;
    expect(top.priority).toBe("critical");
    expect(top.id).toBe("unblock-owner-confirmation");
    // its evidence count matches the real pending decisions — nothing padded
    const pending = d.decisions.filter((x) => x.status === "pending");
    expect(top.supportingEvidence.length).toBe(pending.length);
  });

  it("targets the real lowest-scoring domain as the critical gap", () => {
    const r = deriveAdvisor(d);
    const gap = r.recommendations.find((x) => x.id === "close-critical-gap");
    expect(gap).toBeTruthy();
    // AI readiness (20/100) is the seeded lowest domain
    expect(gap!.title).toContain("AI readiness");
    expect(gap!.title).toContain("20/100");
    expect(gap!.confidence).toBe("verified");
  });

  it("keeps an unknown gap UNKNOWN — never upgraded to a decided score", () => {
    const r = deriveAdvisor(d);
    const acquire = r.recommendations.find((x) => x.id.startsWith("acquire-"));
    expect(acquire).toBeTruthy();
    expect(acquire!.confidence).toBe("unknown");
    expect(acquire!.estimatedEffort).toBe("unknown");
    // the honest coverage note names the unknown input(s)
    expect(r.gapsNote).toBeTruthy();
  });

  it("never emits a fabricated effort number — effort stays within the honest enum", () => {
    const r = deriveAdvisor(d);
    const allowed = new Set(["owner_decision", "low", "medium", "high", "unknown"]);
    for (const rec of r.recommendations) {
      expect(allowed.has(rec.estimatedEffort)).toBe(true);
    }
    // and at least one is explicitly unknown (no guessed timeline)
    expect(r.recommendations.some((x) => x.estimatedEffort === "unknown")).toBe(true);
  });

  it("is deterministic — same dossier yields the same report", () => {
    expect(deriveAdvisor(d)).toEqual(deriveAdvisor(d));
  });

  it("does not mutate the dossier", () => {
    const before = JSON.stringify(d);
    deriveAdvisor(d);
    expect(JSON.stringify(d)).toBe(before);
  });
});
