/**
 * How a model's confidence is shown to a coach.
 *
 * A coach on a Saturday morning does not act differently on 0.82 than on 0.79,
 * so showing three decimal places implies a precision the model does not have
 * and invites the number to be read as a fact. Bands say what the number is
 * for: how hard should I look at this before I accept it?
 */

export type ConfidenceBand = "high" | "moderate" | "low";

export interface ConfidenceDisplay {
  readonly band: ConfidenceBand;
  readonly label: string;
  /** Whole percent, for the one place a number is genuinely wanted. */
  readonly percent: number;
  /** What the coach should do with it. */
  readonly guidance: string;
}

export function describeConfidence(confidence: number): ConfidenceDisplay {
  const clamped = Math.min(1, Math.max(0, confidence));
  const percent = Math.round(clamped * 100);

  if (clamped >= 0.85) {
    return {
      band: "high",
      label: "High confidence",
      percent,
      guidance: "Still a suggestion. Confirm before it becomes team data.",
    };
  }
  if (clamped >= 0.6) {
    return {
      band: "moderate",
      label: "Moderate confidence",
      percent,
      guidance: "Check the film before accepting.",
    };
  }
  return {
    band: "low",
    label: "Low confidence",
    percent,
    guidance: "Treat as a prompt to look, not as a reading.",
  };
}

/**
 * Never true. A model suggestion does not become team data without a coach,
 * and this function exists so that rule has one name in the codebase rather
 * than being re-argued at every call site.
 */
export function canAutoConfirm(): false {
  return false;
}
