/**
 * Read-only data layer for the Executive Portal.
 *
 * Pure functions over @hl-bos/catalog. NO filesystem scan, NO shell, NO git,
 * NO database writes. Runs safely in a deployed, stateless app. Everything here
 * is derived from the version-controlled catalog/registry (verified in CI).
 */

import {
  buildCatalog,
  groupByKind,
  assetsByKind,
  neighborhood,
  KIND_LABEL,
  MODULE_REGISTRY,
  PRODUCT_COMPOSITIONS,
  assembleAll,
  assembleProduct,
  compositionByKey,
  executiveReadiness,
  FACTORY_CHECKLIST,
  MATURITY_LABEL,
  search,
  APPLICATIONS,
  applicationByKey,
  applicationsByCategory,
  CAPABILITIES,
  capabilityById,
  capabilityInventory,
  productsForCapability,
  applicationsForCapability,
  reconcileCapabilities,
  duplicateCheck,
  evaluateReuse,
  buildKnowledgeGraph,
  validateGraph,
  blastRadius,
  capabilitiesForApplication,
  singlePointsOfDependency,
  highestReuseCoveragePlannedProduct,
  outgoing,
  incoming,
  type Asset,
  type AssetKind,
  type ApplicationRecord,
  type AppCategory,
  type Capability,
  type ProposedCapability,
  type ReuseDecision,
  type GraphNode,
  type GraphEdge,
  type KnowledgeGraph,
} from "@hl-bos/catalog";

export {
  buildCatalog,
  groupByKind,
  assetsByKind,
  neighborhood,
  KIND_LABEL,
  MODULE_REGISTRY,
  PRODUCT_COMPOSITIONS,
  assembleAll,
  assembleProduct,
  compositionByKey,
  executiveReadiness,
  FACTORY_CHECKLIST,
  MATURITY_LABEL,
  search,
  APPLICATIONS,
  applicationByKey,
  applicationsByCategory,
  CAPABILITIES,
  capabilityById,
  capabilityInventory,
  productsForCapability,
  applicationsForCapability,
  reconcileCapabilities,
  duplicateCheck,
  evaluateReuse,
  buildKnowledgeGraph,
  validateGraph,
  blastRadius,
  capabilitiesForApplication,
  singlePointsOfDependency,
  highestReuseCoveragePlannedProduct,
  outgoing,
  incoming,
};
export type {
  Asset,
  AssetKind,
  ApplicationRecord,
  AppCategory,
  Capability,
  ProposedCapability,
  ReuseDecision,
  GraphNode,
  GraphEdge,
  KnowledgeGraph,
};

/** Platform health, derived from the registry's database assets (no live query). */
export function platformHealth() {
  const catalog = buildCatalog();
  const dbs = assetsByKind(catalog, "database");
  const tables = dbs.reduce((sum, d) => sum + (Number(d.metrics?.["tables"]) || 0), 0);
  return {
    schemas: dbs.length,
    tables,
    rlsCoverage: "100%",
    errorAdvisories: 0,
    source:
      "Project Atlas assessment (verified in CI); live figures require a connected read-only session",
    databases: dbs.map((d) => ({
      name: d.name,
      tables: Number(d.metrics?.["tables"]) || 0,
    })),
  };
}

/** The outstanding CEO decisions (documented across the Atlas reports). */
export function ceoDecisions() {
  return [
    { title: "Merge Project Atlas (PR #16)", status: "DONE", note: "Merged into main" },
    {
      title: "Set pricing, licensing & module ownership",
      status: "PENDING CEO DECISION",
      note: "Blocks all commercial readiness",
    },
    {
      title: "Grant Anthropic + Stripe keys; authorize runtime deployment",
      status: "PENDING CEO DECISION",
      note: "Unlocks live AI + payments",
    },
    {
      title: "Approve module-registry seed migration (0029)",
      status: "PENDING CEO DECISION",
      note: "Persists hlvs.modules",
    },
    {
      title: "Approve catalog persistence migration (0028)",
      status: "PENDING CEO DECISION",
      note: "Optional durable catalog",
    },
    {
      title: "Authorize executive-portal build + deployment",
      status: "IN PROGRESS",
      note: "This application",
    },
    {
      title: "Development-agent wiring (governed vs automated)",
      status: "PENDING CEO DECISION",
      note: "Factory autonomy",
    },
    {
      title: "Venuewise convergence vs. coexistence",
      status: "PENDING CEO DECISION",
      note: "Strategic overlap",
    },
    {
      title: "Fund the media-AI frontier (HighlightAI/BroadcastAI)",
      status: "PENDING CEO DECISION",
      note: "Greenfield",
    },
  ];
}

/** Deployment status per module (built vs deployed) + the platform-wide fact. */
export function deploymentStatus() {
  const live = MODULE_REGISTRY.filter((m) => m.maturity === "live").length;
  const builtUndeployed = MODULE_REGISTRY.filter(
    (m) => m.maturity === "built_undeployed",
  ).length;
  return {
    edgeFunctionsDeployed: 0,
    runtimeSwitchedOn: false,
    live,
    builtUndeployed,
    note: "The platform spine is built and tested; the edge runtime is not yet deployed (a CEO/ops gate). Nothing is deployed to production.",
    modules: MODULE_REGISTRY.map((m) => ({
      name: m.name,
      maturity: m.maturity,
      label: MATURITY_LABEL[m.maturity],
    })),
  };
}

/** Product portfolio with foundation readiness (from the assembler). */
export function productPortfolio() {
  return assembleAll().map((a) => {
    const c = compositionByKey(a.productKey)!;
    return {
      key: a.productKey,
      name: a.name,
      edition: c.edition,
      availability: c.commercial.commercialAvailability,
      subscriptionModel: c.commercial.subscriptionModel,
      foundationPct: a.foundationReadinessPct,
      assemblable: a.assemblable,
      requiredCount: a.requiredCount,
      builtCount: a.builtCount,
    };
  });
}
