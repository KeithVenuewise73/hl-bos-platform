/**
 * The v2 Recommendation Engine.
 *
 * It does NOT re-derive findings — the existing consulting engine already
 * produces the 12-part Problem → Root Cause → Priority → Solution → HL-service
 * chain. This layer ENRICHES each finding into an executive recommendation that
 * answers all five questions the brief mandates:
 *
 *   1. What happened?            → problem            (from the finding)
 *   2. Why?                      → rootCause          (INFERENCE, from the finding)
 *   3. What should we do?        → solution           (from the finding)
 *   4. Estimated business impact → revenueImpact      (this package, evidence-gated)
 *   5. What approval is required → approvals          (this package, deterministic)
 *
 * plus the reusable Herman Legacy product and its Software Factory reuse picture.
 */

import type { DomainKey, Priority, consulting } from "@hl-bos/bti-engine";
import type { EngineConfig } from "./config";
import type { FinancialInput, ImpactEstimate, RoiBand } from "./impact";
import { estimateFindingImpact } from "./impact";
import { factoryReuseForService, type FactoryReuse } from "./factory";
import {
  approvalsForRecommendation,
  dedupeApprovals,
  type ApprovalRequirement,
} from "./approval";
import { ASSESSMENT_AREAS } from "./framework";

export interface TransformationRecommendation {
  id: string;
  /** The assessment area (of the 15) this maps to, if any. */
  area: string | null;
  domain: DomainKey;
  dimension: string;
  label: string;
  // --- the five executive questions ---
  problem: string;
  rootCause: string;
  priority: Priority;
  solution: string;
  revenueImpact: ImpactEstimate;
  approvals: ApprovalRequirement[];
  // --- reuse + provenance ---
  reusableProduct: { services: string[]; factory: FactoryReuse };
  roiBand: RoiBand | null;
  difficulty: string;
  timeline: string;
  successMetrics: string[];
  evidence: string[];
  claims: consulting.Claim[];
}

function areaFor(domain: DomainKey, dimension: string): string | null {
  const area = ASSESSMENT_AREAS.find((a) =>
    a.refs.some((r) => r.domain === domain && r.dimension === dimension),
  );
  return area ? area.key : null;
}

/** Enrich one consulting finding into an executive recommendation. */
export function toRecommendation(
  finding: consulting.Finding,
  financial: FinancialInput | undefined,
  config: EngineConfig,
): TransformationRecommendation {
  const primaryService = finding.services[0] ?? "Business Transformation Services";
  const factory = factoryReuseForService(primaryService);
  const revenueImpact = estimateFindingImpact(
    finding.domain,
    finding.priority,
    financial,
    config,
  );
  const approvals = dedupeApprovals(approvalsForRecommendation(factory));

  return {
    id: `${finding.domain}.${finding.dimension}`,
    area: areaFor(finding.domain, finding.dimension),
    domain: finding.domain,
    dimension: finding.dimension,
    label: finding.label,
    problem: finding.finding,
    rootCause: finding.rootCause,
    priority: finding.priority,
    solution: finding.recommendedAction,
    revenueImpact,
    approvals,
    reusableProduct: { services: finding.services, factory },
    roiBand: revenueImpact.roiBand,
    difficulty: finding.difficulty,
    timeline: finding.timeline,
    successMetrics: finding.successMetrics,
    evidence: finding.supportingEvidence,
    claims: finding.claims,
  };
}

/** Enrich all findings, preserving the consulting engine's priority ordering. */
export function buildRecommendations(
  findings: consulting.Finding[],
  financial: FinancialInput | undefined,
  config: EngineConfig,
): TransformationRecommendation[] {
  return findings.map((f) => toRecommendation(f, financial, config));
}
