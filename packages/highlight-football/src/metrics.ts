/**
 * AI quality metrics (brief section 46).
 *
 * THE RULE THAT GOVERNS THIS FILE: every function here requires labelled
 * ground truth, and none of them will produce a number without it.
 *
 * That is a deliberate constraint, not an oversight. Metrics computed against
 * the model's own output measure nothing — they report how confident the model
 * is, dressed up as how correct it is — and a dashboard full of those is worse
 * than a dashboard with none, because it looks like evidence. HL-BOS principle
 * 10 forbids inventing AI results and operational metrics, and a fabricated
 * accuracy figure is both at once.
 *
 * So the truth comes from exactly two places: the test fixtures, which are
 * labelled by construction, and user corrections, which are labelled by a human
 * who was there. `null` is a legitimate return value everywhere below and means
 * "not measured", which the UI must render as those words.
 */

export interface ClassificationCounts {
  readonly truePositives: number;
  readonly falsePositives: number;
  readonly falseNegatives: number;
}

export interface PrecisionRecall {
  readonly precision: number | null;
  readonly recall: number | null;
  readonly f1: number | null;
  readonly counts: ClassificationCounts;
}

/**
 * Precision and recall for "did we find the selected athlete".
 *
 * Returns null rather than 0 when the denominator is empty. Precision of 0 on
 * zero predictions is a false statement about a model that has not been asked
 * anything yet.
 */
export function precisionRecall(counts: ClassificationCounts): PrecisionRecall {
  const { truePositives: tp, falsePositives: fp, falseNegatives: fn } = counts;
  const precision = tp + fp === 0 ? null : tp / (tp + fp);
  const recall = tp + fn === 0 ? null : tp / (tp + fn);
  const f1 =
    precision === null || recall === null || precision + recall === 0
      ? null
      : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1, counts };
}

/**
 * Compare per-frame assignments against truth.
 *
 * A frame where truth says the athlete is present and we assigned a DIFFERENT
 * track counts as both a false positive and a false negative. That is harsher
 * than counting it once, and correctly so: we both missed him and put someone
 * else in his reel.
 */
export function scoreFrameAssignments(
  assigned: ReadonlyMap<number, string | null>,
  truth: ReadonlyMap<number, string | null>,
): PrecisionRecall {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  const frames = new Set([...assigned.keys(), ...truth.keys()]);
  for (const f of frames) {
    const a = assigned.get(f) ?? null;
    const t = truth.get(f) ?? null;
    if (a === null && t === null) continue;
    if (a !== null && t !== null && a === t) {
      tp += 1;
      continue;
    }
    if (a !== null) fp += 1;
    if (t !== null) fn += 1;
  }
  return precisionRecall({ truePositives: tp, falsePositives: fp, falseNegatives: fn });
}

export interface OcrAccuracy {
  readonly accuracy: number | null;
  readonly readable: number;
  readonly attempted: number;
  readonly correct: number;
}

/**
 * Jersey OCR accuracy over readings the recogniser actually made.
 *
 * Unreadable frames are reported separately as `readable / attempted` rather
 * than folded into accuracy. Counting an abstention as an error would punish
 * the recogniser for the honesty this system depends on, and would push it
 * toward guessing.
 */
export function jerseyOcrAccuracy(
  readings: ReadonlyArray<{ predicted: number | null; truth: number }>,
): OcrAccuracy {
  const attempted = readings.length;
  const made = readings.filter((r) => r.predicted !== null);
  const correct = made.filter((r) => r.predicted === r.truth).length;
  return {
    accuracy: made.length === 0 ? null : correct / made.length,
    readable: made.length,
    attempted,
    correct,
  };
}

export interface SegmentationAccuracy {
  readonly matched: number;
  readonly missed: number;
  readonly spurious: number;
  /** Mean absolute snap error in seconds, over matched plays only. */
  readonly meanSnapErrorSeconds: number | null;
}

/**
 * Compare detected plays against a labelled play list.
 *
 * Matching is by temporal overlap rather than by index, because a single missed
 * play would otherwise shift every subsequent comparison and report a total
 * failure where there was one error.
 */
export function segmentationAccuracy(
  detected: ReadonlyArray<{
    startSeconds: number;
    endSeconds: number;
    snapSeconds: number | null;
  }>,
  truth: ReadonlyArray<{
    startSeconds: number;
    endSeconds: number;
    snapSeconds: number;
  }>,
  minOverlap = 0.3,
): SegmentationAccuracy {
  const usedDetected = new Set<number>();
  let matched = 0;
  const snapErrors: number[] = [];

  for (const t of truth) {
    let bestIdx = -1;
    let bestOverlap = 0;
    detected.forEach((d, i) => {
      if (usedDetected.has(i)) return;
      const overlap = Math.max(
        0,
        Math.min(d.endSeconds, t.endSeconds) - Math.max(d.startSeconds, t.startSeconds),
      );
      const union =
        Math.max(d.endSeconds, t.endSeconds) - Math.min(d.startSeconds, t.startSeconds);
      const ratio = union > 0 ? overlap / union : 0;
      if (ratio > bestOverlap) {
        bestOverlap = ratio;
        bestIdx = i;
      }
    });
    if (bestIdx >= 0 && bestOverlap >= minOverlap) {
      usedDetected.add(bestIdx);
      matched += 1;
      const d = detected[bestIdx];
      if (d?.snapSeconds != null)
        snapErrors.push(Math.abs(d.snapSeconds - t.snapSeconds));
    }
  }

  return {
    matched,
    missed: truth.length - matched,
    spurious: detected.length - usedDetected.size,
    meanSnapErrorSeconds:
      snapErrors.length === 0
        ? null
        : snapErrors.reduce((a, b) => a + b, 0) / snapErrors.length,
  };
}

/**
 * The product metric the brief says should eventually matter most:
 * what share of the athlete's meaningful plays did HighlightAI find?
 *
 * `meaningfulPlaysFound / meaningfulPlaysTotal`, and it needs a human to have
 * said which plays were meaningful. Until someone has, it returns null — which
 * is the true state of the measurement, and is what the UI must display.
 */
export function meaningfulPlayRecall(
  meaningfulPlaysFound: number,
  meaningfulPlaysTotal: number,
): number | null {
  if (meaningfulPlaysTotal <= 0) return null;
  return meaningfulPlaysFound / meaningfulPlaysTotal;
}

export interface CorrectionRate {
  readonly rate: number | null;
  readonly corrected: number;
  readonly reviewed: number;
}

/** Manual correction rate: how often a human had to fix us, over the plays a
 *  human actually looked at. Over all plays it would flatter us by counting
 *  every unreviewed play as a success. */
export function manualCorrectionRate(
  corrected: number,
  reviewed: number,
): CorrectionRate {
  return { rate: reviewed <= 0 ? null : corrected / reviewed, corrected, reviewed };
}

/** Highlight acceptance rate: of the clips we proposed, how many were kept. */
export function highlightAcceptanceRate(
  accepted: number,
  proposed: number,
): number | null {
  return proposed <= 0 ? null : accepted / proposed;
}
