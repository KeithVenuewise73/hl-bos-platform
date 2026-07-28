// Deterministic HL-BTI executive scoring — the canonical mirror of the DB
// authority `bti.compute_scores` and the edge layer `_shared/bti/scoring.ts`.
// Same inputs must yield the same numbers everywhere, or it is a bug.
//
// Honesty: a domain with NO ratings yields null — never a fabricated number.

import type { DomainKey } from "./types.ts";

export interface DimensionRating {
  domain: DomainKey;
  dimension: string;
  rating: number; // 0-5
  weight: number; // > 0
}

export interface DomainWeight {
  domain: DomainKey;
  transformationWeight: number;
}

export interface ExecutiveScorecard {
  domainScores: Partial<Record<DomainKey, number>>;
  businessHealth: number | null;
  operations: number | null;
  growth: number | null;
  technology: number | null;
  aiReadiness: number | null;
  financialOpportunity: number | null;
  transformation: number | null;
}

// PostgreSQL round() is half-away-from-zero; all values are non-negative here,
// so Math.round (half-up) is identical.
function pgRound(n: number): number {
  return Math.round(n);
}

function domainScore(ratings: DimensionRating[]): number | null {
  if (ratings.length === 0) return null;
  let num = 0;
  let den = 0;
  for (const r of ratings) {
    num += r.rating * r.weight;
    den += r.weight;
  }
  if (den === 0) return null;
  return pgRound((num / den / 5) * 100);
}

export function computeScorecard(
  ratings: DimensionRating[],
  domainWeights: DomainWeight[],
): ExecutiveScorecard {
  const byDomain = new Map<DomainKey, DimensionRating[]>();
  for (const r of ratings) {
    const arr = byDomain.get(r.domain) ?? [];
    arr.push(r);
    byDomain.set(r.domain, arr);
  }

  const domainScores: Partial<Record<DomainKey, number>> = {};
  for (const [domain, rs] of byDomain) {
    const s = domainScore(rs);
    if (s !== null) domainScores[domain] = s;
  }

  const weightOf = new Map<DomainKey, number>(
    domainWeights.map((d) => [d.domain, d.transformationWeight]),
  );
  let tNum = 0;
  let tDen = 0;
  for (const [domain, score] of Object.entries(domainScores) as [DomainKey, number][]) {
    const w = weightOf.get(domain) ?? 0;
    tNum += score * w;
    tDen += w;
  }
  const transformation = tDen === 0 ? null : pgRound(tNum / tDen);

  const pick = (d: DomainKey): number | null =>
    domainScores[d] === undefined ? null : domainScores[d];

  return {
    domainScores,
    businessHealth: pick("business"),
    operations: pick("operations"),
    growth: pick("growth"),
    technology: pick("technology"),
    aiReadiness: pick("ai_readiness"),
    financialOpportunity: pick("financial"),
    transformation,
  };
}
