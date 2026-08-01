/**
 * Reuse analysis — DETERMINISTIC, computed over the real @hl-bos/catalog.
 *
 * The reuse score is NOT an AI opinion. It is a reproducible function of the
 * catalog's own duplicate/reuse engine (`evaluateReuse` / `duplicateCheck`) plus
 * a published multiplier per verdict. Given the same opportunity input and the
 * same catalog, it always returns the same score, and the formula is exposed so
 * the CEO can see exactly how it was calculated.
 */

import {
  evaluateReuse,
  MODULE_REGISTRY,
  moduleIsBuilt,
  type ProposedCapability,
  type CapabilityMatch,
  type DuplicateVerdict,
} from "@hl-bos/catalog";
import type { Confidence } from "./types";

export interface OpportunityForReuse {
  title: string;
  summary?: string;
  domain?: ProposedCapability["domain"];
  industries?: string[];
  technical?: { schema?: string; package?: string };
}

/** Published, deterministic multiplier: "% of required capability already owned". */
const REUSE_MULTIPLIER: Record<DuplicateVerdict, number> = {
  REUSE_EXISTING: 1.0,
  EXTEND_EXISTING: 0.8,
  CONSOLIDATE_DUPLICATES: 0.7,
  POSSIBLE_OVERLAP: 0.5,
  MANUAL_REVIEW_REQUIRED: 0.4,
  BUILD_NEW: 0.1,
};

export interface ReuseAnalysis {
  /** 0–100, measured (deterministic) — the trustworthy headline metric. */
  reuseScore: number;
  verdict: DuplicateVerdict;
  matchScore: number;
  matches: CapabilityMatch[];
  relatedModules: { key: string; name: string; built: boolean }[];
  dependencies: string[];
  risks: string[];
  requiresHumanReview: boolean;
  /** Plain-language description of exactly how reuseScore was computed. */
  formula: string;
  confidence: Confidence;
}

function proposedFrom(o: OpportunityForReuse): ProposedCapability {
  const p: ProposedCapability = { name: o.title };
  if (o.summary) p.functionalPurpose = o.summary;
  if (o.domain) p.domain = o.domain;
  if (o.industries && o.industries.length > 0) p.industries = o.industries;
  if (o.technical) p.technical = o.technical;
  return p;
}

/**
 * Compute the reuse analysis for an opportunity against the live catalog.
 * Deterministic: no randomness, no AI, no I/O.
 */
export function analyzeReuse(o: OpportunityForReuse): ReuseAnalysis {
  const proposed = proposedFrom(o);
  const decision = evaluateReuse(proposed);

  const multiplier = REUSE_MULTIPLIER[decision.recommendedAction];
  const reuseScore = Math.round(decision.matchScore * multiplier);

  // Related modules: deterministic token match of the opportunity text against
  // the reusable engineering modules (name or capability category).
  const hay = `${o.title} ${o.summary ?? ""}`.toLowerCase();
  const relatedModules = MODULE_REGISTRY.filter(
    (m) =>
      hay.includes(m.name.toLowerCase()) ||
      hay.includes(m.capabilityCategory.toLowerCase()),
  ).map((m) => ({ key: m.key, name: m.name, built: moduleIsBuilt(m) }));

  // Confidence follows the verdict's ambiguity.
  const confidence: Confidence = decision.requiredHumanReview
    ? decision.recommendedAction === "MANUAL_REVIEW_REQUIRED"
      ? "low"
      : "medium"
    : "high";

  return {
    reuseScore,
    verdict: decision.recommendedAction,
    matchScore: decision.matchScore,
    matches: decision.bestMatches,
    relatedModules,
    dependencies: decision.dependencies,
    risks: decision.risks,
    requiresHumanReview: decision.requiredHumanReview,
    formula: `reuseScore = matchScore(${decision.matchScore}) × ${multiplier} [verdict=${decision.recommendedAction}] = ${reuseScore}`,
    confidence,
  };
}
