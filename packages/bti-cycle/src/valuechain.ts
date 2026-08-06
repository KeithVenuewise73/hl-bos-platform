/**
 * Stage 2 & 4 — the value chain and its analysis.
 *
 * BTI models every business as a flow (Reasoning Framework §3.2). This module
 * classifies each link as a strength, a gap, or unknown, based only on the
 * evidence actually held — and maps each link to the business OUTCOMES that
 * would relieve a constraint there. The map contains outcomes only; never a
 * product. That firewall is what stops BTI degenerating into a software
 * up-sell engine.
 */

import { effectiveTier } from "./confidence.ts";
import type {
  EvidenceItem,
  LinkAnalysis,
  QualityTier,
  ValueChainLink,
} from "./types.ts";
import { VALUE_CHAIN } from "./types.ts";

/** Candidate outcomes (never products) that relieve a constraint at each link. */
export const LINK_OUTCOMES: Record<ValueChainLink, readonly string[]> = {
  demand: [
    "Increase Local Visibility",
    "Increase Marketing Reach",
    "Expand Service Area",
    "Increase Referral Volume",
  ],
  capture: [
    "Recover Missed Opportunities",
    "Improve Website Conversion",
    "Add Frictionless Booking",
  ],
  response: ["Reduce Response Time", "Achieve 24/7 Coverage"],
  conversion: [
    "Increase Lead Conversion",
    "Improve the Quote-to-Close Process",
    "Strengthen Sales Follow-up",
  ],
  fulfillment: [
    "Increase Throughput of Existing Demand",
    "Reduce Administrative Labor",
    "Improve Dispatch / Routing",
    "Increase Technician Productivity",
  ],
  retention: [
    "Improve Customer Experience",
    "Increase Repeat & Referral Revenue",
    "Increase Recurring Revenue",
  ],
  margin: ["Improve Margin / Pricing", "Reduce Costs", "Improve Cash Flow"],
} as const;

/** Evidence that speaks to a given link (context facts are excluded). */
export function evidenceForLink(
  evidence: readonly EvidenceItem[],
  link: ValueChainLink,
): EvidenceItem[] {
  return evidence.filter((e) => e.link === link);
}

/**
 * Classify one link. A link is:
 *   - `unknown` when there is no usable evidence for it,
 *   - `strength` when its usable evidence is positive (a `strong` marker),
 *   - `gap`     when its usable evidence is negative (a `weak` marker),
 * where the marker is carried on the fact text via a leading "[strong]" /
 * "[weak]" tag set by the evidence author. Absent a tag, evidence only tells us
 * the link is *observed*, not whether it is good or bad → still unknown-signal.
 */
export function analyzeLink(
  evidence: readonly EvidenceItem[],
  link: ValueChainLink,
  asOf: string,
): LinkAnalysis {
  const items = evidenceForLink(evidence, link).filter(
    (e) => effectiveTier(e, asOf) !== "unknown",
  );

  if (items.length === 0) {
    return {
      link,
      status: "unknown",
      rationale: `No usable evidence for the ${link} link.`,
      confidence: "unknown",
    };
  }

  const strong = items.filter((e) => e.fact.startsWith("[strong]"));
  const weak = items.filter((e) => e.fact.startsWith("[weak]"));

  // Strongest tier available on this link.
  const best: QualityTier = items
    .map((e) => effectiveTier(e, asOf))
    .reduce((acc, t) => (rank(t) < rank(acc) ? t : acc), "unknown" as QualityTier);

  if (weak.length > 0 && strong.length === 0) {
    const gap = weak.find((e) => e.value !== undefined);
    return {
      link,
      status: "gap",
      rationale: weak.map((e) => e.fact.replace("[weak] ", "")).join(" "),
      confidence: best,
      ...(gap?.value !== undefined ? { dollarGapPerMonth: gap.value } : {}),
    };
  }

  if (strong.length > 0 && weak.length === 0) {
    return {
      link,
      status: "strength",
      rationale: strong.map((e) => e.fact.replace("[strong] ", "")).join(" "),
      confidence: best,
    };
  }

  // Mixed or untagged usable evidence: observed but signal-neutral.
  return {
    link,
    status: "unknown",
    rationale: `Evidence exists for ${link} but does not establish it as a strength or a gap.`,
    confidence: best,
  };
}

const RANK: Record<QualityTier, number> = {
  verified: 0,
  observed: 1,
  estimated: 2,
  assumed: 3,
  unknown: 4,
};
function rank(t: QualityTier): number {
  return RANK[t];
}

/** Analyze the whole chain, in flow order. */
export function analyzeChain(
  evidence: readonly EvidenceItem[],
  asOf: string,
): LinkAnalysis[] {
  return VALUE_CHAIN.map((link) => analyzeLink(evidence, link, asOf));
}
