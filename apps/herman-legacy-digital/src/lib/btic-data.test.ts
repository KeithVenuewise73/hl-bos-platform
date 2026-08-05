import { describe, it, expect } from "vitest";
import {
  engagements,
  dossier,
  orderedPhases,
  currentPhase,
  currentReportFor,
  historyFor,
  reportSubjects,
  reportTruthIsUnambiguous,
  pendingDecisions,
  type Dossier,
} from "./btic-data";

const d = dossier("venuewise") as Dossier;

describe("BTIC V1 — dossier availability", () => {
  it("exposes exactly one engagement (Venuewise) in V1", () => {
    expect(engagements().map((e) => e.id)).toEqual(["venuewise"]);
  });

  it("returns null for an unknown engagement (no fabrication)", () => {
    expect(dossier("does-not-exist")).toBeNull();
  });
});

describe("BTIC honesty invariant — provenance on every record", () => {
  it("every entity record carries a non-empty provenance", () => {
    const provs: string[] = [
      d.engagement.provenance,
      ...d.phases.map((p) => p.provenance),
      ...d.reports.map((r) => r.provenance),
      ...d.decisions.map((x) => x.provenance),
      ...d.artifacts.map((a) => a.provenance),
      ...d.intelligence.map((i) => i.provenance),
    ];
    expect(provs.length).toBeGreaterThan(0);
    for (const p of provs) {
      expect(p.trim().length).toBeGreaterThan(0);
    }
  });

  it("records at least one explicit unknown/gap (external baselines)", () => {
    const gaps = d.intelligence.filter((i) => i.confidence === "unknown");
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps.some((g) => /baseline/i.test(g.headline + g.detail))).toBe(true);
  });
});

describe("BTIC phases — ordering and current phase", () => {
  it("orders phases by their order field, contiguous from 1", () => {
    const ordered = orderedPhases(d);
    expect(ordered.map((p) => p.order)).toEqual(ordered.map((_, i) => i + 1));
  });

  it("the current phase is Owner Confirmation and is in progress", () => {
    const p = currentPhase(d);
    expect(p).not.toBeNull();
    expect(p!.id).toBe("owner_confirmation");
    expect(p!.status).toBe("in_progress");
  });

  it("has at most one in-progress phase", () => {
    const inProgress = d.phases.filter((p) => p.status === "in_progress");
    expect(inProgress.length).toBeLessThanOrEqual(1);
  });
});

describe("BTIC reports — current truth vs retained history", () => {
  it("each subject has exactly one accepted current truth (unambiguous)", () => {
    for (const subject of reportSubjects(d)) {
      const current = currentReportFor(d, subject);
      // Every seeded subject in V1 has a current truth.
      expect(current, `subject ${subject} must have a current truth`).not.toBeNull();
      expect(reportTruthIsUnambiguous(d, subject)).toBe(true);
    }
  });

  it("currentReportFor never returns a superseded/draft/archived report", () => {
    for (const subject of reportSubjects(d)) {
      const current = currentReportFor(d, subject);
      if (current) {
        expect(["current", "approved"]).toContain(current.status);
      }
    }
  });

  it("website copy: draft is retained as superseded, elevated is current", () => {
    const current = currentReportFor(d, "website_copy");
    expect(current?.id).toBe("website_copy_elevated");
    expect(current?.status).toBe("current");

    const history = historyFor(d, "website_copy");
    const draft = history.find((r) => r.id === "website_copy_draft");
    // The draft is NOT deleted — it is retained and labeled superseded.
    expect(draft).toBeDefined();
    expect(draft!.status).toBe("superseded");
  });

  it("the current version's supersedes link points at a retained older version", () => {
    const current = currentReportFor(d, "website_copy")!;
    expect(current.supersedes).toBe("website_copy_draft");
    const target = d.reports.find((r) => r.id === current.supersedes);
    expect(target).toBeDefined();
  });

  it("historyFor includes the current truth (full lineage), newest-first", () => {
    const lineage = historyFor(d, "website_copy");
    expect(lineage.map((r) => r.id)).toContain("website_copy_elevated");
    expect(lineage.map((r) => r.id)).toContain("website_copy_draft");
    // current/approved ranks before superseded
    expect(lineage[0]!.status === "current" || lineage[0]!.status === "approved").toBe(
      true,
    );
  });
});

describe("BTIC decisions — verified pending set, nothing invented", () => {
  it("has exactly the four owner confirmations still owed", () => {
    const pending = pendingDecisions(d);
    expect(pending.length).toBe(4);
    const keys = pending.map((x) => x.id).sort();
    expect(keys).toEqual(
      [
        "founding_benefits",
        "partner_terms",
        "post_founding_pricing",
        "schedule_sources",
      ].sort(),
    );
  });

  it("every pending decision names what it blocks", () => {
    for (const x of pendingDecisions(d)) {
      expect(x.blocks.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("BTIC artifacts — real references only", () => {
  it("references PR #29 (the private website preview)", () => {
    const pr = d.artifacts.find((a) => a.kind === "pull_request");
    expect(pr).toBeDefined();
    expect(pr!.reference).toContain("#29");
  });

  it("no artifact reference is a fabricated external http URL", () => {
    for (const a of d.artifacts) {
      expect(/^https?:\/\//i.test(a.reference)).toBe(false);
    }
  });
});
