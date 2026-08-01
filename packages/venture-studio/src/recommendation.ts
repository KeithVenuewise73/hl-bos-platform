/**
 * Advisory recommendation vs. authoritative decision — the separation that keeps
 * the platform honest. An AI recommendation is NEVER a decision. This module
 * encodes that boundary and computes the read-only Factory readiness preview.
 */

import type { Decision, Recommendation } from "./types";
import type { ReuseAnalysis } from "./reuse";
import type { EvaluationSummary } from "./evaluation";

/** An AI recommendation record. `authoritative` is ALWAYS false by construction. */
export interface AdvisoryRecommendation {
  recommendation: Recommendation;
  rationale: string;
  confidence: "high" | "medium" | "low";
  authoritative: false;
  aiRunId: string | null;
  model: string | null;
  promptVersion: string | null;
}

export function advisory(
  recommendation: Recommendation,
  rationale: string,
  confidence: "high" | "medium" | "low",
  provenance: { aiRunId?: string; model?: string; promptVersion?: string } = {},
): AdvisoryRecommendation {
  return {
    recommendation,
    rationale,
    confidence,
    authoritative: false,
    aiRunId: provenance.aiRunId ?? null,
    model: provenance.model ?? null,
    promptVersion: provenance.promptVersion ?? null,
  };
}

/**
 * The guard the app + DB both enforce: a recommendation may inform, but may
 * never BE, a decision. This returns false for any attempt to treat an advisory
 * artifact as authoritative — there is no silent promotion path.
 */
export function isAuthoritative(x: { authoritative: boolean }): boolean {
  return x.authoritative === true;
}

// --- Factory readiness (read-only preview; V2-1 creates NO Factory work) -----

export const DECISIONS_ELIGIBLE_FOR_FACTORY: readonly Decision[] = ["build"];

export interface FactoryReadinessInput {
  decision: Decision | null;
  evaluation: EvaluationSummary | null;
  reuse: ReuseAnalysis | null;
  evidenceCount: number;
  hasVerifiedEvidence: boolean;
}

export interface FactoryReadiness {
  /** True only when a Build decision exists AND no blockers remain. Still NOT executable in V2-1. */
  ready: boolean;
  /** Always false in V2-1 — the preview never creates a creation order. */
  executable: false;
  blockers: string[];
  reusableCapabilityCount: number;
  missingCapabilityNote: string;
}

/**
 * Compute whether an opportunity WOULD be ready to hand to the hlvs Factory.
 * Pure preview: never writes, never returns `executable: true`.
 */
export function computeFactoryReadiness(
  input: FactoryReadinessInput,
): FactoryReadiness {
  const blockers: string[] = [];

  if (input.decision === null) {
    blockers.push("No CEO decision recorded.");
  } else if (!DECISIONS_ELIGIBLE_FOR_FACTORY.includes(input.decision)) {
    blockers.push(`CEO decision is "${input.decision}", not "build".`);
  }

  if (input.evaluation === null || input.evaluation.composite === null) {
    blockers.push("No structured evaluation on record.");
  }

  if (input.evidenceCount === 0) {
    blockers.push("No evidence attached.");
  } else if (!input.hasVerifiedEvidence) {
    blockers.push(
      "No verified-fact evidence attached (only claims/estimates/inferences).",
    );
  }

  if (input.reuse === null) {
    blockers.push("No reuse analysis computed.");
  }

  const reusableCapabilityCount = input.reuse ? input.reuse.matches.length : 0;

  return {
    ready: blockers.length === 0,
    executable: false,
    blockers,
    reusableCapabilityCount,
    missingCapabilityNote:
      input.reuse && input.reuse.verdict === "BUILD_NEW"
        ? "Mostly net-new capability — Factory would build, not assemble."
        : "Reusable capabilities identified — Factory would assemble on existing modules.",
  };
}
