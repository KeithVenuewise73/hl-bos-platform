/**
 * HERMAN LEGACY OPERATING MODEL (Execution Phase 2, Part 1).
 *
 * Herman Legacy becomes the FIRST company to operate entirely through the
 * Software Factory — "customer zero". This module expresses Herman Legacy's own
 * internal operating system as an assembly of existing platform capabilities: a
 * 14-stage value chain from lead to renewal, each stage resolved to the
 * capability implementations that already provide it, so the gaps are named
 * honestly rather than assumed.
 *
 * ASSEMBLE, DON'T REBUILD. This computes nothing new — it drives the existing
 * cross-platform assembler (`assembleBlueprint`) over each stage's capabilities
 * and reports what is reusable now vs net-new. Principle 10: a stage with no
 * built implementation is marked a gap, never dressed up as operational.
 */

import { assembleBlueprint, type FactoryAssemblyBlueprint } from "./factory-blueprints";
import type { SourcePlatformId } from "./factory-registry";

export interface OperatingStageSpec {
  seq: number;
  name: string;
  purpose: string;
  /** Capability terms this stage runs on (resolved against the Factory registry). */
  capabilities: string[];
}

/**
 * The Herman Legacy internal operating system — the exact stages named in the
 * Execution Phase 2 brief, in value-chain order. Each maps to existing platform
 * capabilities; the assembler decides what is real.
 */
export const HERMAN_LEGACY_OPERATING_MODEL: OperatingStageSpec[] = [
  {
    seq: 1,
    name: "Lead Discovery",
    purpose: "Find and qualify prospective customers.",
    capabilities: ["business discovery", "communications"],
  },
  {
    seq: 2,
    name: "VisibilityAI",
    purpose:
      "Assess a prospect's digital visibility and reputation as the opening wedge.",
    capabilities: ["digital visibility", "reputation", "business discovery"],
  },
  {
    seq: 3,
    name: "Intelligence CRM",
    purpose: "Track prospects, accounts and the relationship over time.",
    capabilities: ["crm", "business discovery", "communications"],
  },
  {
    seq: 4,
    name: "HL-BTI",
    purpose: "Turn an assessment into an executive transformation blueprint.",
    capabilities: [
      "transformation intelligence",
      "blueprint generation",
      "deterministic scoring",
      "executive dashboards",
    ],
  },
  {
    seq: 5,
    name: "Proposal Generation",
    purpose: "Produce the proposal, agreement and pricing from the blueprint.",
    capabilities: ["commerce provisioning", "documents"],
  },
  {
    seq: 6,
    name: "Project Management",
    purpose: "Run the delivery engagement as staged, approved work.",
    capabilities: ["workflow", "human approval"],
  },
  {
    seq: 7,
    name: "Customer Onboarding",
    purpose: "Provision the customer tenant, identity, roles and entitlements.",
    capabilities: ["identity", "entitlements", "workflow"],
  },
  {
    seq: 8,
    name: "Billing",
    purpose: "Collect recurring revenue.",
    capabilities: ["billing", "payments"],
  },
  {
    seq: 9,
    name: "Customer Success",
    purpose: "Drive adoption, health and renewal after go-live.",
    capabilities: ["crm", "communications", "analytics", "customer success desk"],
  },
  {
    seq: 10,
    name: "Support",
    purpose: "Handle inbound issues and requests.",
    capabilities: ["communications", "workflow", "support ticketing"],
  },
  {
    seq: 11,
    name: "Knowledge Capture",
    purpose: "Capture what was learned so the next engagement reuses it.",
    capabilities: ["documents", "storage", "enterprise catalog"],
  },
  {
    seq: 12,
    name: "Reporting",
    purpose: "Report operational and engagement metrics.",
    capabilities: ["executive dashboards", "analytics"],
  },
  {
    seq: 13,
    name: "Executive Dashboard",
    purpose: "The operating picture across all engagements and the software estate.",
    capabilities: ["executive dashboards", "enterprise catalog"],
  },
  {
    seq: 14,
    name: "CEO Dashboard",
    purpose: "The single screen the CEO runs the company from.",
    capabilities: ["enterprise catalog", "application registry"],
  },
];

export type StageReadiness = "operational" | "assemblable" | "partial" | "gap";

export interface OperatingStageResult {
  seq: number;
  name: string;
  purpose: string;
  readiness: StageReadiness;
  blueprint: FactoryAssemblyBlueprint;
  /** Capabilities with no built implementation anywhere — the stage's real gaps. */
  gaps: string[];
}

export interface OperatingModelResult {
  targetPlatform: SourcePlatformId;
  stages: OperatingStageResult[];
  operationalCount: number;
  assemblableCount: number;
  partialCount: number;
  gapCount: number;
  /** Distinct net-new capabilities across all stages — the internal-OS build queue. */
  netNewCapabilities: string[];
  /** Share of stages that need no net-new work (0–100). */
  assemblablePct: number;
}

function readinessFor(bp: FactoryAssemblyBlueprint): StageReadiness {
  if (bp.netNewCount > 0)
    return bp.reuseCount + bp.crossPlatformCount > 0 ? "partial" : "gap";
  if (bp.extendCount > 0) return "assemblable";
  // Every slot reused and nothing partial/net-new. If all on the target platform
  // and production-grade, treat as operational; otherwise assemblable.
  const allReuse = bp.slots.every((s) => s.disposition === "reuse");
  return allReuse ? "operational" : "assemblable";
}

/** Assemble Herman Legacy's internal operating system from existing capabilities. */
export function hermanLegacyOperatingModel(
  targetPlatform: SourcePlatformId = "hlbos_core",
): OperatingModelResult {
  const stages: OperatingStageResult[] = HERMAN_LEGACY_OPERATING_MODEL.map((s) => {
    const bp = assembleBlueprint({
      productKey: `hlops_${s.seq}`,
      name: s.name,
      market: "consulting",
      targetPlatform,
      requiredCapabilities: s.capabilities,
    });
    return {
      seq: s.seq,
      name: s.name,
      purpose: s.purpose,
      readiness: readinessFor(bp),
      blueprint: bp,
      gaps: bp.netNewCapabilities,
    };
  });

  const operationalCount = stages.filter((s) => s.readiness === "operational").length;
  const assemblableCount = stages.filter((s) => s.readiness === "assemblable").length;
  const partialCount = stages.filter((s) => s.readiness === "partial").length;
  const gapCount = stages.filter((s) => s.readiness === "gap").length;
  const netNewCapabilities = [...new Set(stages.flatMap((s) => s.gaps))].sort();
  const noNetNew = stages.filter((s) => s.blueprint.netNewCount === 0).length;

  return {
    targetPlatform,
    stages,
    operationalCount,
    assemblableCount,
    partialCount,
    gapCount,
    netNewCapabilities,
    assemblablePct: Math.round((noNetNew / stages.length) * 100),
  };
}
