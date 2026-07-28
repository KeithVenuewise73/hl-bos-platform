// Deterministic HL-BTI executive scoring engine — the edge mirror of the DB
// authority `bti.compute_scores`. Same inputs must yield the same numbers in
// TypeScript and PostgreSQL, or it is a bug.
//
// Per-domain score = weighted mean of 0-5 ratings, scaled to 0-100.
// The 7 executive scores map each named domain to its rolled-up score; the
// Transformation Score is the weighted mean of the domain scores present,
// weighted by each domain's transformation_weight.
//
// Honesty rule (platform principle 10): a domain with NO ratings yields null —
// never a fabricated number. AI plays no part here.

export const BTI_SCORING_VERSION = "bti-scoring-0.1.0";

export type DomainKey =
  "business" | "operations" | "growth" | "technology" | "ai_readiness" | "financial";

export interface DimensionRating {
  domain: DomainKey;
  dimension: string;
  rating: number; // 0-5
  weight: number; // dimension weight (> 0)
}

export interface DomainWeight {
  domain: DomainKey;
  transformationWeight: number; // > 0
}

export interface ExecutiveScorecard {
  domainScores: Partial<Record<DomainKey, number>>; // 0-100, only for rated domains
  businessHealth: number | null;
  operations: number | null;
  growth: number | null;
  technology: number | null;
  aiReadiness: number | null;
  financialOpportunity: number | null;
  transformation: number | null;
}

// PostgreSQL round() is round-half-away-from-zero; Math.round is half-up.
// All values here are non-negative, so half-away-from-zero == half-up.
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

  // Transformation Score: weighted mean of the domain scores present.
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
    domainScores[d] === undefined ? null : (domainScores[d] as number);

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
