import { describe, it, expect } from "vitest";
import { runIntakePipeline, retryNotification } from "./pipeline.ts";
import { buildReport } from "./report.ts";
import {
  fixedClock,
  referenceIds,
  scriptedFetcher,
  succeedingNotifier,
  failingNotifier,
  queueingAcknowledger,
  type PipelineAdapters,
} from "./adapters.ts";
import { SAMPLE_INTAKE, fetchCollected, fetchBlocked } from "./sample.ts";
import type { NormalizedIntake } from "./types.ts";

const AT = "2026-08-04T12:00:00.000Z";

function adapters(overrides: Partial<PipelineAdapters> = {}): PipelineAdapters {
  return {
    clock: fixedClock(AT),
    ids: referenceIds,
    fetcher: scriptedFetcher(fetchCollected),
    notifier: succeedingNotifier,
    acknowledger: queueingAcknowledger,
    ...overrides,
  };
}

describe("runIntakePipeline — happy path (collected website)", () => {
  it("creates an engagement and advances to hld_review_required", async () => {
    const r = await runIntakePipeline(SAMPLE_INTAKE, adapters());
    expect(r.state).toBe("hld_review_required");
    expect(r.failure).toBeNull();
    expect(r.report).not.toBeNull();
    expect(r.report?.status).toBe("draft_ai_generated");
  });

  it("walks the states in the correct order", async () => {
    const r = await runIntakePipeline(SAMPLE_INTAKE, adapters());
    const states = r.timeline.map((t) => t.state);
    expect(states).toEqual([
      "received",
      "evidence_collection_pending",
      "evidence_collection_running",
      "analysis_pending",
      "analysis_running",
      "report_generation_running",
      "hld_review_required",
    ]);
  });

  it("notifies Keith and queues (not sends) the client acknowledgment", async () => {
    const r = await runIntakePipeline(SAMPLE_INTAKE, adapters());
    expect(r.notification?.outcome).toBe("sent");
    expect(r.acknowledgment?.outcome).toBe("queued");
  });

  it("NEVER delivers the full report to the client", async () => {
    const r = await runIntakePipeline(SAMPLE_INTAKE, adapters());
    expect(r.clientReportDelivered).toBe(false);
    expect(r.acknowledgment?.fullReportIncluded).toBe(false);
  });

  it("records evidence with truthful status", async () => {
    const r = await runIntakePipeline(SAMPLE_INTAKE, adapters());
    const web = r.evidence.find((e) => e.key === "website.homepage");
    expect(web?.status).toBe("collected");
  });
});

describe("runIntakePipeline — inaccessible website", () => {
  it("labels the site blocked but still produces a draft report", async () => {
    const r = await runIntakePipeline(
      SAMPLE_INTAKE,
      adapters({ fetcher: scriptedFetcher(fetchBlocked) }),
    );
    expect(r.state).toBe("hld_review_required");
    const web = r.evidence.find((e) => e.key === "website.homepage");
    expect(web?.status).toBe("blocked");
    expect(r.report?.findings.some((f) => f.confidence === "unavailable")).toBe(true);
  });
});

describe("runIntakePipeline — failure handling never discards the intake", () => {
  it("fails visibly on a missing required field", async () => {
    const bad: NormalizedIntake = {
      ...SAMPLE_INTAKE,
      contact: { ...SAMPLE_INTAKE.contact, email: "" },
    };
    const r = await runIntakePipeline(bad, adapters());
    expect(r.state).toBe("failed");
    expect(r.failure?.reason).toContain("missing required intake field");
    expect(r.failure?.nextAction).toBeTruthy();
    // Still visible: the engagement exists and the timeline recorded receipt.
    expect(r.timeline[0]?.state).toBe("received");
    expect(r.submissionRef).toBe(SAMPLE_INTAKE.submissionRef);
  });

  it("fails visibly and retryably on an evidence-collector error", async () => {
    const throwingFetcher = {
      fetchSite: () => Promise.reject(new Error("timeout")),
    };
    const r = await runIntakePipeline(
      SAMPLE_INTAKE,
      adapters({ fetcher: throwingFetcher }),
    );
    expect(r.state).toBe("failed");
    expect(r.failure?.state).toBe("evidence_collection_running");
    expect(r.failure?.reason).toContain("evidence collector error");
  });

  it("fails visibly on an analysis provider error", async () => {
    const r = await runIntakePipeline(SAMPLE_INTAKE, adapters(), {
      buildReport: () => {
        throw new Error("provider 500");
      },
    });
    expect(r.state).toBe("failed");
    expect(r.failure?.state).toBe("analysis_running");
    expect(r.failure?.reason).toContain("analysis provider error");
  });
});

describe("runIntakePipeline — notification failure stays visible and retryable", () => {
  it("keeps the report and records the failed notification", async () => {
    const r = await runIntakePipeline(
      SAMPLE_INTAKE,
      adapters({ notifier: failingNotifier("smtp down") }),
    );
    // Non-fatal: the engagement still reaches review with a report retained.
    expect(r.state).toBe("hld_review_required");
    expect(r.report).not.toBeNull();
    expect(r.notification?.outcome).toBe("failed");
    expect(r.notification?.failureReason).toBe("smtp down");
    expect(r.notification?.attempts).toBe(1);
  });

  it("can be retried without touching the report", async () => {
    const failing = adapters({ notifier: failingNotifier("smtp down") });
    const r = await runIntakePipeline(SAMPLE_INTAKE, failing);
    const evidence = { records: r.evidence, site: null, analyzable: true } as const;
    const rebuilt = buildReport({
      intake: SAMPLE_INTAKE,
      evidence,
      generatedAt: AT,
      version: r.report!.version,
    });
    const retried = await retryNotification(
      r,
      SAMPLE_INTAKE,
      r.report!,
      rebuilt,
      adapters({ notifier: succeedingNotifier }),
    );
    expect(retried.notification?.attempts).toBe(2);
    expect(retried.notification?.outcome).toBe("sent");
    // The report is unchanged by a notification retry.
    expect(retried.report).toBe(r.report);
  });
});

describe("runIntakePipeline — duplicate intake is linked, not discarded", () => {
  it("records the duplicate link and still processes", async () => {
    const r = await runIntakePipeline(SAMPLE_INTAKE, adapters(), {
      duplicateOfEngagementId: "eng_hldbtprior",
    });
    expect(r.state).toBe("hld_review_required");
    expect(r.timeline.some((t) => t.note.includes("duplicate"))).toBe(true);
  });
});

describe("runIntakePipeline — prior approved report is never overwritten", () => {
  it("adds a new draft version above an approved report", async () => {
    const first = await runIntakePipeline(SAMPLE_INTAKE, adapters());
    const approved = { ...first.report!, status: "approved" as const };

    const second = await runIntakePipeline(SAMPLE_INTAKE, adapters(), {
      existingReports: [approved],
    });
    expect(second.report?.version).toBe(2);
    expect(second.report?.status).toBe("draft_ai_generated");
    expect(second.report?.supersedes).toBeTruthy();
  });
});
