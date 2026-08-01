/**
 * THE CUSTOMER MANUFACTURING LIFECYCLE (Execution Phase 3, CP2).
 *
 * Herman Legacy becomes the first production customer of the Software Factory.
 * This is the ONE standardized lifecycle every customer moves through — and it
 * is an ASSEMBLY, not a new engine:
 *
 *   - the ordered state machine is the EXISTING `@hl-bos/bti-engine` engagement
 *     lifecycle (`ORDER`, `canAdvance`, the analysis-only cap). We do not build a
 *     second workflow engine.
 *   - each stage's work is resolved by the EXISTING cross-platform assembler
 *     (`@hl-bos/catalog` `assembleBlueprint`) over existing capabilities.
 *   - each stage is backed by assets that ALREADY EXIST in the Enterprise Catalog;
 *     the lifecycle introduces no new system (proven by `noDuplicateSystems`).
 *
 * The 21 customer stages are a finer-grained VIEW over the 12 canonical
 * engagement stages — the customer-facing choreography, riding on the real
 * machine underneath.
 *
 * HONESTY (Principle 10): a stage with net-new work is reported as such; nothing
 * is dressed up. The end-to-end validation walks the plumbing, not a fabricated
 * customer.
 */

import {
  ORDER,
  STAGE_LABELS,
  canAdvance,
  stageRank,
  ANALYSIS_ONLY_CAP_RANK,
  type Stage,
  type EngagementMode,
} from "@hl-bos/bti-engine";
import {
  assembleBlueprint,
  buildCatalog,
  type FactoryAssemblyBlueprint,
} from "@hl-bos/catalog";

export interface CustomerStageSpec {
  seq: number;
  name: string;
  purpose: string;
  /** The canonical engagement stage (from bti-engine) this customer stage rides on. */
  engagementStage: Stage;
  /** The existing system that performs this stage. */
  backingSystem: string;
  /** Enterprise-Catalog asset ids this stage is backed by — all must already exist. */
  backingAssets: string[];
  /** Capability terms the stage runs on (resolved by the assembler). */
  capabilities: string[];
  /** Capabilities known to be net-new. */
  knownNetNew?: string[];
}

/**
 * The 21-stage Customer Manufacturing lifecycle. Each stage names the existing
 * engagement stage it rides on and the existing catalog assets that back it.
 */
export const CUSTOMER_LIFECYCLE: CustomerStageSpec[] = [
  {
    seq: 1,
    name: "Lead Discovery",
    purpose: "Find prospective customers.",
    engagementStage: "prospect",
    backingSystem: "VisibilityAI + Discovery",
    backingAssets: ["prod.visibility-ai", "svc.discovery"],
    capabilities: ["business discovery", "communications"],
  },
  {
    seq: 2,
    name: "Lead Qualification",
    purpose: "Score and qualify the lead.",
    engagementStage: "lead_qualification",
    backingSystem: "VisibilityAI + Deterministic Scoring",
    backingAssets: ["prod.visibility-ai", "ai.deterministic-scoring"],
    capabilities: ["business discovery", "deterministic scoring"],
  },
  {
    seq: 3,
    name: "Visibility Assessment",
    purpose: "Assess the prospect's digital visibility and reputation.",
    engagementStage: "business_discovery",
    backingSystem: "VisibilityAI",
    backingAssets: ["prod.visibility-ai", "mod.visibility-assessments"],
    capabilities: ["digital visibility", "reputation"],
  },
  {
    seq: 4,
    name: "Business Intelligence Assessment",
    purpose: "Collect evidence into a unified business profile.",
    engagementStage: "business_discovery",
    backingSystem: "Discovery Engine",
    backingAssets: ["svc.discovery", "mod.discovery-engine"],
    capabilities: ["business discovery", "deterministic scoring"],
  },
  {
    seq: 5,
    name: "HL-BTI Assessment",
    purpose: "Score the business and produce the transformation blueprint.",
    engagementStage: "assessment",
    backingSystem: "HL-BTI",
    backingAssets: ["prod.hl-bti", "pkg.transformation-intelligence"],
    capabilities: [
      "deterministic scoring",
      "transformation intelligence",
      "blueprint generation",
    ],
  },
  {
    seq: 6,
    name: "Executive Report",
    purpose: "Executive-facing findings, recommendations and impact.",
    engagementStage: "executive_analysis",
    backingSystem: "HL-BTI Executive Dashboards",
    backingAssets: ["mod.bti-platform", "prod.hl-bti"],
    capabilities: ["executive dashboards", "transformation intelligence"],
  },
  {
    seq: 7,
    name: "Proposal Generation",
    purpose: "Turn the blueprint into a proposal with line items and pricing.",
    engagementStage: "proposal",
    backingSystem: "Commerce & Provisioning",
    backingAssets: ["svc.commerce-provisioning", "mod.commerce-provisioning"],
    capabilities: ["commerce provisioning", "documents"],
  },
  {
    seq: 8,
    name: "Proposal Approval",
    purpose: "Customer reviews and approves the proposal.",
    engagementStage: "customer_approval",
    backingSystem: "Workflows (human-approval gate)",
    backingAssets: ["svc.workflows", "wf.human-approval-gate"],
    capabilities: ["human approval", "communications"],
  },
  {
    seq: 9,
    name: "Agreement",
    purpose: "Agreement acceptance and countersignature.",
    engagementStage: "customer_approval",
    backingSystem: "Commerce (agreements)",
    backingAssets: ["svc.commerce-provisioning"],
    capabilities: ["commerce provisioning", "documents"],
  },
  {
    seq: 10,
    name: "Project Creation",
    purpose: "Create the delivery project / work order.",
    engagementStage: "implementation",
    backingSystem: "Provisioning (work orders)",
    backingAssets: ["svc.commerce-provisioning", "wf.provisioning-readiness"],
    capabilities: ["commerce provisioning", "workflow"],
  },
  {
    seq: 11,
    name: "Assembly Planning",
    purpose: "Plan the Factory assembly for the customer's transformation.",
    engagementStage: "implementation",
    backingSystem: "Software Factory (assembler)",
    backingAssets: ["mod.hlvs-factory", "pkg.catalog"],
    capabilities: ["software factory", "enterprise catalog"],
  },
  {
    seq: 12,
    name: "Capability Selection",
    purpose: "Select the reusable capabilities to assemble from.",
    engagementStage: "implementation",
    backingSystem: "Factory Registry + reuse governance",
    backingAssets: ["pkg.catalog", "ai.duplicate-check"],
    capabilities: ["enterprise catalog", "software factory"],
  },
  {
    seq: 13,
    name: "Transformation Execution",
    purpose: "Execute the approved transformation work (gated).",
    engagementStage: "implementation",
    backingSystem: "Factory lifecycle + workflows",
    backingAssets: ["mod.hlvs-factory", "svc.workflows"],
    capabilities: ["software factory", "human approval"],
  },
  {
    seq: 14,
    name: "Deployment",
    purpose: "Deploy the assembled product (gated).",
    engagementStage: "project_management",
    backingSystem: "Application Registry + gated deployment",
    backingAssets: ["pkg.catalog", "svc.workflows"],
    capabilities: ["application registry", "human approval"],
  },
  {
    seq: 15,
    name: "Customer Training",
    purpose: "Deliver training content and onboarding.",
    engagementStage: "project_management",
    backingSystem: "Documents + Communications",
    backingAssets: ["svc.storage", "svc.comms"],
    capabilities: ["documents", "communications"],
  },
  {
    seq: 16,
    name: "Subscription Activation",
    purpose: "Activate the recurring subscription and entitlements.",
    engagementStage: "project_management",
    backingSystem: "Billing + Entitlements",
    backingAssets: ["svc.billing", "svc.entitlements"],
    capabilities: ["billing", "payments", "entitlements"],
  },
  {
    seq: 17,
    name: "Customer Success",
    purpose: "Drive adoption, health and outcomes after go-live.",
    engagementStage: "roi_tracking",
    backingSystem: "Intelligence CRM + Communications",
    backingAssets: ["svc.comms", "mod.bti-platform"],
    capabilities: [
      "crm",
      "communications",
      "executive dashboards",
      "customer success desk",
    ],
    knownNetNew: ["customer success desk"],
  },
  {
    seq: 18,
    name: "Quarterly Business Reviews",
    purpose: "Recurring executive review of ROI and next steps.",
    engagementStage: "roi_tracking",
    backingSystem: "HL-BTI ROI + Executive Dashboards",
    backingAssets: ["mod.bti-platform", "pkg.transformation-intelligence"],
    capabilities: ["executive dashboards", "transformation intelligence"],
  },
  {
    seq: 19,
    name: "Expansion Opportunities",
    purpose: "Identify cross-sell / upsell via the portfolio engine.",
    engagementStage: "monthly_partnership",
    backingSystem: "Portfolio Engine (evaluateIdea)",
    backingAssets: ["pkg.catalog", "pkg.transformation-intelligence"],
    capabilities: ["enterprise catalog", "transformation intelligence"],
  },
  {
    seq: 20,
    name: "Renewal",
    purpose: "Renew the subscription.",
    engagementStage: "monthly_partnership",
    backingSystem: "Billing + CRM",
    backingAssets: ["svc.billing", "svc.comms"],
    capabilities: ["billing", "crm", "communications"],
  },
  {
    seq: 21,
    name: "Referral Program",
    purpose: "Capture referrals from satisfied customers.",
    engagementStage: "monthly_partnership",
    backingSystem: "CRM + Communications (referral tracking net-new)",
    backingAssets: ["svc.comms"],
    capabilities: ["crm", "communications", "referral program"],
    knownNetNew: ["referral program"],
  },
];

export type StageReadiness = "operational" | "assemblable" | "partial" | "gap";

export interface CustomerStageResult {
  seq: number;
  name: string;
  engagementStage: Stage;
  engagementStageLabel: string;
  backingSystem: string;
  readiness: StageReadiness;
  assemblyPct: number;
  netNew: string[];
  blueprint: FactoryAssemblyBlueprint;
}

export interface CustomerLifecycleResult {
  stages: CustomerStageResult[];
  operationalCount: number;
  assemblableCount: number;
  partialCount: number;
  gapCount: number;
  netNewCapabilities: string[];
  assemblablePct: number;
  /** The distinct engagement stages the lifecycle rides on, in order. */
  engagementPath: Stage[];
  /** Proof: the engagement path is a valid walk of the reused bti-engine machine. */
  engagementPathValid: boolean;
}

function readinessFor(bp: FactoryAssemblyBlueprint): StageReadiness {
  if (bp.netNewCount > 0) {
    return bp.reuseCount + bp.crossPlatformCount + bp.extendCount > 0
      ? "partial"
      : "gap";
  }
  if (bp.extendCount > 0 || bp.crossPlatformCount > 0) return "assemblable";
  return bp.slots.every((s) => s.disposition === "reuse")
    ? "operational"
    : "assemblable";
}

/**
 * Validate that the ordered engagement stages the lifecycle rides on form a legal
 * FORWARD walk of the EXISTING bti-engine machine. The customer-facing view is
 * coarser than the DB state machine — several customer steps can share one
 * engagement stage, and the view may group across a DB stage it doesn't surface
 * (e.g. `blueprint`). So the honest properties are:
 *   - every stage is a real `ORDER` stage (we ride the real machine);
 *   - ranks are strictly increasing across distinct stages (forward only);
 *   - adjacent (one-step) transitions satisfy the reused `canAdvance`;
 *   - the analysis-only cap is respected in analysis_only mode.
 */
export function isForwardEngagementWalk(
  path: Stage[],
  mode: EngagementMode = "full_transformation",
): boolean {
  return validateEngagementPath(path, mode);
}

function validateEngagementPath(path: Stage[], mode: EngagementMode): boolean {
  const distinct: Stage[] = [];
  for (const s of path) {
    if (!ORDER.includes(s)) return false;
    if (distinct[distinct.length - 1] !== s) distinct.push(s);
  }
  for (let i = 0; i < distinct.length - 1; i++) {
    const from = distinct[i]!;
    const to = distinct[i + 1]!;
    const fromRank = stageRank(from);
    const toRank = stageRank(to);
    if (toRank <= fromRank) return false; // forward only
    if (mode === "analysis_only" && toRank > ANALYSIS_ONLY_CAP_RANK) return false;
    // Where the customer view is adjacent to the DB machine, reuse its rule.
    if (toRank === fromRank + 1 && !canAdvance(from, to, mode).ok) return false;
  }
  return true;
}

/** Assemble the full customer manufacturing lifecycle over existing capabilities. */
export function customerManufacturingLifecycle(
  mode: EngagementMode = "full_transformation",
): CustomerLifecycleResult {
  const stages: CustomerStageResult[] = CUSTOMER_LIFECYCLE.map((s) => {
    const bp = assembleBlueprint({
      productKey: `clc_${s.seq}`,
      name: s.name,
      market: "consulting",
      targetPlatform: "hlbos_core",
      requiredCapabilities: s.capabilities,
      ...(s.knownNetNew ? { knownNetNew: s.knownNetNew } : {}),
    });
    const slots = bp.slots.length;
    const assemblyPct =
      slots === 0 ? 0 : Math.round(((slots - bp.netNewCount) / slots) * 100);
    return {
      seq: s.seq,
      name: s.name,
      engagementStage: s.engagementStage,
      engagementStageLabel: STAGE_LABELS[s.engagementStage],
      backingSystem: s.backingSystem,
      readiness: readinessFor(bp),
      assemblyPct,
      netNew: bp.netNewCapabilities,
      blueprint: bp,
    };
  });

  const engagementPath = CUSTOMER_LIFECYCLE.map((s) => s.engagementStage);
  return {
    stages,
    operationalCount: stages.filter((s) => s.readiness === "operational").length,
    assemblableCount: stages.filter((s) => s.readiness === "assemblable").length,
    partialCount: stages.filter((s) => s.readiness === "partial").length,
    gapCount: stages.filter((s) => s.readiness === "gap").length,
    netNewCapabilities: [...new Set(stages.flatMap((s) => s.netNew))].sort(),
    assemblablePct: Math.round(
      (stages.filter((s) => s.blueprint.netNewCount === 0).length / stages.length) *
        100,
    ),
    engagementPath,
    engagementPathValid: validateEngagementPath(engagementPath, mode),
  };
}

// ==========================================================================
// "No duplicate systems" proof — every stage is backed by an EXISTING asset
// ==========================================================================

export interface DuplicateSystemsCheck {
  ok: boolean;
  /** backingAsset ids referenced by the lifecycle that do NOT exist in the catalog. */
  unknownAssets: string[];
  /** Distinct existing catalog assets the whole lifecycle reuses. */
  reusedAssets: string[];
}

/**
 * Prove the lifecycle introduces no new system: every `backingAssets` id must
 * already exist in the Enterprise Catalog. A non-empty `unknownAssets` means a
 * stage relies on something not in the catalog — a duplicate-system smell.
 */
export function noDuplicateSystems(): DuplicateSystemsCheck {
  const known = new Set(buildCatalog().assets.map((a) => a.id));
  const referenced = [...new Set(CUSTOMER_LIFECYCLE.flatMap((s) => s.backingAssets))];
  const unknownAssets = referenced.filter((id) => !known.has(id));
  return {
    ok: unknownAssets.length === 0,
    unknownAssets,
    reusedAssets: referenced.filter((id) => known.has(id)).sort(),
  };
}

// Re-export the engagement ordering so consumers can see the reused machine.
export { ORDER as ENGAGEMENT_ORDER, STAGE_LABELS as ENGAGEMENT_STAGE_LABELS };
