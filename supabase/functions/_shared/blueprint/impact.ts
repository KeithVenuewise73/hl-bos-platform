// Assumption-based impact / ROI model (Business Transformation Blueprint).
//
// Never fabricates customer revenue and never claims a guaranteed outcome.
// Every estimate carries its assumption, input source, calculation method, a
// low/expected/high scenario, a confidence, and caveats. When no customer
// financial input exists, the estimate is QUALITATIVE and explicitly marked
// illustrative — an honest "we can't measure this yet" beats a fabricated ROI.

export const IMPACT_MODEL_VERSION = "impact-0.1.0";

export type ImpactCategory =
  | "lead_generation"
  | "conversion"
  | "time_savings"
  | "administrative_reduction"
  | "missed_opportunity_recovery"
  | "customer_retention"
  | "review_volume"
  | "response_time"
  | "scheduling_efficiency"
  | "revenue_readiness"
  | "risk_reduction";

export interface ImpactInput {
  category: ImpactCategory;
  assumption: string;
  /** Customer-provided numeric inputs, if any (e.g. monthly visitors). Absent ⇒ illustrative. */
  financialInputs?: Record<string, number>;
  /** A pure function of financialInputs → {low, expected, high} numeric outcomes. */
  compute?: (inputs: Record<string, number>) => {
    low: number;
    expected: number;
    high: number;
    unit: string;
  };
  confidence?: number;
  caveats?: string;
}

export interface ImpactEstimate {
  category: ImpactCategory;
  assumption: string;
  inputSource: "evidence" | "profile" | "illustrative";
  calculationMethod: string;
  scenarioLow: string;
  scenarioExpected: string;
  scenarioHigh: string;
  confidence: number;
  illustrative: boolean;
  caveats: string;
  modelVersion: string;
}

const GUARANTEE_WORDS = /\b(guarantee|guaranteed|guarantees)\b/i;

/** Produce a single, honest impact estimate. */
export function estimateImpact(input: ImpactInput): ImpactEstimate {
  const hasInputs =
    !!input.financialInputs &&
    Object.keys(input.financialInputs).length > 0 &&
    !!input.compute;

  if (hasInputs) {
    const r = input.compute!(input.financialInputs!);
    return {
      category: input.category,
      assumption: input.assumption,
      inputSource: "profile",
      calculationMethod: `Computed from customer inputs (${Object.keys(input.financialInputs!).join(", ")}).`,
      scenarioLow: `${r.low} ${r.unit}`,
      scenarioExpected: `${r.expected} ${r.unit}`,
      scenarioHigh: `${r.high} ${r.unit}`,
      confidence: clampConfidence(input.confidence ?? 0.6),
      illustrative: false,
      caveats: sanitizeCaveats(
        input.caveats ?? "Estimates depend on the accuracy of the inputs provided.",
      ),
      modelVersion: IMPACT_MODEL_VERSION,
    };
  }

  // No customer financial input: qualitative, illustrative, clearly labelled.
  return {
    category: input.category,
    assumption: input.assumption,
    inputSource: "illustrative",
    calculationMethod: "Qualitative — no customer financial data available.",
    scenarioLow: "Modest improvement",
    scenarioExpected: "Meaningful improvement",
    scenarioHigh: "Substantial improvement",
    confidence: clampConfidence(input.confidence ?? 0.35),
    illustrative: true,
    caveats: sanitizeCaveats(
      input.caveats ??
        "Illustrative only. No customer financial data was provided; actual results will vary and are not guaranteed.",
    ),
    modelVersion: IMPACT_MODEL_VERSION,
  };
}

function clampConfidence(c: number): number {
  return Math.max(0, Math.min(1, c));
}

// A caveat must never promise a guaranteed outcome, even if a caller passed one.
function sanitizeCaveats(caveats: string): string {
  if (GUARANTEE_WORDS.test(caveats)) {
    return (
      caveats.replace(GUARANTEE_WORDS, "estimated") + " (outcomes are not guaranteed)"
    );
  }
  return caveats;
}

/** True if the text makes a guaranteed-outcome claim (used to reject AI text). */
export function claimsGuarantee(text: string): boolean {
  return GUARANTEE_WORDS.test(text);
}
