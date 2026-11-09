// Growth Intelligence Feedback: what is working, from evidence only.
//
// Every finding states its sample size. Below the minimum sample, a finding is
// reported as "not enough evidence yet" instead of a conclusion — three deals
// do not make a trend. Every recommendation is a proposal for a person: any
// change to external marketing, a software deployment or a budget increase
// goes through the approval gate (approval.ts).

import { assertOwner, type Principal } from "./isolation.ts";
import type { OpportunityReview } from "./review.ts";
import type { BusinessLine, Channel, GrowthEvent } from "./types.ts";

export const MIN_SAMPLE = 5;

export interface RateFinding {
  label: string;
  attempts: number;
  wins: number;
  rate: number | null;
  sufficient: boolean;
}

export interface CountFinding {
  label: string;
  count: number;
}

export interface FeedbackReport {
  line: BusinessLine | "consolidated";
  minSample: number;
  industryConversion: RateFinding[];
  channelConversion: RateFinding[];
  offerConversion: RateFinding[];
  frequentProblems: CountFinding[];
  servicesSold: CountFinding[];
  lostReasons: CountFinding[];
  objections: CountFinding[];
  requestedCapabilities: CountFinding[];
  recommendations: FeedbackRecommendation[];
  demoRecordsExcluded: number;
}

export interface FeedbackRecommendation {
  kind: "marketing" | "product" | "offer";
  text: string;
  evidence: string;
  /** Always true — nothing here changes anything on its own. */
  requiresApproval: true;
}

function rates(
  groups: Map<string, { attempts: Set<string>; wins: Set<string> }>,
): RateFinding[] {
  return [...groups.entries()]
    .map(([label, g]) => {
      const attempts = g.attempts.size;
      const wins = [...g.wins].filter((w) => g.attempts.has(w)).length;
      return {
        label,
        attempts,
        wins,
        rate: attempts === 0 ? null : wins / attempts,
        sufficient: attempts >= MIN_SAMPLE,
      };
    })
    .sort(
      (a, b) =>
        Number(b.sufficient) - Number(a.sufficient) || (b.rate ?? -1) - (a.rate ?? -1),
    );
}

function counts(xs: string[]): CountFinding[] {
  const m = new Map<string, number>();
  for (const x of xs) {
    const k = x.trim().toLowerCase();
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

export function feedbackReport(
  p: Principal,
  scope: BusinessLine | "consolidated",
  allEvents: readonly GrowthEvent[],
  allReviews: readonly OpportunityReview[],
): FeedbackReport {
  assertOwner(p);
  const scoped = allEvents.filter((e) => scope === "consolidated" || e.line === scope);
  const events = scoped.filter((e) => !e.isDemo);
  const reviews = allReviews.filter(
    (r) => scope === "consolidated" || r.line === scope,
  );

  const byIndustry = new Map<string, { attempts: Set<string>; wins: Set<string> }>();
  const byChannel = new Map<Channel, { attempts: Set<string>; wins: Set<string> }>();
  const byOffer = new Map<string, { attempts: Set<string>; wins: Set<string> }>();
  for (const e of events) {
    if (e.kind === "proposal_sent") {
      const ind = e.industry ?? "unknown industry";
      const gi = byIndustry.get(ind) ?? { attempts: new Set(), wins: new Set() };
      gi.attempts.add(e.leadId);
      byIndustry.set(ind, gi);
      const gc = byChannel.get(e.channel) ?? { attempts: new Set(), wins: new Set() };
      gc.attempts.add(e.leadId);
      byChannel.set(e.channel, gc);
      for (const s of e.services ?? []) {
        const go = byOffer.get(s) ?? { attempts: new Set(), wins: new Set() };
        go.attempts.add(e.leadId);
        byOffer.set(s, go);
      }
    }
  }
  for (const e of events) {
    if (e.kind !== "agreement_signed") continue;
    byIndustry.get(e.industry ?? "unknown industry")?.wins.add(e.leadId);
    for (const g of byChannel.values())
      if (g.attempts.has(e.leadId)) g.wins.add(e.leadId);
    for (const s of e.services ?? []) byOffer.get(s)?.wins.add(e.leadId);
  }

  const industryConversion = rates(byIndustry);
  const channelConversion = rates(byChannel);
  const offerConversion = rates(byOffer);
  const frequentProblems = counts(
    reviews.flatMap((r) =>
      r.observed.filter((f) => f.status !== "present").map((f) => f.label),
    ),
  );
  const servicesSold = counts(
    events
      .filter((e) => e.kind === "agreement_signed")
      .flatMap((e) => e.services ?? []),
  );
  const lostReasons = counts(
    events
      .filter((e) => e.kind === "deal_lost")
      .map((e) => e.lostReason ?? "no reason recorded"),
  );
  const objections = counts(
    events.filter((e) => e.kind === "objection_recorded").map((e) => e.note ?? ""),
  );
  const requestedCapabilities = counts(
    events.filter((e) => e.kind === "capability_requested").map((e) => e.note ?? ""),
  );

  const recommendations: FeedbackRecommendation[] = [];
  const solid = (xs: RateFinding[]) =>
    xs.filter((x) => x.sufficient && x.rate !== null);
  const bestIndustry = solid(industryConversion)[0];
  if (bestIndustry && bestIndustry.rate !== null && bestIndustry.wins > 0)
    recommendations.push({
      kind: "marketing",
      text: `Focus discovery on ${bestIndustry.label}.`,
      evidence: `${bestIndustry.wins} of ${bestIndustry.attempts} proposals signed.`,
      requiresApproval: true,
    });
  for (const o of solid(offerConversion).filter((x) => x.wins === 0))
    recommendations.push({
      kind: "offer",
      text: `Review the "${o.label}" offer: it has not sold.`,
      evidence: `0 of ${o.attempts} proposals that included it signed.`,
      requiresApproval: true,
    });
  for (const c of requestedCapabilities.filter((x) => x.count >= MIN_SAMPLE))
    recommendations.push({
      kind: "product",
      text: `Consider building: ${c.label}.`,
      evidence: `Requested by ${c.count} prospects or customers.`,
      requiresApproval: true,
    });
  const topLost = lostReasons[0];
  if (topLost && topLost.count >= MIN_SAMPLE)
    recommendations.push({
      kind: "offer",
      text: `Address the most common reason deals are lost: "${topLost.label}".`,
      evidence: `${topLost.count} lost deals.`,
      requiresApproval: true,
    });

  return {
    line: scope,
    minSample: MIN_SAMPLE,
    industryConversion,
    channelConversion,
    offerConversion,
    frequentProblems,
    servicesSold,
    lostReasons,
    objections,
    requestedCapabilities,
    recommendations,
    demoRecordsExcluded: scoped.length - events.length,
  };
}
