/**
 * Startup reasoning — Steps 5–9, adapted from the BTI cycle.
 *
 * Reuses @hl-bos/bti-cycle's confidence machine (`effectiveTier`, `capByWeakest`,
 * `atLeast`, `weaker`) and honours the same discipline: evidence-driven binding
 * constraint, four permitted outputs, never a fabricated number, confidence
 * capped by the weakest load-bearing input, and an appetite that prioritises the
 * evidence most likely to prove the recommendation wrong.
 *
 * Deterministic: reads only its inputs and the injected `asOf` date.
 */

import { atLeast, capByWeakest, effectiveTier, weaker } from "@hl-bos/bti-cycle";
import { analyzeChain, LINK_OUTCOMES } from "./chain.ts";
import type {
  EvidenceEffect,
  QualityTier,
  StartupAppetiteItem,
  StartupAssumption,
  StartupConstraint,
  StartupEngagement,
  StartupEvidence,
  StartupLedger,
  StartupLinkAnalysis,
  StartupMeasurementContract,
  StartupOption,
  StartupOutput,
  StartupStability,
  StartupLink,
} from "./types.ts";
import { COMMERCIAL_LINKS, STARTUP_CHAIN } from "./types.ts";

const DECISION_BAR: QualityTier = "estimated";

const EFFECT_WEIGHT: Record<EvidenceEffect, number> = {
  transform: 4,
  invalidate: 3,
  weaken: 2,
  strengthen: 1,
};

// --- Step 5: binding constraint --------------------------------------------

export function identifyConstraint(
  chain: readonly StartupLinkAnalysis[],
): StartupConstraint {
  const gaps = chain.filter(
    (l) => l.status === "gap" && atLeast(l.confidence, DECISION_BAR),
  );
  const strengths = chain.filter((l) => l.status === "strength");
  const unknowns = chain.filter((l) => l.status === "unknown");

  // A single sufficiently-confident gap IS the binding constraint (the earliest
  // in flow order throttles everything downstream).
  if (gaps.length >= 1) {
    const order = (l: StartupLink) => STARTUP_CHAIN.indexOf(l);
    const binding = [...gaps].sort((a, b) => order(a.link) - order(b.link))[0]!;
    return {
      bindingLink: binding.link,
      rationale: binding.rationale,
      confidence: binding.confidence,
      hypotheses: [],
    };
  }

  // No confirmable gap. When the PRODUCT side is a verified strength, the binding
  // constraint is commercial, not the product — so rank the commercial links
  // first. This is the startup analog of "demand is strong, look downstream".
  const productStrong = strengths.some(
    (s) => s.link === "product" || s.link === "solution",
  );
  const unknownLinks = new Set(unknowns.map((u) => u.link));
  const priority: readonly StartupLink[] = productStrong
    ? [
        ...COMMERCIAL_LINKS,
        ...STARTUP_CHAIN.filter((l) => !COMMERCIAL_LINKS.includes(l)),
      ]
    : STARTUP_CHAIN;
  const hypotheses = priority.filter((l) => unknownLinks.has(l));

  return {
    bindingLink: null,
    rationale: productStrong
      ? "The product is a verified strength, so the binding constraint is not product completeness. It sits in the commercial/go-to-market chain and cannot yet be confirmed to a single link from the available evidence."
      : "The binding constraint cannot be confirmed from the available evidence.",
    confidence: "unknown",
    hypotheses,
  };
}

// --- Step 6: options (outcomes only) ---------------------------------------

const OUTCOME_META: Record<
  string,
  Omit<
    StartupOption,
    | "id"
    | "name"
    | "targetsLink"
    | "precondition"
    | "preconditionVerified"
    | "rejectedReason"
  >
> = {
  "Package Venuewise into one focused commercial offer": {
    objective:
      "Convert the broad ecosystem into one named, priced, sellable offer for one customer.",
    dependencies: [
      "A working product to package (verified)",
      "A chosen first customer & offer (CEO input)",
    ],
    risks: ["Choosing the wrong first offer", "Ecosystem breadth diluting focus"],
    timeToEvidence: "2–4 weeks to a priced offer in front of a real prospect",
    implementationBurden: "Low-moderate — packaging & positioning, not new software",
    mustRemainTrue: "A deployable product exists that a real customer can use",
    invalidatedBy:
      "Evidence that no segment will pay for any single packaging of the product",
    successMeasure: "A real prospect accepts or rejects a specific priced offer",
  },
  "Validate product-market fit with a paid design partner": {
    objective:
      "Land one paying design partner to prove real willingness-to-pay and delivered value.",
    dependencies: [
      "A deployable product (verified)",
      "Access to a real prospect (CEO input)",
    ],
    risks: ["Free pilots that never convert", "Custom work that does not generalize"],
    timeToEvidence: "30–60 days to a signed paid pilot or a clear rejection",
    implementationBurden: "Moderate — sales + onboarding, minimal new build",
    mustRemainTrue: "The product delivers a value a customer will pay for",
    invalidatedBy: "Repeated rejection at any price by qualified prospects",
    successMeasure: "One paying design partner onboarded, or an evidenced 'no'",
  },
};

export function generateOptions(
  constraint: StartupConstraint,
  chain: readonly StartupLinkAnalysis[],
): StartupOption[] {
  const options: StartupOption[] = [];
  const productStrong = chain.some(
    (l) => (l.link === "product" || l.link === "solution") && l.status === "strength",
  );

  // (a) Leverage the verified product to create a commercial offer. Precondition
  // (a working product exists) is verified when the product link is a strength.
  if (productStrong) {
    for (const name of [
      "Package Venuewise into one focused commercial offer",
      "Validate product-market fit with a paid design partner",
    ]) {
      const meta = OUTCOME_META[name]!;
      options.push({
        id: slug(name),
        name,
        targetsLink: name.includes("design partner") ? "customer" : "revenue",
        precondition: "A deployable, working product exists to sell.",
        preconditionVerified: true,
        ...meta,
      });
    }
  }

  // (b) Relieve a CONFIRMED binding constraint (only when confirmed).
  if (constraint.bindingLink) {
    const outcome = LINK_OUTCOMES[constraint.bindingLink][0];
    if (outcome !== undefined && !options.some((o) => o.name === outcome)) {
      options.push({
        id: slug(outcome),
        name: outcome,
        targetsLink: constraint.bindingLink,
        objective: `Relieve the confirmed binding constraint at the ${constraint.bindingLink} link.`,
        dependencies: [],
        risks: [],
        timeToEvidence: "TBD with the CEO",
        implementationBurden: "TBD",
        mustRemainTrue: `The ${constraint.bindingLink} link is the binding constraint.`,
        invalidatedBy: "Evidence that a different link binds.",
        successMeasure: "Movement in the constrained link's metric.",
        precondition: `The ${constraint.bindingLink} link is the binding constraint.`,
        preconditionVerified: true,
      });
    }
  }

  // (c) Product-bias guard: never recommend "build/finish more product" unless
  // the product is a CONFIRMED gap. It is the startup analog of refusing SEO for
  // a business that is already visible.
  const productGap = chain.some((l) => l.link === "product" && l.status === "gap");
  if (!productGap) {
    options.push({
      id: "expand-product-ecosystem",
      name: "Expand / finish the product ecosystem",
      targetsLink: "product",
      objective: "Build more product (the reflex).",
      dependencies: [],
      risks: [],
      timeToEvidence: "n/a",
      implementationBurden: "High",
      mustRemainTrue: "Product completeness is the binding constraint.",
      invalidatedBy: "n/a",
      successMeasure: "n/a",
      precondition: "Product completeness is the binding constraint.",
      preconditionVerified: false,
      rejectedReason:
        "The product is already built and live; there is no evidence that product completeness is the binding constraint. Building more product would be the exact bias BTI is built to refuse.",
    });
  }

  return options;
}

// --- Decision: one of four permitted outputs -------------------------------

interface Decision {
  readonly output: StartupOutput;
  readonly recommendationId: string | null;
  readonly provisionalLeadId: string | null;
}

export function decide(
  constraint: StartupConstraint,
  options: readonly StartupOption[],
  overallConfidence: QualityTier,
  goalFeasible: boolean,
): Decision {
  if (!goalFeasible) {
    return { output: "REVISE_GOAL", recommendationId: null, provisionalLeadId: null };
  }

  const viable = options.filter((o) => o.rejectedReason === undefined);
  const canRecommend =
    constraint.bindingLink !== null &&
    viable.length > 0 &&
    atLeast(overallConfidence, DECISION_BAR);
  if (canRecommend) {
    const rec =
      viable.find((o) => o.targetsLink === constraint.bindingLink) ?? viable[0]!;
    return {
      output: "RECOMMEND_TRANSFORMATION",
      recommendationId: rec.id,
      provisionalLeadId: null,
    };
  }

  const lead = viable.filter((o) => o.preconditionVerified)[0];
  if (lead && (constraint.hypotheses.length > 0 || viable.length > 0)) {
    return {
      output: "COLLECT_MORE_EVIDENCE",
      recommendationId: null,
      provisionalLeadId: lead.id,
    };
  }
  const collect = constraint.hypotheses.length > 0 || viable.length > 0;
  return {
    output: collect ? "COLLECT_MORE_EVIDENCE" : "NO_TRANSFORMATION_NOW",
    recommendationId: null,
    provisionalLeadId: null,
  };
}

// --- Evidence appetite ------------------------------------------------------

const LINK_DIAGNOSTIC: Partial<
  Record<StartupLink, { fact: string; source: string; cost: number }>
> = {
  customer: {
    fact: "Who exactly is the first paying customer and their buying trigger",
    source: "CEO / customer interviews",
    cost: 1,
  },
  activation: {
    fact: "What is the shortest path from interest to a usable, onboarded account",
    source: "CEO / product walkthrough",
    cost: 2,
  },
  value_delivery: {
    fact: "What outcome has a real (non-family) user demonstrably received",
    source: "CEO / user references",
    cost: 2,
  },
  retention: {
    fact: "Has anyone used Venuewise repeatedly outside the family/dev team",
    source: "CEO / usage records",
    cost: 2,
  },
  revenue: {
    fact: "What price has a real prospect accepted or rejected",
    source: "CEO / sales records",
    cost: 1,
  },
  acquisition: {
    fact: "Is there any repeatable channel that has produced a real lead",
    source: "CEO / marketing records",
    cost: 2,
  },
  sales: {
    fact: "What is the current path from interest to signed, and its conversion",
    source: "CEO",
    cost: 2,
  },
  fulfillment: {
    fact: "Can Venuewise be deployed/used without engineering intervention",
    source: "CEO / ops",
    cost: 2,
  },
};

export function buildAppetite(
  constraint: StartupConstraint,
  discoveryQuestions: readonly string[],
  goalAssumed: boolean,
): StartupAppetiteItem[] {
  const items: StartupAppetiteItem[] = [];
  const mk = (
    fact: string,
    why: string,
    effect: EvidenceEffect,
    source: string,
    cost: number,
  ): StartupAppetiteItem => ({
    fact,
    why,
    effect,
    path: "manual",
    source,
    acquisitionCost: cost,
    priority: 0,
  });

  if (goalAssumed) {
    items.push(
      mk(
        "The exact commercial outcome that defines success at 30/60/90 days",
        "Everything downstream is measured against it.",
        "transform",
        "CEO",
        1,
      ),
    );
  }

  // The offer/customer questions can invalidate or transform the provisional lead.
  items.push(
    mk(
      "What exact Venuewise offer should be sold first, to whom",
      "Confirms or replaces the provisional 'one focused offer' lead.",
      "transform",
      "CEO",
      1,
    ),
  );
  items.push(
    mk(
      "Has any real prospect accepted or rejected a price",
      "Would confirm or invalidate willingness-to-pay.",
      "invalidate",
      "CEO / sales records",
      1,
    ),
  );

  for (const link of constraint.hypotheses) {
    const d = LINK_DIAGNOSTIC[link];
    if (d)
      items.push(
        mk(
          d.fact,
          `Confirms or denies ${link} as the binding constraint.`,
          "transform",
          d.source,
          d.cost,
        ),
      );
  }

  // Any extra CEO discovery questions not already covered.
  for (const q of discoveryQuestions) {
    if (
      !items.some((i) => i.fact.toLowerCase().includes(q.toLowerCase().slice(0, 12)))
    ) {
      items.push(mk(q, "Load-bearing CEO question.", "transform", "CEO", 1));
    }
  }

  const seen = new Set<string>();
  return items
    .filter((i) => (seen.has(i.fact) ? false : (seen.add(i.fact), true)))
    .map((i) => ({
      ...i,
      priority: round2(EFFECT_WEIGHT[i.effect] / i.acquisitionCost),
    }))
    .sort((a, b) => b.priority - a.priority);
}

// --- Stability & measurement contract --------------------------------------

export function assessStability(
  loadBearing: readonly StartupEvidence[],
  asOf: string,
): StartupStability {
  const weak = loadBearing.filter((e) => {
    const t = effectiveTier(e, asOf);
    return t === "assumed" || t === "unknown";
  }).length;
  const score = Math.max(0, Math.min(100, 100 - weak * 20));
  const fragility =
    weak === 0
      ? "Robust: rests on verified/observed facts."
      : `Fragile: rests on ${weak} unconfirmed input(s); CEO answers could change it.`;
  return { score, fragility };
}

export function buildMeasurementContract(
  lead: StartupOption | null,
  evidence: readonly StartupEvidence[],
  asOf: string,
): StartupMeasurementContract | null {
  if (!lead) return null;
  const revenueFact = evidence.find(
    (e) =>
      e.link === "revenue" &&
      e.value !== undefined &&
      effectiveTier(e, asOf) !== "unknown",
  );
  return {
    targetOutcome:
      "A repeatable path to paying customers: one signed paid offer/design partner, then recurring revenue.",
    baseline:
      revenueFact?.value !== undefined
        ? {
            value: revenueFact.value,
            tier: effectiveTier(revenueFact, asOf),
            note: "Current paying subscriptions (near-zero); treat as pre-commercial baseline.",
          }
        : {
            value: null,
            tier: "unknown",
            note: "No reliable current-revenue baseline — MUST be captured before execution.",
          },
    window: "30 / 60 / 90 days",
    successIndicators: [
      "≥1 real prospect accepts a specific priced offer",
      "≥1 paying design partner onboarded without custom engineering",
      "A repeatable interest→signed path demonstrated at least twice",
    ],
    failureIndicators: [
      "Qualified prospects reject every priced offer",
      "Only free pilots, no paid conversion",
      "Onboarding still requires bespoke engineering each time",
    ],
    dataSource:
      "CEO sales records, Stripe subscriptions, onboarding logs (to be connected)",
    attribution:
      "Pre/post paid-customer count vs. the locked baseline; exclude family/internal accounts.",
    strengthenIf: "A prospect pays for the packaged offer.",
    invalidateIf: "No segment will pay for any single packaging at any tested price.",
    rerunWhen:
      "The first paid acceptance/rejection lands, or the offer/customer is chosen.",
  };
}

// --- The full startup cycle ------------------------------------------------

export function runStartupCycle(e: StartupEngagement): StartupLedger {
  const chain = analyzeChain(e.evidence, e.asOf);
  const constraint = identifyConstraint(chain);
  const options = generateOptions(constraint, chain);

  const targetLinks = new Set<StartupLink | "context">(
    constraint.bindingLink ? [constraint.bindingLink] : constraint.hypotheses,
  );
  for (const l of chain) if (l.status === "strength") targetLinks.add(l.link);
  const loadBearing = e.evidence.filter((ev) => targetLinks.has(ev.link));
  const capped = capByWeakest(loadBearing, e.asOf);
  const overall = weaker(e.goal.confidence, capped);

  const goalFeasible = true; // a "become commercially successful" goal is feasible
  const decision = decide(constraint, options, overall, goalFeasible);

  const leadId = decision.recommendationId ?? decision.provisionalLeadId;
  const lead = options.find((o) => o.id === leadId) ?? null;

  const appetite = buildAppetite(
    constraint,
    e.discoveryQuestions,
    !atLeast(e.goal.confidence, "observed"),
  );

  return {
    engagementId: e.engagementId,
    business: e.business,
    goal: e.goal,
    discovered: describeDiscovery(chain),
    evidence: e.evidence,
    assumptions: collectAssumptions(e, constraint, appetite),
    confidence: overall,
    chain,
    rootCause: constraint,
    options,
    recommendation:
      decision.recommendationId !== null
        ? {
            optionId: decision.recommendationId,
            why:
              options.find((o) => o.id === decision.recommendationId)?.objective ?? "",
          }
        : null,
    rejected: options
      .filter((o) => o.rejectedReason !== undefined)
      .map((o) => ({ optionId: o.id, reason: o.rejectedReason! })),
    validityConditions: collectValidity(chain, lead),
    evidenceThatWouldChange: appetite
      .filter((a) => a.effect !== "strengthen")
      .map((a) => ({ evidence: a.fact, effect: a.effect })),
    appetite,
    stability: assessStability(loadBearing, e.asOf),
    measurementContract: buildMeasurementContract(lead, e.evidence, e.asOf),
    output: decision.output,
    provisionalLeadId: decision.provisionalLeadId,
  };
}

function describeDiscovery(chain: readonly StartupLinkAnalysis[]): string {
  const s = chain.filter((l) => l.status === "strength").map((l) => l.link);
  const g = chain.filter((l) => l.status === "gap").map((l) => l.link);
  const u = chain.filter((l) => l.status === "unknown").map((l) => l.link);
  const parts: string[] = [];
  if (s.length) parts.push(`Strengths: ${s.join(", ")}.`);
  if (g.length) parts.push(`Gaps: ${g.join(", ")}.`);
  if (u.length)
    parts.push(`Unknown (no usable evidence / cause unconfirmed): ${u.join(", ")}.`);
  return parts.join(" ");
}

function collectAssumptions(
  e: StartupEngagement,
  constraint: StartupConstraint,
  appetite: readonly StartupAppetiteItem[],
): StartupAssumption[] {
  const out: StartupAssumption[] = [];
  if (!atLeast(e.goal.confidence, "observed")) {
    out.push({
      statement: `Goal is taken as: "${e.goal.statement}"`,
      tier: e.goal.confidence,
      verifyBy: "CEO interview",
    });
  }
  for (const link of constraint.hypotheses) {
    const src =
      appetite.find((a) => a.why.includes(link))?.source ?? "CEO / connected systems";
    out.push({
      statement: `${link} is unconfirmed and assumed non-decisive until measured.`,
      tier: "unknown",
      verifyBy: src,
    });
  }
  return out;
}

function collectValidity(
  chain: readonly StartupLinkAnalysis[],
  lead: StartupOption | null,
): string[] {
  const out: string[] = [];
  for (const l of chain)
    if (l.status === "strength")
      out.push(`${l.link} remains a strength: ${l.rationale}`);
  if (lead) out.push(`Provisional-lead precondition holds: ${lead.precondition}`);
  return out;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
