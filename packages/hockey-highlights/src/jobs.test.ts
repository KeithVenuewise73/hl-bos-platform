import { describe, expect, it } from "vitest";

import {
  IllegalTransitionError,
  NotRetryableError,
  PIPELINE_ORDER,
  advanceJob,
  canTransition,
  describeStatus,
  failJob,
  isTerminal,
  newJob,
  progressFraction,
  retryJob,
  type JobStatus,
} from "./jobs.ts";

const NOW = "2026-09-18T12:00:00.000Z";
const LATER = "2026-09-18T12:05:00.000Z";

function job() {
  return newJob({ id: "job-1", projectId: "p-1", now: NOW });
}

describe("job state machine", () => {
  it("starts uploaded, unstarted and unfailed", () => {
    const j = job();
    expect(j.status).toBe("uploaded");
    expect(j.attempt).toBe(0);
    expect(j.failure).toBeNull();
    expect(j.startedAt).toBeNull();
    expect(j.history).toHaveLength(1);
  });

  it("walks the whole happy path", () => {
    let j = job();
    for (const status of PIPELINE_ORDER.slice(1)) {
      j = advanceJob(j, status, { now: NOW });
    }
    expect(j.status).toBe("completed");
    expect(j.finishedAt).toBe(NOW);
    expect(j.history.map((h) => h.status)).toEqual([...PIPELINE_ORDER]);
  });

  it("refuses to skip a stage", () => {
    expect(() => advanceJob(job(), "clip_generation", { now: NOW })).toThrow(
      IllegalTransitionError,
    );
  });

  it("refuses to go backwards up the pipeline", () => {
    const j = advanceJob(job(), "preprocessing", { now: NOW });
    expect(() => advanceJob(j, "uploaded", { now: NOW })).toThrow(
      IllegalTransitionError,
    );
  });

  it("lets a finished reel go back to review and be rebuilt", () => {
    // Approving three more clips after watching the reel is normal, not an error.
    let j = job();
    for (const status of PIPELINE_ORDER.slice(1))
      j = advanceJob(j, status, { now: NOW });
    expect(j.status).toBe("completed");
    j = advanceJob(j, "review_ready", { now: LATER });
    j = advanceJob(j, "rendering", { now: LATER });
    expect(j.status).toBe("rendering");
  });

  it("records which stage failed, not just that something did", () => {
    const running = advanceJob(job(), "preprocessing", { now: NOW });
    const failed = failJob(
      running,
      { code: "unreadable_video", detail: "moov atom not found", retryable: false },
      LATER,
    );
    expect(failed.status).toBe("failed");
    expect(failed.failure?.stage).toBe("preprocessing");
    expect(failed.failure?.code).toBe("unreadable_video");
    expect(failed.failure?.failedAt).toBe(LATER);
    expect(failed.finishedAt).toBe(LATER);
  });

  it("resumes a retry at the stage that broke, not at the beginning", () => {
    let j = job();
    j = advanceJob(j, "preprocessing", { now: NOW });
    j = advanceJob(j, "player_detection", { now: NOW });
    j = failJob(j, { code: "timeout", detail: "gpu busy", retryable: true }, LATER);
    const retried = retryJob(j, LATER);
    expect(retried.status).toBe("player_detection");
    expect(retried.attempt).toBe(1);
    expect(retried.failure).toBeNull();
    expect(retried.finishedAt).toBeNull();
  });

  it("will not offer a retry that cannot work", () => {
    const j = failJob(
      job(),
      { code: "vision_unavailable", detail: "no service", retryable: false },
      LATER,
    );
    expect(() => retryJob(j, LATER)).toThrow(NotRetryableError);
  });

  it("will not retry a job that has not failed", () => {
    expect(() => retryJob(job(), LATER)).toThrow(NotRetryableError);
  });

  it("clears a stale failure when the job moves forward again", () => {
    // A stale error next to a live progress bar is how a user concludes the
    // whole screen is lying, so a forward move must wipe it.
    let j = advanceJob(job(), "preprocessing", { now: NOW });
    j = failJob(j, { code: "x", detail: "y", retryable: true }, LATER);
    j = retryJob(j, LATER);
    expect(j.status).toBe("preprocessing");
    j = advanceJob(j, "player_detection", { now: LATER });
    expect(j.failure).toBeNull();
  });

  it("never lets failed resume on its own", () => {
    for (const status of PIPELINE_ORDER) {
      expect(canTransition("failed", status)).toBe(false);
    }
  });

  it("derives progress from position rather than storing it", () => {
    expect(progressFraction("uploaded")).toBe(0);
    expect(progressFraction("completed")).toBe(1);
    expect(progressFraction("failed")).toBe(0);
    expect(progressFraction("review_ready")).toBeGreaterThan(
      progressFraction("event_detection"),
    );
  });

  it("has plain-English copy for every state, with no jargon left in", () => {
    const all: JobStatus[] = [...PIPELINE_ORDER, "failed"];
    for (const status of all) {
      const copy = describeStatus(status);
      expect(copy.label.length).toBeGreaterThan(0);
      expect(copy.detail.length).toBeGreaterThan(20);
      expect(copy.detail).not.toMatch(/ffmpeg|YOLO|ByteTrack|proxy transcode|OCR/i);
    }
  });

  it("knows which states are terminal", () => {
    expect(isTerminal("completed")).toBe(true);
    expect(isTerminal("failed")).toBe(true);
    expect(isTerminal("rendering")).toBe(false);
  });
});
