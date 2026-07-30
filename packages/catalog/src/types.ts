/**
 * Enterprise Catalog — type vocabulary.
 *
 * These are the nouns and verbs of the Herman Legacy software estate. The set
 * is deliberately closed: the catalog is only useful as a single source of
 * truth if every asset speaks the same language. New kinds/relations are added
 * here on purpose, not invented ad hoc at a call site.
 */

/** The kinds of asset the Enterprise Catalog tracks. */
export type AssetKind =
  | "product"
  | "application"
  | "module"
  | "package"
  | "shared_service"
  | "ai_capability"
  | "api"
  | "repository"
  | "database"
  | "workflow"
  | "edge_function"
  | "industry_solution"
  | "business_capability";

/**
 * How one asset relates to another (the "Dependencies" view). Each has a
 * natural inverse so the graph reads correctly from both ends.
 */
export type RelationKind =
  | "uses"
  | "depends_on"
  | "provides"
  | "consumes"
  | "extends"
  | "owned_by"
  | "referenced_by"
  | "replaced_by"
  | "successor"
  | "deprecated";

/** Reuse intelligence flags. An asset may carry several. */
export type ReuseFlag =
  | "reusable"
  | "internal_only"
  | "commercial"
  | "requires_refactor"
  | "requires_documentation"
  | "requires_testing"
  | "deprecated";

/**
 * Honest maturity. `dormant` = the object exists but has never been used;
 * `reference` = seeded catalog/reference data; `built_undeployed` = code +
 * tests done but not switched on. We never dress `dormant` as `live`.
 */
export type Maturity =
  | "live"
  | "built_undeployed"
  | "prototype"
  | "reference"
  | "dormant"
  | "legacy"
  | "planned";

/** Which plane of the platform an asset belongs to. */
export type Layer = "HLVS" | "HL-BOS" | "HL-BTI" | "Legacy" | "Tooling";

export type Health = "green" | "yellow" | "red" | "unknown";

export interface Relationship {
  kind: RelationKind;
  /** The `id` of the asset on the other end. Must exist in the catalog. */
  to: string;
  note?: string;
}

export interface Asset {
  /** Stable slug, unique across the catalog. Prefix by kind, e.g. `db.identity`. */
  id: string;
  kind: AssetKind;
  name: string;
  summary: string;
  maturity: Maturity;
  reuse: ReuseFlag[];
  /** The owning system or team, in plain words. */
  owner: string;
  layer: Layer;
  /**
   * The discoverable key that ties this asset to something physically in the
   * repository (a schema name, an edge-function directory, an app/package
   * directory). Presence of a key is what makes an asset auto-verifiable by
   * the scanner. Curated assets (business capabilities, industry solutions)
   * have no key and are not scored for completeness.
   */
  key?: string;
  /** Repo path or database schema where it lives, if anywhere. */
  location?: string;
  tags?: string[];
  /** Small, honest facts (e.g. `{ tables: 8 }`). Never invented metrics. */
  metrics?: Record<string, number | string>;
  relationships: Relationship[];
  /** Where this entry was verified. */
  evidence?: string;
}

export interface Catalog {
  assets: Asset[];
}

/** The natural-language inverse of each relation, for reading the graph backwards. */
export const INVERSE_RELATION: Record<RelationKind, string> = {
  uses: "used by",
  depends_on: "depended on by",
  provides: "provided by",
  consumes: "consumed by",
  extends: "extended by",
  owned_by: "owns",
  referenced_by: "references",
  replaced_by: "replaces",
  successor: "predecessor of",
  deprecated: "deprecates",
};

/** Human labels for asset kinds (singular / plural), for the executive UI. */
export const KIND_LABEL: Record<AssetKind, { one: string; many: string }> = {
  product: { one: "Product", many: "Products" },
  application: { one: "Application", many: "Applications" },
  module: { one: "Module", many: "Modules" },
  package: { one: "Shared Package", many: "Shared Packages" },
  shared_service: { one: "Shared Service", many: "Shared Services" },
  ai_capability: { one: "AI Capability", many: "AI Capabilities" },
  api: { one: "API", many: "APIs" },
  repository: { one: "Repository", many: "Repositories" },
  database: { one: "Database", many: "Databases" },
  workflow: { one: "Workflow", many: "Workflows" },
  edge_function: { one: "Edge Function", many: "Edge Functions" },
  industry_solution: { one: "Industry Solution", many: "Industry Solutions" },
  business_capability: { one: "Business Capability", many: "Business Capabilities" },
};

export const REUSE_LABEL: Record<ReuseFlag, string> = {
  reusable: "Reusable",
  internal_only: "Internal only",
  commercial: "Commercial",
  requires_refactor: "Requires refactor",
  requires_documentation: "Requires documentation",
  requires_testing: "Requires testing",
  deprecated: "Deprecated",
};

export const MATURITY_LABEL: Record<Maturity, string> = {
  live: "Live",
  built_undeployed: "Built — not deployed",
  prototype: "Prototype",
  reference: "Reference data",
  dormant: "Dormant",
  legacy: "Legacy",
  planned: "Planned",
};

/** Maturity → a health colour for the executive dashboard. Honest, not flattering. */
export const MATURITY_HEALTH: Record<Maturity, Health> = {
  live: "green",
  built_undeployed: "yellow",
  prototype: "yellow",
  reference: "green",
  dormant: "red",
  legacy: "yellow",
  planned: "unknown",
};
