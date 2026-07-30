/**
 * Software Factory — Engineering Module Registry.
 *
 * `hlvs.modules` in the live database is empty (0 rows). This is the
 * version-controlled source of truth that fills that gap: every reusable
 * engineering module Herman Legacy actually owns, verified against the live
 * schemas (Phase I/II) and mapped 1:1 to its commercial counterpart in
 * `discovery.module_catalog`.
 *
 * Maturity is honest: `live` = built + applied + tested; `built_undeployed` =
 * code + tests done, runtime not switched on; `partial` = foundation exists,
 * more to build. Nothing aspirational is `live`.
 *
 * This registry is what the Factory assembler (factory.ts) reasons over.
 */

import type { Maturity, ReuseFlag } from "./types";

export interface ModuleDef {
  /** Engineering module key (matches the intended hlvs.modules.key). */
  key: string;
  name: string;
  /** The schema this module owns (its authoritative home). */
  schema: string;
  capabilityCategory: string;
  maturity: Maturity;
  reuse: ReuseFlag[];
  /** Commercial catalog keys this module provides (discovery.module_catalog). */
  provides: string[];
  /** Other engineering modules this module depends on. */
  dependsOn: string[];
  /** The 1:1 commercial catalog key, if any. */
  discoveryModuleKey?: string;
  evidence: string;
}

/**
 * The 18 reusable engineering modules. These are the "already built" units the
 * Factory assembles products from — the reuse dividend, made concrete.
 */
export const MODULE_REGISTRY: ModuleDef[] = [
  {
    key: "identity_core",
    name: "Identity Core",
    schema: "identity",
    capabilityCategory: "identity",
    maturity: "live",
    reuse: ["reusable"],
    provides: ["identity"],
    dependsOn: [],
    discoveryModuleKey: "identity",
    evidence: "identity + platform schemas, 9 tables, live, 100% RLS",
  },
  {
    key: "tenancy",
    name: "Tenancy",
    schema: "platform",
    capabilityCategory: "identity",
    maturity: "live",
    reuse: ["reusable"],
    provides: [],
    dependsOn: [],
    evidence: "platform.tenants; first-party + customer; parent/child",
  },
  {
    key: "audit",
    name: "Audit",
    schema: "audit",
    capabilityCategory: "operations",
    maturity: "live",
    reuse: ["reusable"],
    provides: [],
    dependsOn: [],
    evidence: "audit schema, append-only, immutable",
  },
  {
    key: "events_bus",
    name: "Event Bus",
    schema: "events",
    capabilityCategory: "automation",
    maturity: "live",
    reuse: ["reusable"],
    provides: ["workflow_automation"],
    dependsOn: [],
    evidence: "events schema, transactional outbox; dispatcher built (undeployed)",
  },
  {
    key: "entitlements",
    name: "Entitlements",
    schema: "entitlements",
    capabilityCategory: "operations",
    maturity: "live",
    reuse: ["reusable"],
    provides: [],
    dependsOn: ["identity_core"],
    evidence: "entitlements schema; has_feature, module activation",
  },
  {
    key: "ai_gateway",
    name: "AI Gateway",
    schema: "ai",
    capabilityCategory: "ai_enablement",
    maturity: "built_undeployed",
    reuse: ["reusable"],
    provides: ["ai_receptionist"],
    dependsOn: ["events_bus"],
    discoveryModuleKey: "ai_receptionist",
    evidence: "ai schema live; ai-gateway edge built, keyless/undeployed",
  },
  {
    key: "workflows",
    name: "Workflows / Human Gate",
    schema: "workflows",
    capabilityCategory: "operations",
    maturity: "live",
    reuse: ["reusable"],
    provides: [],
    dependsOn: ["identity_core"],
    evidence: "workflows schema; approval gate",
  },
  {
    key: "billing_core",
    name: "Billing Core",
    schema: "billing",
    capabilityCategory: "operations",
    maturity: "built_undeployed",
    reuse: ["reusable", "requires_refactor"],
    provides: ["billing", "payments"],
    dependsOn: ["entitlements", "events_bus"],
    discoveryModuleKey: "billing",
    evidence: "billing schema live (DB); Stripe adapter stubbed",
  },
  {
    key: "storage",
    name: "Storage",
    schema: "storage_meta",
    capabilityCategory: "operations",
    maturity: "live",
    reuse: ["reusable"],
    provides: ["storage", "document_management"],
    dependsOn: [],
    discoveryModuleKey: "storage",
    evidence: "storage_meta schema; retention + signed-URL boundary",
  },
  {
    key: "communications",
    name: "Communications",
    schema: "comms",
    capabilityCategory: "communications",
    maturity: "built_undeployed",
    reuse: ["reusable"],
    provides: ["communications"],
    dependsOn: ["events_bus"],
    discoveryModuleKey: "communications",
    evidence: "comms schema live (DB); worker built, undeployed",
  },
  {
    key: "integrations",
    name: "Integrations",
    schema: "integrations",
    capabilityCategory: "operations",
    maturity: "live",
    reuse: ["reusable", "requires_documentation"],
    provides: [],
    dependsOn: [],
    evidence: "integrations framework live; no live connector code yet",
  },
  {
    key: "discovery_engine",
    name: "Discovery Engine",
    schema: "discovery",
    capabilityCategory: "business_discovery",
    maturity: "live",
    reuse: ["reusable", "commercial"],
    provides: ["business_discovery", "lead_capture"],
    dependsOn: ["ai_gateway", "events_bus"],
    discoveryModuleKey: "lead_capture",
    evidence: "discovery schema; collectors → profile → assessment",
  },
  {
    key: "website_scanner",
    name: "Website Scanner",
    schema: "discovery",
    capabilityCategory: "marketing",
    maturity: "built_undeployed",
    reuse: ["reusable"],
    provides: ["local_visibility", "seo"],
    dependsOn: ["discovery_engine", "ai_gateway"],
    discoveryModuleKey: "local_visibility",
    evidence: "SSRF-safe scan; worker built, undeployed",
  },
  {
    key: "blueprint_engine",
    name: "Blueprint Engine",
    schema: "discovery",
    capabilityCategory: "analytics",
    maturity: "live",
    reuse: ["reusable", "commercial"],
    provides: [],
    dependsOn: ["discovery_engine"],
    evidence: "discovery blueprint tables; deterministic + AI narrative",
  },
  {
    key: "commerce_provisioning",
    name: "Commerce & Provisioning",
    schema: "sales",
    capabilityCategory: "operations",
    maturity: "built_undeployed",
    reuse: ["reusable"],
    provides: [],
    dependsOn: ["billing_core", "discovery_engine"],
    evidence: "sales + provisioning schemas live (DB); commerce-worker undeployed",
  },
  {
    key: "visibility_assessments",
    name: "Visibility Assessments",
    schema: "visibility",
    capabilityCategory: "marketing",
    maturity: "built_undeployed",
    reuse: ["commercial", "reusable"],
    provides: ["reviews", "reputation_recovery"],
    dependsOn: ["discovery_engine"],
    discoveryModuleKey: "reviews",
    evidence: "visibility schema live (DB); no UI/scan worker",
  },
  {
    key: "bti_platform",
    name: "BTI Platform",
    schema: "bti",
    capabilityCategory: "analytics",
    maturity: "live",
    reuse: ["commercial", "reusable"],
    provides: ["dashboards"],
    dependsOn: ["discovery_engine", "scoring_engine"],
    discoveryModuleKey: "dashboards",
    evidence: "bti schema; executive scoring, ROI, CEO dashboard",
  },
  {
    key: "scoring_engine",
    name: "Deterministic Scoring Engine",
    schema: "(package)",
    capabilityCategory: "analytics",
    maturity: "live",
    reuse: ["reusable", "commercial"],
    provides: [],
    dependsOn: [],
    evidence: "@hl-bos/bti-engine; mirrored by DB + edge",
  },
  {
    key: "hlvs_factory",
    name: "HLVS Software Factory",
    schema: "hlvs",
    capabilityCategory: "operations",
    maturity: "live",
    reuse: ["reusable"],
    provides: [],
    dependsOn: [],
    evidence: "hlvs schema; blueprint→order→conformance→build package",
  },
];

export function moduleByKey(key: string): ModuleDef | undefined {
  return MODULE_REGISTRY.find((m) => m.key === key);
}

/** A module counts as "built" if its foundation is live or built-undeployed. */
export function moduleIsBuilt(m: ModuleDef): boolean {
  return m.maturity === "live" || m.maturity === "built_undeployed";
}
