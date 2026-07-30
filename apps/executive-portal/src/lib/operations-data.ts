/**
 * Operational data layer for the executive operating dashboard.
 *
 * Pure, read-only aggregation over @hl-bos/catalog (Enterprise Catalog + the
 * Application Registry), @hl-bos/transformation-intelligence (sample-labelled),
 * and the CEO decision list. NO shell, git, filesystem or DB writes.
 *
 * HONESTY: every panel states its provenance. "live" = computed from the
 * version-controlled catalog/registry; "sample" = the deterministic engine over
 * a clearly-labelled sample input (never a real customer); "not_connected" = a
 * source that requires the CEO to connect an integration (GitHub PRs, live
 * hosting health). We never fabricate a live feed we do not have.
 */

import {
  executiveReadiness,
  APPLICATIONS,
  type ApplicationRecord,
} from "@/lib/portal-data";
import { ceoDecisions } from "@/lib/portal-data";
import { sampleIntelligence, sampleGovAssessments } from "@/lib/intelligence-data";

export type Provenance = "live" | "sample" | "not_connected";
export type Severity = "high" | "medium" | "low" | "info";

export interface TaskItem {
  id: string;
  source: string;
  title: string;
  detail: string;
  severity: Severity;
  status: string;
}

export interface TaskSection {
  key: string;
  title: string;
  provenance: Provenance;
  items: TaskItem[];
  /** Shown when provenance is not_connected, explaining what would light it up. */
  note?: string;
}

/** Pending CEO decisions (from the documented decision list). */
export function pendingApprovals(): { title: string; note: string }[] {
  return ceoDecisions()
    .filter((d) => d.status.startsWith("PENDING") || d.status === "IN PROGRESS")
    .map((d) => ({ title: d.title, note: d.note }));
}

/** Application-health rollup from the registry (no live probing). */
export function applicationHealth() {
  const total = APPLICATIONS.length;
  const by = (p: (a: ApplicationRecord) => boolean) => APPLICATIONS.filter(p).length;
  return {
    total,
    deployed: by((a) => a.deploymentStatus === "deployed"),
    externalHosted: by((a) => a.deploymentStatus === "external_hosted"),
    notDeployed: by((a) => a.deploymentStatus === "not_deployed"),
    unknown: by((a) => a.deploymentStatus === "unknown"),
    unknownHealth: by((a) => a.health === "unknown"),
    green: by((a) => a.health === "green"),
    byCategory: {
      platform: by((a) => a.category === "platform"),
      executive_tooling: by((a) => a.category === "executive_tooling"),
      vertical_product: by((a) => a.category === "vertical_product"),
      web_property: by((a) => a.category === "web_property"),
      government: by((a) => a.category === "government"),
      legacy: by((a) => a.category === "legacy"),
    },
  };
}

/** Deterministic enterprise alerts, computed from real state. */
export function enterpriseAlerts(): TaskItem[] {
  const r = executiveReadiness();
  const h = applicationHealth();
  return [
    {
      id: "alert.no-prod-deploy",
      source: "Deployment",
      title: "Zero production deployments from the monorepo",
      detail:
        "The protected Deploy workflow has never run. Nothing in HL-BOS is in production yet.",
      severity: "info",
      status: "By design — awaiting CEO deploy authorization",
    },
    {
      id: "alert.commercial-gated",
      source: "Commercial",
      title: `Commercial readiness at ${r.commercialReadinessPct}%`,
      detail:
        "Pricing, licensing and ownership are pending CEO decisions; they gate all commercial readiness.",
      severity: "medium",
      status: "Pending CEO decision",
    },
    {
      id: "alert.runtime-off",
      source: "Platform",
      title: "Edge runtime not deployed",
      detail:
        "0 edge functions deployed; live AI and payments are off until the runtime is switched on.",
      severity: "medium",
      status: "CEO/ops gate",
    },
    {
      id: "alert.hlvs-legacy",
      source: "Asset Recovery",
      title: "Legacy HLVS Venture Studio unreachable",
      detail:
        "The original Venture Studio survives only as a legacy Supabase project not in the accessible org — out of scope, open security findings.",
      severity: "low",
      status: "Do not touch without an approved plan",
    },
    {
      id: "alert.unknown-health",
      source: "Governance",
      title: `${h.unknownHealth} application(s) with unverified health`,
      detail:
        "Health is not probed live; external/private apps need connected hosting to report health.",
      severity: "low",
      status: "Requires CEO to connect hosting",
    },
  ];
}

/** Software Factory recommendations (the remaining critical work). */
export function factoryRecommendations(): TaskItem[] {
  return executiveReadiness().remainingCriticalWork.map((w, i) => ({
    id: `factory.${i}`,
    source: "Software Factory",
    title: w,
    detail: "From the executive-readiness critical-work list.",
    severity: "medium",
    status: "Advisory — CEO decision",
  }));
}

/** The full Task Center, assembled from every source with honest provenance. */
export function taskSections(opts: { includeSensitive: boolean }): TaskSection[] {
  const sections: TaskSection[] = [];

  sections.push({
    key: "approvals",
    title: "CEO Approvals",
    provenance: "live",
    items: pendingApprovals().map((a, i) => ({
      id: `approval.${i}`,
      source: "CEO Decision",
      title: a.title,
      detail: a.note,
      severity: "high",
      status: "Awaiting CEO",
    })),
  });

  sections.push({
    key: "pull_requests",
    title: "Pull Requests",
    provenance: "not_connected",
    items: [],
    note: "Live PR review requires a connected GitHub session. None streamed to the deployed portal.",
  });

  sections.push({
    key: "deployments",
    title: "Deployment Requests",
    provenance: "live",
    items: [],
    note: "No deployment requests. The Deploy workflow is protected and has never run.",
  });

  if (opts.includeSensitive) {
    const gov = sampleGovAssessments();
    sections.push({
      key: "gov_bids",
      title: "Government Bid Reviews",
      provenance: "sample",
      items: gov.map((g) => ({
        id: `gov.${g.opportunity.id}`,
        source: "Government Intelligence",
        title: `${g.opportunity.title}`,
        detail: `Recommendation: ${g.ceoRecommendation.verdict.replace(/_/g, " ")} — ${g.ceoRecommendation.reason}`,
        severity: g.ceoRecommendation.verdict === "pursue" ? "high" : "medium",
        status: "Bid/no-bid — CEO decision",
      })),
      note: "Illustrative sample solicitations — not real RFPs.",
    });

    const intel = sampleIntelligence();
    sections.push({
      key: "transformation",
      title: "Transformation Reviews",
      provenance: "sample",
      items: intel.recommendations.slice(0, 5).map((r) => ({
        id: `xfrm.${r.id}`,
        source: "Transformation Intelligence",
        title: `${r.label}: ${r.solution}`,
        detail: `Priority ${r.priority}. ${r.approvals.map((a) => a.type).join(", ")}`,
        severity:
          r.priority === "critical" || r.priority === "high" ? "high" : "medium",
        status: "Review & approve",
      })),
      note: "Engine is real; input is a labelled sample business.",
    });
  }

  sections.push({
    key: "factory",
    title: "Software Factory Recommendations",
    provenance: "live",
    items: factoryRecommendations(),
  });

  sections.push({
    key: "alerts",
    title: "Platform Alerts",
    provenance: "live",
    items: enterpriseAlerts(),
  });

  return sections;
}

// ==========================================================================
// Platform Status (Task 5) — the named systems, honest status each.
// ==========================================================================

export interface PlatformSystem {
  name: string;
  status: "live" | "built_undeployed" | "prototype" | "planned" | "legacy" | "external";
  health: "green" | "yellow" | "red" | "unknown";
  deployment: string;
  version: string;
  dependencies: string[];
  note: string;
}

/** The systems the CEO asked to see on Platform Status — status recorded honestly. */
export const PLATFORM_SYSTEMS: PlatformSystem[] = [
  {
    name: "HL-BOS (platform)",
    status: "live",
    health: "green",
    deployment: "Supabase HL-BOS Core (database live)",
    version: "27 migrations",
    dependencies: ["Supabase Postgres 17"],
    note: "Spine live; edge runtime not deployed.",
  },
  {
    name: "Executive Portal",
    status: "built_undeployed",
    health: "unknown",
    deployment: "Not deployed (Deploy workflow: 0 runs)",
    version: "0.1.0",
    dependencies: ["@hl-bos/catalog", "@hl-bos/transformation-intelligence"],
    note: "Staging-ready; awaiting CEO Coolify authorization.",
  },
  {
    name: "HL-BTI",
    status: "live",
    health: "green",
    deployment: "Engine live in-repo; app built, not deployed",
    version: "0.1.0",
    dependencies: ["@hl-bos/bti-engine"],
    note: "bti schema + public RPCs live; app static export undeployed.",
  },
  {
    name: "HLVS (Software Factory)",
    status: "live",
    health: "green",
    deployment: "hlvs schema live (migration 0025); runtime worker undeployed",
    version: "19 tables",
    dependencies: ["HL-BOS Core"],
    note: "Live factory schema. The original Venture Studio (legacy) is unreachable.",
  },
  {
    name: "VisibilityAI",
    status: "prototype",
    health: "yellow",
    deployment: "Schema + workflow only; no customer UI",
    version: "8 tables",
    dependencies: ["discovery", "ai-gateway"],
    note: "Partial prototype (migrations 0014/0017).",
  },
  {
    name: "Software Factory (engine)",
    status: "live",
    health: "green",
    deployment: "Code live in @hl-bos/catalog; DB seed proposed",
    version: "0.1.0",
    dependencies: ["@hl-bos/catalog"],
    note: "Assembler + readiness + conformance deterministic engines.",
  },
  {
    name: "Enterprise Catalog",
    status: "live",
    health: "green",
    deployment: "@hl-bos/catalog package (in-repo)",
    version: "0.1.0",
    dependencies: [],
    note: "Single source of truth; 100% completeness.",
  },
  {
    name: "Government Intelligence",
    status: "live",
    health: "green",
    deployment: "@hl-bos/transformation-intelligence (government module)",
    version: "0.1.0",
    dependencies: ["@hl-bos/catalog"],
    note: "Engine live; HSCS-GLP app is a separate, private, unconnected system.",
  },
  {
    name: "Discovery Engine",
    status: "live",
    health: "green",
    deployment: "discovery schema (migrations 0020/0023)",
    version: "19 tables",
    dependencies: ["HL-BOS Core"],
    note: "Collectors → profile → scored assessment → blueprint.",
  },
  {
    name: "Website Factory",
    status: "planned",
    health: "unknown",
    deployment: "Not built",
    version: "—",
    dependencies: [],
    note: "Named target; no software exists yet. Web properties are static GitHub Pages sites.",
  },
  {
    name: "Marketing Agency",
    status: "planned",
    health: "unknown",
    deployment: "Not built",
    version: "—",
    dependencies: [],
    note: "Named target; no software exists yet (a 'Marketing Services' HL product concept only).",
  },
];
