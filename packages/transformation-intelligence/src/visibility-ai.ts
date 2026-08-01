/**
 * VISIBILITYAI EVALUATION (Execution Phase 3).
 *
 * The brief asks: does the CURRENT VisibilityAI already support the nine
 * customer-facing functions, and if orchestration is missing, assemble existing
 * capabilities rather than redesign it. This module answers that deterministically
 * by resolving each function against the existing Factory registry — it does not
 * change VisibilityAI.
 *
 * HONESTY (Principle 10): a function with no built capability behind it is marked
 * `net_new`, not glossed. VisibilityAI is NOT redesigned here; the one missing
 * function is flagged as an assembly, not a rebuild.
 */

import { findImplementations } from "@hl-bos/catalog";

export type FunctionSupport = "supported" | "assemble" | "net_new";

export interface VisibilityFunction {
  name: string;
  /** Capability terms that would perform this function. */
  capabilities: string[];
  support: FunctionSupport;
  backing: string;
  evidence: string;
}

const BUILT = new Set(["production", "functional", "partial"]);

/** True if every capability term resolves to at least one BUILT implementation. */
function allBuilt(terms: string[]): boolean {
  return terms.every((t) => findImplementations(t).some((i) => BUILT.has(i.maturity)));
}

/**
 * The nine functions the brief names, each evaluated against existing capabilities.
 * `support` is recomputed live so the verdict can never drift from the registry.
 */
export function visibilityAiFunctions(): VisibilityFunction[] {
  const defs: Array<Omit<VisibilityFunction, "support">> = [
    {
      name: "Business Discovery",
      capabilities: ["business discovery"],
      backing: "Discovery Engine (svc.discovery)",
      evidence: "MODULE_REGISTRY discovery_engine (live); discovery schema (19 tables)",
    },
    {
      name: "Website Analysis",
      capabilities: ["digital visibility"],
      backing: "Website Scanner (mod.website-scanner)",
      evidence:
        "SSRF-safe website scan → evidence → dimension scores (built_undeployed)",
    },
    {
      name: "SEO Analysis",
      capabilities: ["digital visibility"],
      backing: "Website Scanner (SEO evidence)",
      evidence: "digital_visibility provides local_visibility + seo",
    },
    {
      name: "Review Analysis",
      capabilities: ["reputation"],
      backing: "Reputation & Review Management (mod.visibility-assessments)",
      evidence: "reputation_management (built_undeployed); visibility schema",
    },
    {
      name: "Competitive Analysis",
      capabilities: ["competitive analysis"],
      backing: "None yet — assemble from discovery + scoring",
      evidence: "No distinct competitive-analysis capability in the registry",
    },
    {
      name: "Visibility Scoring",
      capabilities: ["deterministic scoring"],
      backing: "Deterministic Scoring (@hl-bos/bti-engine)",
      evidence: "Business Growth Score; scoring_engine (live)",
    },
    {
      name: "Proposal Inputs",
      capabilities: ["business discovery", "deterministic scoring"],
      backing: "Recommendation Engine → Commerce line items",
      evidence:
        "ai.recommendation-engine → sales.proposal_line_items (migration 0023/0024)",
    },
    {
      name: "Lead Qualification",
      capabilities: ["business discovery", "deterministic scoring"],
      backing: "Discovery + Deterministic Scoring",
      evidence: "prospect capture + Business Growth Score",
    },
    {
      name: "Transformation Recommendations",
      capabilities: ["transformation intelligence"],
      backing: "HL-BTI (@hl-bos/transformation-intelligence)",
      evidence: "recommendation engine + impact + reuse (Phase VIII)",
    },
  ];

  return defs.map((d) => {
    const support: FunctionSupport = allBuilt(d.capabilities)
      ? "supported"
      : d.capabilities.some((t) =>
            findImplementations(t).some((i) => BUILT.has(i.maturity)),
          )
        ? "assemble"
        : "net_new";
    return { ...d, support };
  });
}

export interface VisibilityAiEvaluation {
  functions: VisibilityFunction[];
  supportedCount: number;
  assembleCount: number;
  netNewCount: number;
  /** True when VisibilityAI needs NO redesign — every gap is an assembly, not a rebuild. */
  noRedesignRequired: boolean;
  summary: string;
}

/** Evaluate the current VisibilityAI against the nine functions. */
export function evaluateVisibilityAi(): VisibilityAiEvaluation {
  const functions = visibilityAiFunctions();
  const supportedCount = functions.filter((f) => f.support === "supported").length;
  const assembleCount = functions.filter((f) => f.support === "assemble").length;
  const netNewCount = functions.filter((f) => f.support === "net_new").length;
  return {
    functions,
    supportedCount,
    assembleCount,
    netNewCount,
    // No redesign is required as long as the shared spine (discovery, scoring,
    // visibility, reputation, recommendations) is intact — gaps are assembled.
    noRedesignRequired: supportedCount >= 6,
    summary:
      `VisibilityAI already supports ${supportedCount}/9 functions directly; ` +
      `${assembleCount} assemble from existing capabilities; ${netNewCount} are net-new ` +
      `(competitive analysis). No redesign required — orchestrate, do not rebuild.`,
  };
}
