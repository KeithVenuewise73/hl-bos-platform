/**
 * Startup value-chain analysis — Step 2 & 4.
 *
 * Reuses the BTI confidence machine (`effectiveTier`) verbatim: a link's status
 * is decided only from usable evidence, and evidence tagged `[strong]`/`[weak]`
 * declares whether it is a strength or a gap. Untagged usable evidence is
 * signal-neutral (observed but not judged) — the engine never infers "good" or
 * "bad" on its own.
 *
 * The outcome library holds STARTUP TRANSFORMATIONS (business outcomes), never
 * products. This is the firewall that keeps BTI from recommending "build more
 * software".
 */

import { effectiveTier } from "@hl-bos/bti-cycle";
import type {
  QualityTier,
  StartupEvidence,
  StartupLink,
  StartupLinkAnalysis,
} from "./types.ts";
import { STARTUP_CHAIN } from "./types.ts";

/** Candidate startup transformations per link — outcomes, never products. */
export const LINK_OUTCOMES: Record<StartupLink, readonly string[]> = {
  problem: ["Sharpen the problem definition to one urgent, payable pain"],
  customer: [
    "Define one specific first customer and buying trigger",
    "Validate the target customer with real conversations",
  ],
  solution: ["Narrow the solution to the one outcome the first customer will pay for"],
  product: ["Turn one existing capability into a sellable entry product"],
  activation: ["Reduce onboarding from custom implementation to a repeatable process"],
  value_delivery: ["Establish proof of delivered customer value"],
  retention: ["Establish a retention/renewal mechanism and prove it"],
  revenue: [
    "Create a recurring-revenue commercialization model",
    "Package Venuewise into one focused commercial offer",
  ],
  acquisition: ["Establish a repeatable first-customer acquisition process"],
  sales: ["Establish a repeatable sales motion from interest to signed"],
  fulfillment: ["Make delivery repeatable without founder/engineering intervention"],
  scale: ["Remove the top constraint to serving many customers at once"],
  margin: ["Establish a pricing and cost model with durable margin"],
} as const;

const RANK: Record<QualityTier, number> = {
  verified: 0,
  observed: 1,
  estimated: 2,
  assumed: 3,
  unknown: 4,
};

export function analyzeLink(
  evidence: readonly StartupEvidence[],
  link: StartupLink,
  asOf: string,
): StartupLinkAnalysis {
  const items = evidence.filter(
    (e) => e.link === link && effectiveTier(e, asOf) !== "unknown",
  );

  if (items.length === 0) {
    return {
      link,
      status: "unknown",
      rationale: `No usable evidence for the ${link} link.`,
      confidence: "unknown",
    };
  }

  const best: QualityTier = items
    .map((e) => effectiveTier(e, asOf))
    .reduce((acc, t) => (RANK[t] < RANK[acc] ? t : acc), "unknown" as QualityTier);

  const strong = items.filter((e) => e.fact.startsWith("[strong]"));
  const weak = items.filter((e) => e.fact.startsWith("[weak]"));

  if (weak.length > 0 && strong.length === 0) {
    return {
      link,
      status: "gap",
      rationale: weak.map((e) => e.fact.replace("[weak] ", "")).join(" "),
      confidence: best,
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
  return {
    link,
    status: "unknown",
    rationale: `Evidence exists for ${link} but does not establish it as a strength or a gap.`,
    confidence: best,
  };
}

export function analyzeChain(
  evidence: readonly StartupEvidence[],
  asOf: string,
): StartupLinkAnalysis[] {
  return STARTUP_CHAIN.map((link) => analyzeLink(evidence, link, asOf));
}
