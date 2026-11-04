/**
 * The HLG Transportation Management System module catalog.
 *
 * Two kinds of thing live here, and keeping them apart is the point:
 *
 *   - CAPABILITIES are internal platform plumbing (tenant identity, the shared
 *     vehicle registry, the driver registry, audit). They are never sold. Every
 *     module that needs one gets it, so a customer who buys only Digital DVIR
 *     still has vehicle records — without buying the Fleet Management screens.
 *
 *   - MODULES are what a customer licenses. A module may need capabilities
 *     (always granted with it) and may need OTHER modules only where it cannot
 *     function without them (`requiresAnyOf`). Those commercial dependencies are
 *     kept deliberately few: a module that merely works *better* with another
 *     says so in `enhancedBy`, and does not force the purchase.
 *
 * `status` is evidence, not aspiration. It records what exists today for each
 * module and where, and the console and the report read it. Change it only
 * when code lands.
 */

export type CapabilityKey =
  | "tenant_identity"
  | "module_entitlements"
  | "vehicle_registry"
  | "driver_registry"
  | "unit_assignments"
  | "signed_records"
  | "documents"
  | "cost_ledger"
  | "audit"
  | "notifications"
  | "billing";

export type ModuleKey =
  | "fleet_management"
  | "driver_management"
  | "dvir"
  | "dispatch"
  | "routes"
  | "driver_app"
  | "kpi_scorecards"
  | "profitability"
  | "maintenance"
  | "executive_dashboard"
  | "customer_portal"
  | "automation";

/**
 * Where a capability or module actually stands. Vocabulary from the Phase 5
 * brief; each value must be backed by the `evidence` string next to it.
 */
export type Status =
  | "PRODUCTION_VERIFIED"
  | "TESTED"
  | "WORKING_PROTOTYPE"
  | "PARTIAL"
  | "SCHEMA_ONLY"
  | "MISSING"
  | "NOT_VERIFIED";

export interface Capability {
  key: CapabilityKey;
  name: string;
  /** Where it lives. */
  source: string;
  backend: Status;
  evidence: string;
}

export interface TmsModule {
  key: ModuleKey;
  number: number;
  name: string;
  release: 1 | 2 | 3;
  summary: string;
  /** Internal plumbing granted automatically with the module. Never billed. */
  capabilities: CapabilityKey[];
  /**
   * Commercial dependency: at least one of these modules must be licensed for
   * this one to function. Empty = sellable on its own.
   */
  requiresAnyOf: ModuleKey[];
  /** Works better alongside these, but does not require them. */
  enhancedBy: ModuleKey[];
  backend: Status;
  ui: Status;
  evidence: string;
}

export const CAPABILITIES: readonly Capability[] = [
  {
    key: "tenant_identity",
    name: "Company, users and sign-in",
    source: "HL-BOS platform.tenants + identity (migrations 0002-0008); fleet.members",
    backend: "PRODUCTION_VERIFIED",
    evidence:
      "Live on HL-BOS Core. fleet.member_role() joins platform.tenants and checks platform.tenant_is_operable, so a fleet company IS an HL-BOS tenant.",
  },
  {
    key: "module_entitlements",
    name: "Module licensing",
    source: "HL-BOS entitlements schema (migration 0010); packages/tms entitlements.ts",
    backend: "PARTIAL",
    evidence:
      "entitlements.module_activations exists in production, but no TMS module is registered and fleet.api does not check it. Enforced in the TMS app layer only (this branch).",
  },
  {
    key: "vehicle_registry",
    name: "Shared vehicle registry",
    source: "fleet.units via fleet.api save_fleet / snapshot",
    backend: "SCHEMA_ONLY",
    evidence:
      "Deployed to production 2026-10-17 outside source control; 0 units in production. Behaviour tested locally against the recovered SQL.",
  },
  {
    key: "driver_registry",
    name: "Shared driver registry",
    source: "fleet.members (role=driver) + fleet.driver_profiles",
    backend: "SCHEMA_ONLY",
    evidence:
      "Deployed; 0 driver profiles in production. Driver profiles are free-form JSON saved through save_fleet.",
  },
  {
    key: "unit_assignments",
    name: "Driver-to-vehicle assignment",
    source: "fleet.assignments via fleet.api save_member",
    backend: "SCHEMA_ONLY",
    evidence:
      "Deployed. fleet.can_unit() limits drivers to assigned units; tested locally against the recovered SQL.",
  },
  {
    key: "signed_records",
    name: "Signed, append-only records",
    source: "fleet.immutable_record trigger on inspections / actions / service records",
    backend: "SCHEMA_ONLY",
    evidence:
      "Deployed. Signatures are a typed name plus a consent flag, not a drawn signature.",
  },
  {
    key: "documents",
    name: "Private document and photo storage",
    source:
      "storage bucket hlg-fleet-documents (10 MB, private) + fleet.storage_access",
    backend: "SCHEMA_ONLY",
    evidence: "Bucket and policies deployed; never used in production.",
  },
  {
    key: "cost_ledger",
    name: "Cost records (service, fuel)",
    source: "fleet.service_records, fleet.fuel_entries, fleet.work_orders",
    backend: "SCHEMA_ONLY",
    evidence: "Deployed; 0 rows in production.",
  },
  {
    key: "audit",
    name: "Audit trail",
    source: "fleet.audit_events + HL-BOS audit (migration 0004)",
    backend: "SCHEMA_ONLY",
    evidence:
      "fleet.audit_events records owner claim, fleet saves and membership changes; inspections are themselves the record.",
  },
  {
    key: "notifications",
    name: "Notifications",
    source: "HL-BOS communications (migration 0019)",
    backend: "PARTIAL",
    evidence:
      "The HL-BOS communications schema exists; nothing in fleet emits a notification. No SMS is sent.",
  },
  {
    key: "billing",
    name: "Subscription billing",
    source: "HL-BOS billing (migrations 0015-0016)",
    backend: "PARTIAL",
    evidence:
      "Billing tables exist; no TMS plan or price is defined; no Stripe product.",
  },
];

export const MODULES: readonly TmsModule[] = [
  {
    key: "fleet_management",
    number: 1,
    name: "Fleet Management",
    release: 1,
    summary:
      "Vehicle and equipment profiles, availability, assignments, maintenance status and operating history; the fleet status board.",
    capabilities: ["tenant_identity", "vehicle_registry", "unit_assignments", "audit"],
    requiresAnyOf: [],
    enhancedBy: ["dvir", "maintenance"],
    backend: "SCHEMA_ONLY",
    ui: "WORKING_PROTOTYPE",
    evidence:
      "Backend: fleet.api save_fleet/snapshot (production, unused). UI: apps/tms /fleet and /dashboard (this branch, local).",
  },
  {
    key: "driver_management",
    number: 2,
    name: "Driver Management",
    release: 1,
    summary:
      "Driver profiles, assignments, credentials with expiry tracking, activity and role-based access.",
    capabilities: [
      "tenant_identity",
      "driver_registry",
      "unit_assignments",
      "documents",
      "audit",
    ],
    requiresAnyOf: [],
    enhancedBy: ["dvir", "kpi_scorecards"],
    backend: "PARTIAL",
    ui: "WORKING_PROTOTYPE",
    evidence:
      "Backend: fleet.driver_profiles + fleet.medical_api (medical card upload) in production, unused. No CDL / endorsement / expiry model. UI: apps/tms /drivers.",
  },
  {
    key: "dvir",
    number: 3,
    name: "Digital DVIR",
    release: 1,
    summary:
      "Pre-trip, en-route and end-of-day inspections, defect reporting with severity, photos, signatures, repair certification, out-of-service holds and driver review of repairs.",
    capabilities: [
      "tenant_identity",
      "vehicle_registry",
      "driver_registry",
      "unit_assignments",
      "signed_records",
      "documents",
      "audit",
    ],
    requiresAnyOf: [],
    enhancedBy: ["maintenance", "fleet_management"],
    backend: "SCHEMA_ONLY",
    ui: "WORKING_PROTOTYPE",
    evidence:
      "Backend: fleet.api submit_inspection/submit_action — the most complete part of the production fleet backend, unused (0 inspections). UI: apps/tms /driver, /defects, /inspections.",
  },
  {
    key: "dispatch",
    number: 4,
    name: "Dispatch Management",
    release: 2,
    summary:
      "Daily assignments, availability, load assignment, dispatch status, exceptions, completion and the dispatcher console.",
    capabilities: [
      "tenant_identity",
      "vehicle_registry",
      "driver_registry",
      "unit_assignments",
      "notifications",
      "audit",
    ],
    requiresAnyOf: [],
    enhancedBy: ["routes", "driver_app"],
    backend: "MISSING",
    ui: "MISSING",
    evidence:
      "No dispatch tables or functions. HSCS-GLP defines an outbound FleetHuddle handoff contract (src/integrations/fleethuddle/contract.ts) with a MOCK transport only.",
  },
  {
    key: "routes",
    number: 5,
    name: "Route Management",
    release: 2,
    summary:
      "Routes and stops, route assignment, estimated versus actual, mileage and service exceptions.",
    capabilities: ["tenant_identity", "vehicle_registry", "driver_registry", "audit"],
    requiresAnyOf: [],
    enhancedBy: ["dispatch"],
    backend: "MISSING",
    ui: "MISSING",
    evidence:
      "No route schema. The HSCS-GLP handoff contract defines a route/stop payload shape that can be reused.",
  },
  {
    key: "driver_app",
    number: 6,
    name: "Driver Application",
    release: 2,
    summary:
      "The driver's phone experience across modules: assignments, status, notifications. DVIR entry is included with Digital DVIR itself.",
    capabilities: ["tenant_identity", "driver_registry", "notifications"],
    requiresAnyOf: ["dvir", "dispatch", "routes"],
    enhancedBy: [],
    backend: "PARTIAL",
    ui: "PARTIAL",
    evidence:
      "The mobile DVIR screen (apps/tms /driver) is built. Assignments, status updates and notifications are not.",
  },
  {
    key: "kpi_scorecards",
    number: 7,
    name: "Driver KPI Scorecards",
    release: 2,
    summary:
      "Configurable KPIs per operation: on-time, completion, safety, inspection completion, coaching, trends.",
    capabilities: ["tenant_identity", "driver_registry", "audit"],
    requiresAnyOf: [],
    enhancedBy: ["dvir", "dispatch", "routes"],
    backend: "SCHEMA_ONLY",
    ui: "MISSING",
    evidence:
      "Production scorecard schema (companies, versioned definitions with JSON config, runs) deployed 2026-10-17, 0 definitions. Lowe's KPI and DPI dashboards in herman-supply-chain are client-side HTML that read uploaded spreadsheets; nothing persists.",
  },
  {
    key: "profitability",
    number: 8,
    name: "Truck Profitability",
    release: 3,
    summary:
      "Revenue and cost by truck and route, contribution margin, cost per mile, trends.",
    capabilities: ["tenant_identity", "vehicle_registry", "cost_ledger"],
    requiresAnyOf: [],
    enhancedBy: ["maintenance", "routes", "dispatch"],
    backend: "PARTIAL",
    ui: "MISSING",
    evidence:
      "Cost inputs exist (service_records.cost_cents, fuel_entries, work orders). No revenue model, no labour cost, no mileage capture beyond DVIR odometer.",
  },
  {
    key: "maintenance",
    number: 9,
    name: "Maintenance Management",
    release: 1,
    summary:
      "Defect queue, work orders, service records with cost, preventive maintenance due dates, repair documents.",
    capabilities: [
      "tenant_identity",
      "vehicle_registry",
      "cost_ledger",
      "documents",
      "signed_records",
      "audit",
    ],
    requiresAnyOf: [],
    enhancedBy: ["dvir", "fleet_management"],
    backend: "SCHEMA_ONLY",
    ui: "WORKING_PROTOTYPE",
    evidence:
      "Backend: work_orders, service_records (submit_service), documents, record_events in production, unused. UI: apps/tms /maintenance.",
  },
  {
    key: "executive_dashboard",
    number: 10,
    name: "Executive Operations Dashboard",
    release: 3,
    summary:
      "Cross-module view of availability, drivers, dispatch, service, safety, maintenance and profitability.",
    capabilities: ["tenant_identity"],
    requiresAnyOf: [
      "fleet_management",
      "dvir",
      "maintenance",
      "dispatch",
      "routes",
      "kpi_scorecards",
      "profitability",
    ],
    enhancedBy: [],
    backend: "MISSING",
    ui: "MISSING",
    evidence:
      "Only the Release 1 fleet status board exists (part of Fleet Management).",
  },
  {
    key: "customer_portal",
    number: 11,
    name: "Customer Portal",
    release: 3,
    summary:
      "Customer-specific visibility of deliveries or service, documents and reports.",
    capabilities: ["tenant_identity", "documents"],
    requiresAnyOf: ["dispatch", "routes"],
    enhancedBy: [],
    backend: "MISSING",
    ui: "MISSING",
    evidence:
      "Nothing exists. Needs a customer-party identity model the fleet schema does not have.",
  },
  {
    key: "automation",
    number: 12,
    name: "Notifications and Automation",
    release: 2,
    summary:
      "Driver alerts, dispatch updates, maintenance and inspection escalations, expiry reminders.",
    capabilities: ["tenant_identity", "notifications"],
    requiresAnyOf: [
      "fleet_management",
      "driver_management",
      "dvir",
      "maintenance",
      "dispatch",
      "routes",
    ],
    enhancedBy: [],
    backend: "MISSING",
    ui: "MISSING",
    evidence:
      "HL-BOS communications exists; no fleet event emits a message. No SMS is sent anywhere.",
  },
];

export function moduleByKey(key: ModuleKey): TmsModule {
  const m = MODULES.find((x) => x.key === key);
  if (!m) throw new Error(`Unknown module ${key}`);
  return m;
}

export function isModuleKey(v: string): v is ModuleKey {
  return MODULES.some((m) => m.key === v);
}

/** A module is buildable/usable in this branch only if its UI exists in some form. */
export function isAvailableInThisBuild(key: ModuleKey): boolean {
  const ui = moduleByKey(key).ui;
  return ui === "WORKING_PROTOTYPE" || ui === "PARTIAL" || ui === "TESTED";
}
