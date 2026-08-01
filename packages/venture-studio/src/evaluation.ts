/**
 * Structured evaluation — reference dimensions + aggregation.
 *
 * The dimensions are deterministic reference data (not a DB table). A score for
 * a dimension is 0–100 and carries its own methodology/confidence/status via the
 * `DimensionScore` shape. Aggregation is a simple, explainable weighted mean over
 * the dimensions that were actually scored — an unscored dimension does NOT count
 * as zero (honesty: absent ≠ 0).
 */

import type { Confidence, MetricStatus } from "./types";

export const EVALUATION_DIMENSIONS = [
  { key: "market_pain", label: "Market pain", weight: 1.2 },
  { key: "revenue_potential", label: "Revenue potential", weight: 1.2 },
  { key: "time_to_revenue", label: "Time to revenue", weight: 1.0 },
  { key: "strategic_fit", label: "Strategic fit", weight: 1.3 },
  { key: "competitive_pressure", label: "Competitive pressure", weight: 0.8 },
  { key: "implementation_difficulty", label: "Implementation difficulty", weight: 1.0 },
  { key: "ai_leverage", label: "AI leverage", weight: 1.0 },
  { key: "cross_product_leverage", label: "Cross-product leverage", weight: 1.1 },
  { key: "acquisition_suitability", label: "Acquisition suitability", weight: 0.7 },
  { key: "regulatory_risk", label: "Regulatory / legal risk", weight: 0.9 },
  { key: "evidence_quality", label: "Evidence quality", weight: 1.0 },
] as const;

export type DimensionKey = (typeof EVALUATION_DIMENSIONS)[number]["key"];

export const DIMENSION_KEYS: readonly DimensionKey[] = EVALUATION_DIMENSIONS.map(
  (d) => d.key,
);

export function isDimensionKey(v: unknown): v is DimensionKey {
  return typeof v === "string" && DIMENSION_KEYS.includes(v as DimensionKey);
}

export interface DimensionScore {
  dimension: DimensionKey;
  /** 0–100. */
  score: number;
  status: MetricStatus;
  confidence: Confidence;
  /** How this score was arrived at (required — no bare numbers). */
  methodology: string;
  evidenceBasis: string;
}

export interface EvaluationSummary {
  /** Weighted mean over scored dimensions only (0–100), or null if none scored. */
  composite: number | null;
  scoredCount: number;
  totalDimensions: number;
  /** Overall confidence = lowest confidence among scored dimensions. */
  confidence: Confidence | null;
  /** True only when every dimension has a real (non-unknown) score. */
  complete: boolean;
}

const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

const WEIGHT: Record<DimensionKey, number> = Object.fromEntries(
  EVALUATION_DIMENSIONS.map((d) => [d.key, d.weight]),
) as Record<DimensionKey, number>;

/**
 * Aggregate scored dimensions into a composite. Unknown-status dimensions are
 * ignored (not treated as 0). Returns null composite when nothing real is scored.
 */
export function summarizeEvaluation(scores: DimensionScore[]): EvaluationSummary {
  const real = scores.filter((s) => s.status !== "unknown");
  const total = EVALUATION_DIMENSIONS.length;

  if (real.length === 0) {
    return {
      composite: null,
      scoredCount: 0,
      totalDimensions: total,
      confidence: null,
      complete: false,
    };
  }

  let weighted = 0;
  let weightSum = 0;
  let minConf: Confidence = "high";
  for (const s of real) {
    const w = WEIGHT[s.dimension];
    weighted += s.score * w;
    weightSum += w;
    if (CONFIDENCE_RANK[s.confidence] < CONFIDENCE_RANK[minConf])
      minConf = s.confidence;
  }

  return {
    composite: weightSum === 0 ? null : Math.round(weighted / weightSum),
    scoredCount: real.length,
    totalDimensions: total,
    confidence: minConf,
    complete: real.length === total,
  };
}
