/**
 * THE INTELLIGENCE CRM (Execution Phase 3, CP3).
 *
 * The operational center for Herman Legacy — assembled, NOT rebuilt. There is no
 * new CRM database and no new customer-management system. The Intelligence CRM is
 * a logical model whose every entity is backed by a capability that ALREADY
 * EXISTS (identity, discovery, commerce/provisioning, billing, workflows,
 * communications, the portfolio engine). It is the integrating VIEW that threads
 * a customer through the one lifecycle and links VisibilityAI, HL-BTI and the
 * Factory together.
 *
 * HONESTY (Principle 10): an entity with no existing backing capability is marked
 * `net_new` (only Customer Health — the customer-success desk gap named in
 * Execution Phase 2). Nothing is invented; there is no fabricated CRM data here,
 * only the model and its backing map.
 */

import type { Stage } from "@hl-bos/bti-engine";

export type EntityBackingVerdict = "reuse" | "assemble" | "net_new";

export interface CrmEntity {
  name: string;
  purpose: string;
  /** The existing system/capability that backs this entity (no new store). */
  backing: string;
  /** Enterprise-Catalog asset id(s) the entity is backed by. */
  backingAssets: string[];
  verdict: EntityBackingVerdict;
}

/**
 * The 17 CRM entities the brief names, each mapped to its existing backing.
 * `reuse` = a built HL-BOS/Factory capability already stores this; `assemble` =
 * composed from existing capabilities (possibly cross-platform); `net_new` = no
 * backing exists yet.
 */
export const CRM_ENTITIES: CrmEntity[] = [
  {
    name: "Prospects",
    purpose: "Inbound and discovered leads.",
    backing: "Discovery + VisibilityAI (prospects)",
    backingAssets: ["svc.discovery", "prod.visibility-ai"],
    verdict: "reuse",
  },
  {
    name: "Organizations",
    purpose: "Customer and prospect organizations.",
    backing: "Identity & Tenancy",
    backingAssets: ["svc.identity", "svc.tenancy"],
    verdict: "reuse",
  },
  {
    name: "Contacts",
    purpose: "People at each organization.",
    backing: "Identity (profiles / memberships)",
    backingAssets: ["svc.identity"],
    verdict: "reuse",
  },
  {
    name: "Activities",
    purpose: "Timeline of every interaction.",
    backing: "Event Bus + Audit",
    backingAssets: ["svc.events", "svc.audit"],
    verdict: "reuse",
  },
  {
    name: "Communications",
    purpose: "Email / SMS with consent + suppression.",
    backing: "Communications",
    backingAssets: ["svc.comms"],
    verdict: "reuse",
  },
  {
    name: "Meetings",
    purpose: "Scheduled meetings and calendar.",
    backing: "Scheduling (Venuewise, cross-platform)",
    backingAssets: ["svc.comms"],
    verdict: "assemble",
  },
  {
    name: "Tasks",
    purpose: "Assignable work items with approvals.",
    backing: "Workflows",
    backingAssets: ["svc.workflows"],
    verdict: "reuse",
  },
  {
    name: "Opportunities",
    purpose: "The sales pipeline.",
    backing: "Commerce (sales) + Portfolio engine",
    backingAssets: ["svc.commerce-provisioning", "pkg.catalog"],
    verdict: "reuse",
  },
  {
    name: "Proposals",
    purpose: "Generated proposals with line items.",
    backing: "Commerce (sales.proposals)",
    backingAssets: ["svc.commerce-provisioning"],
    verdict: "reuse",
  },
  {
    name: "Projects",
    purpose: "Delivery projects / work orders.",
    backing: "Provisioning (work orders)",
    backingAssets: ["svc.commerce-provisioning"],
    verdict: "reuse",
  },
  {
    name: "Subscriptions",
    purpose: "Recurring revenue subscriptions.",
    backing: "Billing",
    backingAssets: ["svc.billing"],
    verdict: "reuse",
  },
  {
    name: "Customer Health",
    purpose: "Adoption / health / renewal-risk signal.",
    backing: "Customer-success desk (net-new — Phase 2 gap)",
    backingAssets: [],
    verdict: "net_new",
  },
  {
    name: "Renewals",
    purpose: "Renewal tracking.",
    backing: "Billing + Communications",
    backingAssets: ["svc.billing", "svc.comms"],
    verdict: "reuse",
  },
  {
    name: "Cross-selling",
    purpose: "Cross-sell opportunities from the portfolio.",
    backing: "Portfolio engine (evaluateIdea)",
    backingAssets: ["pkg.catalog"],
    verdict: "reuse",
  },
  {
    name: "Upselling",
    purpose: "Plan/edition upgrades.",
    backing: "Entitlements + Portfolio",
    backingAssets: ["svc.entitlements", "pkg.catalog"],
    verdict: "reuse",
  },
  {
    name: "Executive Notes",
    purpose: "Executive commentary per account.",
    backing: "Storage / Documents",
    backingAssets: ["svc.storage"],
    verdict: "reuse",
  },
  {
    name: "Factory Assembly History",
    purpose: "Which capabilities were assembled for each customer.",
    backing: "Software Factory + Portfolio",
    backingAssets: ["mod.hlvs-factory", "pkg.catalog"],
    verdict: "reuse",
  },
];

/** A customer as it threads through the one lifecycle (the CRM's spine record). */
export interface CustomerRecord {
  organizationId: string;
  name: string;
  /** Current engagement stage (the reused bti-engine machine). */
  stage: Stage;
  /** Linked entity ids by CRM entity name (references, not copies). */
  links: Partial<Record<string, string[]>>;
  /** True for illustrative/sample records — never a claimed real customer. */
  sample: boolean;
}

export interface IntelligenceCrmModel {
  entities: CrmEntity[];
  total: number;
  reuseCount: number;
  assembleCount: number;
  netNewCount: number;
  netNewEntities: string[];
  /** Distinct existing catalog assets the CRM is assembled from. */
  reusedAssets: string[];
  summary: string;
}

/** The Intelligence CRM as an assembly over existing capabilities. */
export function intelligenceCrmModel(): IntelligenceCrmModel {
  const reuseCount = CRM_ENTITIES.filter((e) => e.verdict === "reuse").length;
  const assembleCount = CRM_ENTITIES.filter((e) => e.verdict === "assemble").length;
  const netNewCount = CRM_ENTITIES.filter((e) => e.verdict === "net_new").length;
  const reusedAssets = [
    ...new Set(CRM_ENTITIES.flatMap((e) => e.backingAssets)),
  ].sort();
  return {
    entities: CRM_ENTITIES,
    total: CRM_ENTITIES.length,
    reuseCount,
    assembleCount,
    netNewCount,
    netNewEntities: CRM_ENTITIES.filter((e) => e.verdict === "net_new").map(
      (e) => e.name,
    ),
    reusedAssets,
    summary:
      `Intelligence CRM assembled from ${reusedAssets.length} existing systems: ` +
      `${reuseCount} entities reuse, ${assembleCount} assemble, ${netNewCount} net-new ` +
      `(Customer Health). No new CRM database.`,
  };
}
