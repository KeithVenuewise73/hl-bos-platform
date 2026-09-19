import { describe, expect, it } from "vitest";
import {
  highlightAcceptanceRate,
  jerseyOcrAccuracy,
  manualCorrectionRate,
  meaningfulPlayRecall,
  precisionRecall,
  scoreFrameAssignments,
  segmentationAccuracy,
} from "./metrics";

describe("precisionRecall — null means not measured, not zero", () => {
  it("computes precision, recall and F1 from real counts", () => {
    const result = precisionRecall({
      truePositives: 8,
      falsePositives: 2,
      falseNegatives: 2,
    });
    expect(result.precision).toBeCloseTo(0.8, 6);
    expect(result.recall).toBeCloseTo(0.8, 6);
    expect(result.f1).toBeCloseTo(0.8, 6);
  });

  it("returns null rather than 0 when nothing was predicted", () => {
    const result = precisionRecall({
      truePositives: 0,
      falsePositives: 0,
      falseNegatives: 4,
    });
    expect(result.precision).toBeNull();
    expect(result.recall).toBe(0);
    expect(result.f1).toBeNull();
  });

  it("returns null for recall when there was nothing to find", () => {
    const result = precisionRecall({
      truePositives: 0,
      falsePositives: 3,
      falseNegatives: 0,
    });
    expect(result.recall).toBeNull();
  });

  it("returns null F1 when precision and recall are both zero", () => {
    expect(
      precisionRecall({ truePositives: 0, falsePositives: 1, falseNegatives: 1 }).f1,
    ).toBeNull();
  });
});

describe("scoreFrameAssignments", () => {
  it("counts a correct assignment once", () => {
    const result = scoreFrameAssignments(new Map([[1, "A"]]), new Map([[1, "A"]]));
    expect(result.counts).toEqual({
      truePositives: 1,
      falsePositives: 0,
      falseNegatives: 0,
    });
  });

  it("counts the wrong player as BOTH a miss and a false claim", () => {
    // We failed to find him AND we put someone else in his reel. Two failures.
    const result = scoreFrameAssignments(new Map([[1, "B"]]), new Map([[1, "A"]]));
    expect(result.counts).toEqual({
      truePositives: 0,
      falsePositives: 1,
      falseNegatives: 1,
    });
  });

  it("ignores frames where he was genuinely absent and we said so", () => {
    const result = scoreFrameAssignments(
      new Map<number, string | null>([
        [1, null],
        [2, "A"],
      ]),
      new Map<number, string | null>([
        [1, null],
        [2, "A"],
      ]),
    );
    expect(result.counts.truePositives).toBe(1);
    expect(result.precision).toBe(1);
  });

  it("counts a claim on a frame he was not in", () => {
    const result = scoreFrameAssignments(
      new Map<number, string | null>([[1, "A"]]),
      new Map<number, string | null>([[1, null]]),
    );
    expect(result.counts.falsePositives).toBe(1);
  });
});

describe("jerseyOcrAccuracy — abstaining is not an error", () => {
  it("scores only the readings that were actually made", () => {
    const result = jerseyOcrAccuracy([
      { predicted: 23, truth: 23 },
      { predicted: null, truth: 23 },
      { predicted: null, truth: 23 },
      { predicted: 28, truth: 23 },
    ]);
    expect(result.accuracy).toBeCloseTo(0.5, 6);
    expect(result.readable).toBe(2);
    expect(result.attempted).toBe(4);
  });

  it("returns null accuracy when nothing was ever readable", () => {
    const result = jerseyOcrAccuracy([{ predicted: null, truth: 23 }]);
    expect(result.accuracy).toBeNull();
    expect(result.readable).toBe(0);
  });

  it("returns null accuracy for no readings at all", () => {
    expect(jerseyOcrAccuracy([]).accuracy).toBeNull();
  });
});

describe("segmentationAccuracy — matched by overlap, not by index", () => {
  const truth = [
    { startSeconds: 10, endSeconds: 18, snapSeconds: 11 },
    { startSeconds: 40, endSeconds: 48, snapSeconds: 41 },
    { startSeconds: 70, endSeconds: 78, snapSeconds: 71 },
  ];

  it("matches a perfect segmentation", () => {
    const result = segmentationAccuracy(
      truth.map((t) => ({ ...t, snapSeconds: t.snapSeconds })),
      truth,
    );
    expect(result.matched).toBe(3);
    expect(result.missed).toBe(0);
    expect(result.spurious).toBe(0);
    expect(result.meanSnapErrorSeconds).toBe(0);
  });

  it("does not cascade one missed play into three failures", () => {
    const detected = [truth[0], truth[2]]
      .filter((x) => x !== undefined)
      .map((t) => ({ ...t }));
    const result = segmentationAccuracy(detected, truth);
    expect(result.matched).toBe(2);
    expect(result.missed).toBe(1);
    expect(result.spurious).toBe(0);
  });

  it("counts an invented play as spurious", () => {
    const detected = [
      ...truth,
      { startSeconds: 100, endSeconds: 108, snapSeconds: 101 },
    ];
    const result = segmentationAccuracy(detected, truth);
    expect(result.spurious).toBe(1);
  });

  it("reports mean snap error only over matched plays", () => {
    const detected = truth.map((t) => ({ ...t, snapSeconds: t.snapSeconds + 0.4 }));
    expect(segmentationAccuracy(detected, truth).meanSnapErrorSeconds).toBeCloseTo(
      0.4,
      6,
    );
  });

  it("reports null snap error when no detected play carried a snap", () => {
    const detected = truth.map((t) => ({ ...t, snapSeconds: null }));
    expect(segmentationAccuracy(detected, truth).meanSnapErrorSeconds).toBeNull();
  });

  it("does not match plays that barely touch", () => {
    const detected = [{ startSeconds: 17, endSeconds: 25, snapSeconds: 18 }];
    expect(segmentationAccuracy(detected, truth).matched).toBe(0);
  });
});

describe("the product metrics", () => {
  it("returns null for meaningful-play recall until a human has labelled the plays", () => {
    expect(meaningfulPlayRecall(0, 0)).toBeNull();
    expect(meaningfulPlayRecall(18, 24)).toBeCloseTo(0.75, 6);
  });

  it("computes the correction rate over reviewed plays, not all plays", () => {
    expect(manualCorrectionRate(3, 20).rate).toBeCloseTo(0.15, 6);
    expect(manualCorrectionRate(0, 0).rate).toBeNull();
  });

  it("computes highlight acceptance only once something was proposed", () => {
    expect(highlightAcceptanceRate(9, 12)).toBeCloseTo(0.75, 6);
    expect(highlightAcceptanceRate(0, 0)).toBeNull();
  });
});
