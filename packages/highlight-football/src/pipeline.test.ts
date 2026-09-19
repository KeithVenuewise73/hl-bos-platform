import { describe, expect, it } from "vitest";
import {
  JOB_STATUSES,
  PIPELINE_STAGES,
  STAGE_JOB_STATUS,
  STAGE_LABELS,
  advance,
  initialStages,
  pipelineProgress,
} from "./pipeline";

describe("pipeline definition", () => {
  it("covers every stage in the brief's diagram", () => {
    expect(PIPELINE_STAGES).toHaveLength(17);
    expect(PIPELINE_STAGES[0]).toBe("upload");
    expect(PIPELINE_STAGES[PIPELINE_STAGES.length - 1]).toBe("final_export");
  });

  it("gives every stage a plain-English label and a job status", () => {
    for (const stage of PIPELINE_STAGES) {
      expect(STAGE_LABELS[stage].length).toBeGreaterThan(0);
      expect(JOB_STATUSES).toContain(STAGE_JOB_STATUS[stage]);
    }
  });

  it("uses no engineering jargon in the labels the CEO's customers read", () => {
    const jargon = ["OCR", "ReID", "homography", "bbox", "tensor", "inference", "NMS"];
    for (const stage of PIPELINE_STAGES) {
      for (const word of jargon) {
        expect(STAGE_LABELS[stage].toLowerCase()).not.toContain(word.toLowerCase());
      }
    }
  });
});

describe("pipelineProgress — no synthetic creep", () => {
  it("starts at zero", () => {
    const progress = pipelineProgress(initialStages());
    expect(progress.fraction).toBe(0);
    expect(progress.label).toBe("Waiting to start");
  });

  it("reaches exactly 1 only when every stage is done", () => {
    const done = initialStages().map((s) => ({ ...s, status: "succeeded" as const }));
    const progress = pipelineProgress(done);
    expect(progress.fraction).toBe(1);
    expect(progress.status).toBe("ready");
  });

  it("counts a skipped stage as complete, not as missing work", () => {
    const states = initialStages().map((s) =>
      s.stage === "ball_detection"
        ? { ...s, status: "skipped" as const }
        : { ...s, status: "succeeded" as const },
    );
    expect(pipelineProgress(states).fraction).toBe(1);
  });

  it("weights stages by real cost — detection moves the bar more than scoring", () => {
    const afterDetection = pipelineProgress(
      advance(initialStages(), "player_detection", { status: "succeeded" }),
    );
    const afterScoring = pipelineProgress(
      advance(initialStages(), "highlight_scoring", { status: "succeeded" }),
    );
    expect(afterDetection.fraction).toBeGreaterThan(afterScoring.fraction);
  });

  it("reports the running stage's own label and job status", () => {
    const states = advance(initialStages(), "jersey_ocr", {
      status: "running",
      progress: 0.5,
    });
    const progress = pipelineProgress(states);
    expect(progress.label).toBe("Reading jersey numbers");
    expect(progress.status).toBe("reading_numbers");
  });

  it("marks the bar indeterminate when the running stage cannot estimate", () => {
    const states = advance(initialStages(), "player_detection", {
      status: "running",
      progress: null,
    });
    expect(pipelineProgress(states).indeterminate).toBe(true);
  });

  it("stops the bar where a failure happened and shows the real reason", () => {
    let states = advance(initialStages(), "upload", { status: "succeeded" });
    states = advance(states, "transcode", {
      status: "failed",
      error: "The file is not a video we can read.",
    });
    const progress = pipelineProgress(states);
    expect(progress.status).toBe("failed");
    expect(progress.label).toBe("The file is not a video we can read.");
    expect(progress.fraction).toBeLessThan(0.1);
  });

  it("falls back to the stage name when a failure carried no message", () => {
    const states = advance(initialStages(), "transcode", { status: "failed" });
    expect(pipelineProgress(states).label).toContain("Preparing a working copy");
  });

  it("handles an empty stage list without claiming progress", () => {
    const progress = pipelineProgress([]);
    expect(progress.fraction).toBe(0);
    expect(progress.indeterminate).toBe(true);
  });

  it("never reports a fraction above 1, even with a runaway sub-progress", () => {
    const states = advance(initialStages(), "player_detection", {
      status: "running",
      progress: 9,
    });
    expect(pipelineProgress(states).fraction).toBeLessThanOrEqual(1);
  });
});
