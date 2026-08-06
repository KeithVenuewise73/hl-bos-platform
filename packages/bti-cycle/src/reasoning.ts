/**
 * The BTI Reasoning Engine — Stages 5–7, ending at the Measurement Contract.
 *
 * Deterministic by construction: given the same engagement it always returns
 * the same Reasoning Ledger. Judgement is pushed to the edges (the evidence and
 * its confidence tiers); everything in between is fixed logic. The engine will
 * emit one of the four permitted outputs and NEVER manufacture a recommendation
 * to avoid saying "collect more evidence".
 */

import { atLeast, capByWeakest, effectiveTier, weaker } from "./confidence.ts";
import { analyzeChain, LINK_OUTCOMES } from "./valuechain.ts";
import type {
  Assumption,
  ConstraintResult,
  CustomerGoal,
  Engagement,
  EvidenceAppetiteItem,
  EvidenceEffect,
  EvidenceItem,
  LifecycleState,
  LinkAnalysis,
  MeasurementContract,
  PermittedOutput,
  QualityTier,
  ReasoningLedger,
  Stability,
  TransformationOption,
  ValueChainLink,
} from "./types.ts";

/** Minimum overall confidence required before a recommendation may be issued. */
const DECISION_BAR: QualityTier = "estimated";

/** Weight of each evidence effect when prioritising the appetite: evidence that
 * could OVERTURN the recommendation (transform/invalidate) is worth more than
 * evidence that merely confirms it. This is the anti-confirmation-bias rule. */
const EFFECT_WEIGHT: Record<EvidenceEffect, number> = {
  transform: 4,
  invalidate: 3,
  weaken: 2,
  strengthen: 1,
};

/** Feasibility / execution profile per outcome (1 easy … 5 hard). Heuristic and
 * documented; the pattern library (a later phase) will replace these priors. */
const PROFILE: Record<
  string,
  {
    effort: number;
    timeToValue: number;
    cost: number;
    risk: number;
    goalProximity: number;
  }
> = {
  "Recover Missed Opportunities": {
    effort: 1,
    timeToValue: 1,
    cost: 1,
    risk: 1,
    goalProximity: 1,
  },
  "Increase Recurring Revenue": {
    effort: 3,
    timeToValue: 3,
    cost: 2,
    risk: 2,
    goalProximity: 0.8,
  },
  "Increase Throughput of Existing Demand": {
    effort: 3,
    timeToValue: 3,
    cost: 3,
    risk: 2,
    goalProximity: 0.9,
  },
  "Improve Margin / Pricing": {
    effort: 2,
    timeToValue: 2,
    cost: 1,
    risk: 3,
    goalProximity: 0.7,
  },
};
const DEFAULT_PROFILE = {
  effort: 3,
  timeToValue: 3,
  cost: 3,
  risk: 3,
  goalProximity: 0.6,
};

// --- Stage 5: Constraint Identification (+ feasibility gate) ----------------

export function identifyConstraint(
  goal: CustomerGoal,
  chain: readonly LinkAnalysis[],
  asOf: string,
  evidence: readonly EvidenceItem[],
): ConstraintResult {
  const gaps = chain.filter((l) => l.status === "gap");
  const strengths = chain.filter((l) => l.status === "strength");
  const unknowns = chain.filter((l) => l.status === "unknown");

  // Feasibility gate: a goal target that exceeds a verified capacity ceiling is
  // infeasible — BTI must send it back to Stage 1 rather than chase it.
  const feasibility = checkFeasibility(goal, evidence, asOf);
  if (feasibility === "infeasible") {
    return {
      bindingLink: null,
      rationale:
        "The stated goal exceeds a verified capacity ceiling; it is not reachable as stated.",
      confidence: "verified",
      feasibility,
      hypotheses: [],
    };
  }

  // A single, sufficiently-confident gap IS the binding constraint (Theory of
  // Constraints: relieve the link that throttles throughput).
  const confident = gaps.filter((g) => atLeast(g.confidence, DECISION_BAR));
  if (confident.length >= 1) {
    // Earliest gap in flow order starves everything downstream → it binds.
    const binding = confident[0]!;
    return {
      bindingLink: binding.link,
      rationale: binding.rationale,
      confidence: binding.confidence,
      feasibility,
      hypotheses: [],
    };
  }

  // No confirmable gap. Rank the unknown links as hypotheses. When demand is a
  // strength, the constraint is downstream of demand (throughput/monetisation),
  // not top-of-funnel — so we look there first.
  const demandStrong = strengths.some((s) => s.link === "demand");
  const priority: readonly ValueChainLink[] = demandStrong
    ? ["fulfillment", "retention", "margin", "conversion", "capture", "response"]
    : [
        "demand",
        "capture",
        "response",
        "conversion",
        "fulfillment",
        "retention",
        "margin",
      ];
  const unknownLinks = new Set(unknowns.map((u) => u.link));
  const hypotheses = priority.filter((l) => unknownLinks.has(l));

  return {
    bindingLink: null,
    rationale: demandStrong
      ? "Demand is a verified strength, so the binding constraint is not visibility. It cannot be confirmed from the available evidence; the internal links are unknown."
      : "The binding constraint cannot be confirmed from the available evidence.",
    confidence: "unknown",
    feasibility,
    hypotheses,
  };
}

function checkFeasibility(
  goal: CustomerGoal,
  evidence: readonly EvidenceItem[],
  asOf: string,
): "feasible" | "infeasible" | "unknown" {
  if (goal.target === undefined) return "unknown";
  const ceiling = evidence.find(
    (e) =>
      e.link === "fulfillment" &&
      e.fact.toLowerCase().includes("capacity ceiling") &&
      e.value !== undefined &&
      effectiveTier(e, asOf) !== "unknown",
  );
  if (ceiling?.value === undefined) return "unknown";
  return ceiling.value < goal.target ? "infeasible" : "feasible";
}

// --- Stage 6: Option generation (outcomes only) ----------------------------

export function generateOptions(
  constraint: ConstraintResult,
  chain: readonly LinkAnalysis[],
  evidence: readonly EvidenceItem[],
  asOf: string,
): TransformationOption[] {
  const options: TransformationOption[] = [];

  // (a) Leverage a verified strength. A verified retention strength (a large,
  // loyal base) is the precondition for building recurring revenue.
  const retention = chain.find((l) => l.link === "retention");
  if (retention?.status === "strength" && atLeast(retention.confidence, "observed")) {
    options.push(
      scoreOption(
        {
          id: "increase-recurring-revenue",
          name: "Increase Recurring Revenue",
          targetsLink: "retention",
          rationale:
            "A large, loyal base is a verified asset; converting it to recurring plans turns one-time trust into predictable revenue.",
          precondition:
            "A large, satisfied customer base exists to convert to recurring plans.",
          preconditionVerified: true,
        },
        evidence,
        asOf,
      ),
    );
  }

  // (b) Relieve the CONFIRMED binding constraint. When the constraint is only
  // hypothesised we do NOT present concrete relieve-options as if actionable —
  // they cannot be sized or acted on, and dressing an unknown link as an option
  // would mislead. The hypotheses live in the root cause and the appetite (what
  // to investigate first), not here.
  if (constraint.bindingLink) {
    const link = constraint.bindingLink;
    const outcome = LINK_OUTCOMES[link][0];
    if (outcome !== undefined && !options.some((o) => o.name === outcome)) {
      options.push(
        scoreOption(
          {
            id: slug(outcome),
            name: outcome,
            targetsLink: link,
            rationale: `Directly relieves the confirmed binding constraint at the ${link} link.`,
            precondition: `The ${link} link is the binding constraint.`,
            preconditionVerified: true,
          },
          evidence,
          asOf,
        ),
      );
    }
  }

  // (c) Product-bias guard: never recommend missed-opportunity recovery without
  // evidence of an actual capture leak.
  const captureGap = chain.find((l) => l.link === "capture" && l.status === "gap");
  if (!captureGap && !options.some((o) => o.name === "Recover Missed Opportunities")) {
    options.push({
      id: "recover-missed-opportunities",
      name: "Recover Missed Opportunities",
      targetsLink: "capture",
      rationale: "The default reflex for a service business.",
      score: null,
      precondition: "A measurable capture leak (missed calls / dropped forms) exists.",
      preconditionVerified: false,
      rejectedReason:
        "No evidence of a capture leak. Recommending it blind would be exactly the product bias BTI is built to avoid.",
    });
  }

  return options;
}

function scoreOption(
  base: Omit<TransformationOption, "score">,
  evidence: readonly EvidenceItem[],
  asOf: string,
): TransformationOption {
  const profile = PROFILE[base.name] ?? DEFAULT_PROFILE;

  // Recoverable dollars must come from a usable, sized gap on the target link.
  const gap = evidence.find(
    (e) =>
      e.link === base.targetsLink &&
      e.fact.startsWith("[weak]") &&
      e.value !== undefined &&
      effectiveTier(e, asOf) !== "unknown",
  );

  // Absorption: can the business take the added load? Needs usable fulfillment
  // evidence. Unknown fulfillment → we cannot honestly score a demand-side move.
  const absorptionKnown = evidence.some(
    (e) => e.link === "fulfillment" && effectiveTier(e, asOf) !== "unknown",
  );

  if (gap?.value === undefined || !absorptionKnown) {
    return { ...base, score: null };
  }

  const captureProbability = 0.4; // documented benchmark default (Estimated)
  const absorption = 1;
  const score =
    (gap.value * captureProbability * profile.goalProximity * absorption) /
    (profile.effort * profile.timeToValue * profile.cost * profile.risk);
  return { ...base, score: Math.round(score) };
}

// --- Decision: which of the four permitted outputs ------------------------

interface Decision {
  readonly output: PermittedOutput;
  readonly recommendationId: string | null;
  readonly provisionalLeadId: string | null;
}

export function decide(
  constraint: ConstraintResult,
  options: readonly TransformationOption[],
  overallConfidence: QualityTier,
): Decision {
  if (constraint.feasibility === "infeasible") {
    return { output: "revise_goal", recommendationId: null, provisionalLeadId: null };
  }

  const scored = options.filter(
    (o) => o.rejectedReason === undefined && o.score !== null,
  );
  const canRecommend =
    constraint.bindingLink !== null &&
    scored.length > 0 &&
    atLeast(overallConfidence, DECISION_BAR);

  if (canRecommend) {
    const best = [...scored].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0]!;
    return {
      output: "recommendation",
      recommendationId: best.id,
      provisionalLeadId: null,
    };
  }

  // Cannot recommend. Prefer "collect more evidence" with a provisional lead —
  // the option whose precondition is already verified — over "no transformation".
  const lead = options
    .filter((o) => o.rejectedReason === undefined && o.preconditionVerified)
    .sort(
      (a, b) =>
        (PROFILE[b.name]?.goalProximity ?? 0) - (PROFILE[a.name]?.goalProximity ?? 0),
    )[0];

  if (lead) {
    return {
      output: "collect_more_evidence",
      recommendationId: null,
      provisionalLeadId: lead.id,
    };
  }

  const anyViable = options.some((o) => o.rejectedReason === undefined);
  return {
    output: anyViable ? "collect_more_evidence" : "no_transformation",
    recommendationId: null,
    provisionalLeadId: null,
  };
}

// --- Evidence Appetite (ranked missing facts) ------------------------------

const LINK_DIAGNOSTIC: Record<
  ValueChainLink,
  { fact: string; path: EvidenceAppetiteItem["path"]; source: string; cost: number }
> = {
  demand: {
    fact: "Local search volume vs. current capture",
    path: "automatic",
    source: "VisibilityAI / Analytics",
    cost: 2,
  },
  capture: {
    fact: "Missed-call / dropped-form rate",
    path: "automatic",
    source: "Phone system / AI Receptionist",
    cost: 2,
  },
  response: {
    fact: "Average response time to inbound",
    path: "automatic",
    source: "Phone system / CRM",
    cost: 2,
  },
  conversion: {
    fact: "Quote-to-close rate",
    path: "automatic",
    source: "CRM",
    cost: 3,
  },
  fulfillment: {
    fact: "Capacity utilisation and backlog",
    path: "automatic",
    source: "Scheduling / CRM",
    cost: 3,
  },
  retention: {
    fact: "Repeat-purchase rate",
    path: "automatic",
    source: "CRM",
    cost: 3,
  },
  margin: {
    fact: "Gross margin by service line",
    path: "manual",
    source: "Accounting / financial statements",
    cost: 4,
  },
};

export function buildAppetite(
  goal: CustomerGoal,
  constraint: ConstraintResult,
  options: readonly TransformationOption[],
  provisionalLeadId: string | null,
): EvidenceAppetiteItem[] {
  const items: EvidenceAppetiteItem[] = [];

  // The goal itself, if it was assumed, outranks everything — the whole cycle
  // hangs on it.
  if (!atLeast(goal.confidence, "observed")) {
    items.push(
      mk(
        "The owner's actual goal and target",
        "Everything downstream is measured against it.",
        "transform",
        "manual",
        "Owner interview",
        1,
      ),
    );
  }

  // Each hypothesis link needs its diagnostic fact to confirm or deny it as the
  // binding constraint (a transforming fact).
  for (const link of constraint.hypotheses) {
    const d = LINK_DIAGNOSTIC[link];
    items.push(
      mk(
        d.fact,
        `Confirms or denies ${link} as the binding constraint.`,
        "transform",
        d.path,
        d.source,
        d.cost,
      ),
    );
  }

  // For the provisional lead, the fact that could INVALIDATE it, then the facts
  // that would size it.
  const lead = options.find((o) => o.id === provisionalLeadId);
  if (lead?.name === "Increase Recurring Revenue") {
    items.push(
      mk(
        "Whether a membership / service-plan program already exists",
        "Would invalidate the recurring-revenue lead entirely.",
        "invalidate",
        "manual",
        "Owner interview",
        1,
      ),
    );
    items.push(
      mk(
        "Active customer count and average annual value",
        "Sizes the recurring-revenue opportunity.",
        "strengthen",
        "manual",
        "Accounting / CRM",
        3,
      ),
    );
  }

  // Priority = information value ÷ acquisition cost. Highest first.
  return items
    .map((i) => ({
      ...i,
      priority: round2(EFFECT_WEIGHT[i.effect] / i.acquisitionCost),
    }))
    .sort((a, b) => b.priority - a.priority);
}

function mk(
  fact: string,
  why: string,
  effect: EvidenceEffect,
  path: EvidenceAppetiteItem["path"],
  source: string,
  acquisitionCost: number,
): EvidenceAppetiteItem {
  return { fact, why, effect, path, source, acquisitionCost, priority: 0 };
}

// --- Stability -------------------------------------------------------------

export function assessStability(
  loadBearing: readonly EvidenceItem[],
  asOf: string,
): Stability {
  const weak = loadBearing.filter((e) => {
    const t = effectiveTier(e, asOf);
    return t === "assumed" || t === "unknown";
  }).length;
  const score = Math.max(0, Math.min(100, 100 - weak * 25));
  const fragility =
    weak === 0
      ? "Robust: rests on verified/observed facts."
      : `Fragile: rests on ${weak} unconfirmed input(s); any one could change the recommendation.`;
  return { score, fragility };
}

// --- Measurement Contract --------------------------------------------------

const CONTRACT: Record<
  string,
  { metric: string; window: string; attribution: string }
> = {
  "Increase Recurring Revenue": {
    metric: "Net new recurring revenue and % of active customers enrolled",
    window: "90 days post-launch",
    attribution:
      "Enrolled-cohort revenue vs. matched non-enrolled cohort; seasonality-adjusted; one-time jobs excluded.",
  },
  "Recover Missed Opportunities": {
    metric: "Recovered contacts → booked jobs, and the missed-contact rate",
    window: "30 days post-launch",
    attribution:
      "Pre/post missed-contact rate vs. locked baseline; seasonality-adjusted.",
  },
};

export function buildMeasurementContract(
  option: TransformationOption,
  evidence: readonly EvidenceItem[],
  asOf: string,
): MeasurementContract {
  const spec = CONTRACT[option.name] ?? {
    metric: `${option.name}: primary outcome metric`,
    window: "90 days post-launch",
    attribution:
      "Pre/post vs. locked baseline; seasonality-adjusted; matched control where available.",
  };
  const baseFact = evidence.find(
    (e) =>
      e.link === option.targetsLink &&
      e.value !== undefined &&
      effectiveTier(e, asOf) !== "unknown",
  );
  const baseline =
    baseFact?.value !== undefined
      ? { value: baseFact.value, tier: effectiveTier(baseFact, asOf) }
      : { value: null, tier: "unknown" as QualityTier };
  return {
    metric: spec.metric,
    baseline,
    window: spec.window,
    attributionMethod: spec.attribution,
  };
}

// --- The full cycle --------------------------------------------------------

export function runCycle(e: Engagement): ReasoningLedger {
  const chain = analyzeChain(e.evidence, e.asOf);
  const constraint = identifyConstraint(e.goal, chain, e.asOf, e.evidence);
  const options = generateOptions(constraint, chain, e.evidence, e.asOf);

  // Load-bearing evidence = the evidence the root cause and the leading option
  // stand on. Overall confidence is capped by the weakest of these + the goal.
  const targetLinks = new Set<ValueChainLink | "context">(
    constraint.bindingLink ? [constraint.bindingLink] : constraint.hypotheses,
  );
  const strengthLinks = chain.filter((l) => l.status === "strength").map((l) => l.link);
  for (const l of strengthLinks) targetLinks.add(l);
  const loadBearing = e.evidence.filter((ev) => targetLinks.has(ev.link));
  const capped = capByWeakest(loadBearing, e.asOf);
  const overall = weaker(e.goal.confidence, capped);

  const decision = decide(constraint, options, overall);
  const appetite = buildAppetite(
    e.goal,
    constraint,
    options,
    decision.provisionalLeadId,
  );

  const recommendation =
    decision.recommendationId !== null
      ? {
          optionId: decision.recommendationId,
          why:
            options.find((o) => o.id === decision.recommendationId)?.rationale ??
            "Highest value score above the decision bar.",
        }
      : null;

  const rejected = options
    .filter((o) => o.rejectedReason !== undefined)
    .map((o) => ({ optionId: o.id, reason: o.rejectedReason! }));

  const leadOrRec =
    options.find(
      (o) => o.id === (decision.recommendationId ?? decision.provisionalLeadId),
    ) ?? null;
  const measurementContract = leadOrRec
    ? buildMeasurementContract(leadOrRec, e.evidence, e.asOf)
    : null;

  const stability = assessStability(loadBearing, e.asOf);
  const lifecycle = lifecycleFor(decision.output, overall);

  return {
    engagementId: e.engagementId,
    business: e.business,
    goal: e.goal,
    discovered: describeDiscovery(chain),
    evidence: e.evidence,
    assumptions: collectAssumptions(e.goal, constraint, appetite),
    confidence: overall,
    rootCause: constraint,
    options,
    recommendation,
    rejected,
    validityConditions: collectValidityConditions(chain, leadOrRec),
    evidenceThatWouldChange: appetite
      .filter((a) => a.effect !== "strengthen")
      .map((a) => ({ evidence: a.fact, effect: a.effect })),
    measurementContract,
    output: decision.output,
    provisionalLeadId: decision.provisionalLeadId,
    lifecycle,
    stability,
    appetite,
  };
}

function lifecycleFor(
  output: PermittedOutput,
  confidence: QualityTier,
): LifecycleState {
  if (output !== "recommendation") return "provisional";
  if (confidence === "verified") return "confirmed";
  return "substantiated";
}

function describeDiscovery(chain: readonly LinkAnalysis[]): string {
  const strengths = chain.filter((l) => l.status === "strength").map((l) => l.link);
  const gaps = chain.filter((l) => l.status === "gap").map((l) => l.link);
  const unknowns = chain.filter((l) => l.status === "unknown").map((l) => l.link);
  const parts: string[] = [];
  if (strengths.length) parts.push(`Strengths: ${strengths.join(", ")}.`);
  if (gaps.length) parts.push(`Gaps: ${gaps.join(", ")}.`);
  if (unknowns.length)
    parts.push(`Unknown (no usable evidence): ${unknowns.join(", ")}.`);
  return parts.join(" ");
}

function collectAssumptions(
  goal: CustomerGoal,
  constraint: ConstraintResult,
  appetite: readonly EvidenceAppetiteItem[],
): Assumption[] {
  const out: Assumption[] = [];
  if (!atLeast(goal.confidence, "observed")) {
    out.push({
      statement: `Goal is taken as: "${goal.statement}"`,
      tier: goal.confidence,
      verifyBy: "Owner interview",
    });
  }
  for (const link of constraint.hypotheses) {
    const src =
      appetite.find((a) => a.why.includes(link))?.source ??
      "Owner interview / connected systems";
    out.push({
      statement: `${link} performance is unknown and assumed non-blocking until measured.`,
      tier: "unknown",
      verifyBy: src,
    });
  }
  return out;
}

function collectValidityConditions(
  chain: readonly LinkAnalysis[],
  leadOrRec: TransformationOption | null,
): { condition: string; validityWindowDays?: number }[] {
  const out: { condition: string; validityWindowDays?: number }[] = [];
  for (const l of chain) {
    if (l.status === "strength") {
      out.push({
        condition: `${l.link} remains a strength: ${l.rationale}`,
        validityWindowDays: 90,
      });
    }
  }
  if (leadOrRec) {
    out.push({ condition: `Precondition holds: ${leadOrRec.precondition}` });
  }
  return out;
}

// --- small helpers ---------------------------------------------------------

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
