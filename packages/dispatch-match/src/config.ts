// Default assumptions. Every one of these is shown in the UI and adjustable.
// They are planning figures for a Class 8 tractor in 2026, not measurements
// from any fleet's books — replace them with the fleet's own numbers.

import type { MatchConfig, ScoreConfig } from "./types";

export const DEFAULT_SCORE_CONFIG: ScoreConfig = {
  contributionWeight: 0.6,
  revenuePerMileWeight: 0.4,
  contributionFloor: 0,
  contributionTarget: 1000,
  revenuePerMileFloor: 1.0,
  revenuePerMileTarget: 3.5,
};

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  fuelCostPerMile: 0.68,
  overheadPerMile: 0.45,
  averageMph: 50,
  roadCircuityFactor: 1.2,
  dwellHoursPerStop: 1.5,
  maxDrivingHoursPerShift: 11,
  restHoursBetweenShifts: 10,
  hoursPerDriverDay: 10,
  contributionBasis: "full-trip",
  minLaneHistoryWeeks: 8,
  score: DEFAULT_SCORE_CONFIG,
};

/** The scoring formula in words — rendered verbatim in the UI. */
export function describeScoreFormula(c: ScoreConfig): string {
  const wSum = c.contributionWeight + c.revenuePerMileWeight;
  const wc = wSum > 0 ? c.contributionWeight / wSum : 0;
  const wr = wSum > 0 ? c.revenuePerMileWeight / wSum : 0;
  return (
    `score = 100 × (${wc.toFixed(2)} × C + ${wr.toFixed(2)} × R)\n` +
    `C = clamp((contribution − $${c.contributionFloor}) ÷ ($${c.contributionTarget} − $${c.contributionFloor}), 0, 1)\n` +
    `R = clamp((revenue per total mile − $${c.revenuePerMileFloor.toFixed(2)}) ÷ ($${c.revenuePerMileTarget.toFixed(2)} − $${c.revenuePerMileFloor.toFixed(2)}), 0, 1)`
  );
}
