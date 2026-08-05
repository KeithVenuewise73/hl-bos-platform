import { describe, it, expect } from "vitest";
import { placeReport, currentTruth, historyFor, reportKey } from "./versioning.ts";
import type { InitialReport } from "./types.ts";

function draft(
  subject: string,
  version: number,
  status: InitialReport["status"],
): InitialReport {
  return {
    subject,
    version,
    status,
    title: `Report v${version}`,
    generatedFor: "Acme",
    generatedAt: "2026-08-04T12:00:00.000Z",
    engineVersion: "test",
    sections: [],
    findings: [],
    confidence: { verified: 0, inferred: 0, needsConfirmation: 0, unavailable: 0 },
  };
}

const SUBJECT = "engagement:HLD-BT-X:transformation";

describe("report versioning", () => {
  it("stamps the first report as version 1 with no supersedes", () => {
    const res = placeReport([], draft(SUBJECT, 99, "draft_ai_generated"));
    expect(res.placed.version).toBe(1);
    expect(res.supersededKey).toBeNull();
    expect(res.placed.supersedes).toBeUndefined();
    expect(res.placed.status).toBe("draft_ai_generated");
  });

  it("increments the version and points supersedes at the newest prior", () => {
    const v1 = draft(SUBJECT, 1, "superseded");
    const res = placeReport([v1], draft(SUBJECT, 1, "draft_ai_generated"));
    expect(res.placed.version).toBe(2);
    expect(res.supersededKey).toBe(reportKey(v1));
    expect(res.placed.supersedes).toBe(reportKey(v1));
  });

  it("NEVER overwrites an approved report — it is retained untouched", () => {
    const approved = draft(SUBJECT, 1, "approved");
    const res = placeReport([approved], draft(SUBJECT, 1, "draft_ai_generated"));

    // Approved report still present, still approved, unchanged.
    const stillApproved = res.lineage.find((r) => r.version === 1);
    expect(stillApproved?.status).toBe("approved");
    expect(res.approvedPreserved).toBe(true);

    // New report is an additive draft, not a promotion.
    expect(res.placed.version).toBe(2);
    expect(res.placed.status).toBe("draft_ai_generated");

    // The current truth is still the approved report, not the new draft.
    expect(currentTruth(res.lineage, SUBJECT)?.version).toBe(1);
  });

  it("does not mutate the input array", () => {
    const existing = [draft(SUBJECT, 1, "approved")];
    const before = existing.length;
    placeReport(existing, draft(SUBJECT, 1, "draft_ai_generated"));
    expect(existing).toHaveLength(before);
  });

  it("returns no current truth when only drafts exist", () => {
    const res = placeReport([], draft(SUBJECT, 1, "draft_ai_generated"));
    expect(currentTruth(res.lineage, SUBJECT)).toBeNull();
  });

  it("retains full history, newest truth first", () => {
    let lineage: InitialReport[] = [];
    lineage = placeReport(lineage, draft(SUBJECT, 1, "draft_ai_generated")).lineage;
    lineage = placeReport(lineage, draft(SUBJECT, 1, "draft_ai_generated")).lineage;
    expect(historyFor(lineage, SUBJECT)).toHaveLength(2);
  });
});
