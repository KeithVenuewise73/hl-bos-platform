import { describe, it, expect } from "vitest";
import { sampleEngagement, SAMPLE_BUSINESS, IS_ILLUSTRATIVE_SAMPLE } from "./bte-live";

describe("bte-live — real engine output surfaced into BTIC, read-only", () => {
  it("is deterministic — the same run reproduces the same engagement", async () => {
    const a = await sampleEngagement();
    const b = await sampleEngagement();
    expect(a.engagementId).toBe(b.engagementId);
    expect(a.state).toBe(b.state);
    expect(a.timeline.length).toBe(b.timeline.length);
    expect(a.evidence.length).toBe(b.evidence.length);
  });

  it("runs on the built-in ILLUSTRATIVE sample, never a live client", () => {
    expect(IS_ILLUSTRATIVE_SAMPLE).toBe(true);
    expect(SAMPLE_BUSINESS).toBe("Rivertown Logistics");
  });

  it("never marks the report as delivered to the client (V1 invariant)", async () => {
    const r = await sampleEngagement();
    expect(r.clientReportDelivered).toBe(false);
  });

  it("lands at HLD review — the pipeline never auto-approves or auto-delivers", async () => {
    const r = await sampleEngagement();
    expect(r.state).toBe("hld_review_required");
  });

  it("produces real evidence, each record carrying a status + provenance", async () => {
    const r = await sampleEngagement();
    expect(r.evidence.length).toBeGreaterThan(0);
    for (const e of r.evidence) {
      expect(e.status).toBeTruthy();
      expect(e.source).toBeTruthy();
    }
  });

  it("produces findings, each with an explicit confidence label (no bare guesses)", async () => {
    const r = await sampleEngagement();
    const findings = r.report?.findings ?? [];
    expect(findings.length).toBeGreaterThan(0);
    const allowed = ["verified", "inferred", "needs_confirmation", "unavailable"];
    for (const f of findings) {
      expect(allowed).toContain(f.confidence);
      expect(f.provenance).toBeTruthy();
    }
  });

  it("emits a draft report that is not yet current truth", async () => {
    const r = await sampleEngagement();
    expect(r.report).not.toBeNull();
    expect(r.report?.status).toBe("draft_ai_generated");
  });

  it("client acknowledgment is queued (transport CEO-gated) and never attaches the report", async () => {
    const r = await sampleEngagement();
    expect(r.acknowledgment?.outcome).toBe("queued");
    expect(r.acknowledgment?.fullReportIncluded).toBe(false);
  });
});
