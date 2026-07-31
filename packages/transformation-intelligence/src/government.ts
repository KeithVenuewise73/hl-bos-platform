/**
 * Government Contracts intelligence.
 *
 * A deterministic, configurable, evidence-gated assessment of a government
 * opportunity, answering the brief's chain: opportunity → win probability →
 * capability gaps → estimated profit → recommended actions → CEO recommendation.
 *
 * Honesty rules hold here too:
 *   - Win probability is null unless required capabilities are supplied; it is a
 *     capability-match ratio, never a fabricated percentage.
 *   - Capability gaps are computed against our REAL registered capabilities
 *     (@hl-bos/catalog), not asserted.
 *   - Estimated profit is null unless a contract value is supplied; when supplied
 *     it is value × a transparent, configurable margin, flagged illustrative.
 *   - The bid/no-bid decision is a CEO decision — the engine recommends, and
 *     attaches the required CEO approval. It never decides.
 */

import { buildCatalog, assetsByKind } from "@hl-bos/catalog";
import type { EngineConfig } from "./config";
import type { ApprovalRequirement } from "./approval";

export interface OurCapability {
  key: string;
  name: string;
}

/** Our registered business capabilities, from the Enterprise Catalog. */
export function ourCapabilities(): OurCapability[] {
  const catalog = buildCatalog();
  return assetsByKind(catalog, "business_capability").map((a) => ({
    key: a.id.replace(/^cap\./, ""),
    name: a.name,
  }));
}

export interface GovOpportunity {
  id: string;
  title: string;
  agency?: string;
  naics?: string;
  /** Contract value if known; null/undefined => profit cannot be estimated. */
  value?: number | null;
  /** Optional per-opportunity margin override (fraction). */
  marginFraction?: number;
  dueInDays?: number;
  /** Capabilities the solicitation requires (keys or human names). */
  requiredCapabilities: string[];
}

export type WinBand = "high" | "medium" | "low";

export interface CapabilityGap {
  capability: string;
  have: boolean;
  matchedTo: string | null;
}

export interface GovProfit {
  contractValue: number | null;
  marginFraction: number;
  estimatedProfit: number | null;
  illustrative: boolean;
  basis: string;
  note: string;
}

export type GovVerdict =
  "pursue" | "pursue_with_partner" | "decline" | "insufficient_data";

export interface GovAssessment {
  opportunity: GovOpportunity;
  winProbability: { band: WinBand | null; score: number | null; basis: string };
  capabilityGaps: CapabilityGap[];
  haveCount: number;
  gapCount: number;
  estimatedProfit: GovProfit;
  recommendedActions: string[];
  ceoRecommendation: {
    verdict: GovVerdict;
    reason: string;
    approval: ApprovalRequirement;
  };
}

function matchCapability(req: string, ours: OurCapability[]): string | null {
  const r = req.toLowerCase().trim();
  for (const c of ours) {
    if (c.key.toLowerCase() === r || c.name.toLowerCase() === r) return c.name;
  }
  for (const c of ours) {
    if (c.name.toLowerCase().includes(r) || r.includes(c.key.toLowerCase())) {
      return c.name;
    }
  }
  return null;
}

/** Assess one government opportunity. Pure and deterministic. */
export function assessGovOpportunity(
  opp: GovOpportunity,
  config: EngineConfig,
  capabilities: OurCapability[] = ourCapabilities(),
): GovAssessment {
  const gaps: CapabilityGap[] = opp.requiredCapabilities.map((req) => {
    const matchedTo = matchCapability(req, capabilities);
    return { capability: req, have: matchedTo !== null, matchedTo };
  });
  const haveCount = gaps.filter((g) => g.have).length;
  const gapCount = gaps.length - haveCount;

  // Win probability = capability-match ratio; null if nothing to match.
  const ratio = gaps.length === 0 ? null : haveCount / gaps.length;
  const bands = config.government.winProbabilityBands;
  const band: WinBand | null =
    ratio === null
      ? null
      : ratio >= bands.high
        ? "high"
        : ratio >= bands.medium
          ? "medium"
          : "low";
  const winProbability = {
    band,
    score: ratio === null ? null : Math.round(ratio * 100),
    basis:
      ratio === null
        ? "No required capabilities supplied — win probability cannot be estimated."
        : `${haveCount}/${gaps.length} required capabilities already registered.`,
  };

  // Estimated profit — evidence-gated on a supplied contract value.
  const margin = opp.marginFraction ?? config.government.assumedMarginFraction;
  const value = opp.value ?? null;
  const estimatedProfit: GovProfit =
    value === null
      ? {
          contractValue: null,
          marginFraction: margin,
          estimatedProfit: null,
          illustrative: false,
          basis: "Requires a supplied contract value.",
          note: "Additional financial information required — profit withheld.",
        }
      : {
          contractValue: value,
          marginFraction: margin,
          estimatedProfit: Math.round(value * margin),
          illustrative: true,
          basis: `${Math.round(margin * 100)}% assumed gross margin on ${value} contract value.`,
          note: "Illustrative; actual margin depends on the priced bid.",
        };

  const recommendedActions = buildActions(gaps, opp);

  const ceoRecommendation = decide(band, ratio, gapCount, value);

  return {
    opportunity: opp,
    winProbability,
    capabilityGaps: gaps,
    haveCount,
    gapCount,
    estimatedProfit,
    recommendedActions,
    ceoRecommendation,
  };
}

function buildActions(gaps: CapabilityGap[], opp: GovOpportunity): string[] {
  const actions: string[] = [];
  const missing = gaps.filter((g) => !g.have).map((g) => g.capability);
  if (missing.length === 0 && gaps.length > 0) {
    actions.push(
      "All required capabilities are registered — prepare the capability statement and bid.",
    );
  }
  for (const m of missing) {
    actions.push(
      `Close the "${m}" gap: build via the Software Factory, or partner/subcontract for it.`,
    );
  }
  if (opp.dueInDays !== undefined && opp.dueInDays <= 14) {
    actions.push(`Deadline in ${opp.dueInDays} days — decide bid/no-bid immediately.`);
  }
  actions.push(
    "Confirm past-performance and compliance (registrations, certifications) before committing.",
  );
  return actions;
}

function decide(
  band: WinBand | null,
  ratio: number | null,
  gapCount: number,
  value: number | null,
): GovAssessment["ceoRecommendation"] {
  const approval: ApprovalRequirement = {
    required: true,
    type: "ceo_spend",
    reason:
      "Pursuing a bid commits proposal resources and, if won, delivery spend — a CEO bid/no-bid decision.",
    gate: "workflows.human_approval_gate",
  };

  if (band === null || ratio === null) {
    return {
      verdict: "insufficient_data",
      reason:
        "Required capabilities were not supplied; capability fit cannot be judged.",
      approval,
    };
  }
  if (band === "high" && gapCount === 0) {
    return {
      verdict: "pursue",
      reason: `Strong capability fit (${Math.round(ratio * 100)}%) with no gaps${value === null ? "" : "; profit estimate available"}.`,
      approval,
    };
  }
  if (band === "high" || band === "medium") {
    return {
      verdict: "pursue_with_partner",
      reason: `Capability fit is ${Math.round(ratio * 100)}% with ${gapCount} gap(s); a teaming partner or Factory build closes them.`,
      approval,
    };
  }
  return {
    verdict: "decline",
    reason: `Low capability fit (${Math.round(ratio * 100)}%); ${gapCount} gap(s) make a competitive bid unlikely without significant investment.`,
    approval,
  };
}
