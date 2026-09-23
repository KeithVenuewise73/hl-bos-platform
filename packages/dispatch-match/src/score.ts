// The composite score. Deliberately simple and fully visible: two components,
// each a linear ramp between a floor and a target the fleet sets, blended by
// weights the fleet sets. No hidden normalisation against "the other loads in
// the list" — a score of 70 means the same thing tomorrow as it does today.

import type { ScoreBreakdown, ScoreConfig } from "./types";

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

function ramp(value: number, floor: number, target: number): number {
  if (target <= floor) return value >= target ? 1 : 0;
  return clamp01((value - floor) / (target - floor));
}

export function computeScore(
  contribution: number,
  revenuePerTotalMile: number,
  c: ScoreConfig,
): ScoreBreakdown {
  const wc = Math.max(0, c.contributionWeight);
  const wr = Math.max(0, c.revenuePerMileWeight);
  const wSum = wc + wr;
  const C = ramp(contribution, c.contributionFloor, c.contributionTarget);
  const R = ramp(revenuePerTotalMile, c.revenuePerMileFloor, c.revenuePerMileTarget);
  const raw = wSum > 0 ? (wc * C + wr * R) / wSum : 0;
  const score = Math.round(raw * 100);
  const nwc = wSum > 0 ? wc / wSum : 0;
  const nwr = wSum > 0 ? wr / wSum : 0;
  return {
    score,
    contributionUsed: contribution,
    contributionComponent: C,
    revenuePerMileComponent: R,
    explanation:
      `100 × (${nwc.toFixed(2)} × ${C.toFixed(2)} + ${nwr.toFixed(2)} × ${R.toFixed(2)}) = ${score}` +
      ` — C from $${Math.round(contribution)} contribution, R from $${revenuePerTotalMile.toFixed(2)}/total mile`,
  };
}
