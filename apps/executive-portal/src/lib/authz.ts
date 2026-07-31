/**
 * Authorization matrix — the security heart of the Executive Portal.
 *
 * PURE and deterministic: no I/O, no session, no environment. This is what the
 * automated authorization-boundary tests assert. Every route calls `canView`
 * server-side before rendering; an unauthenticated viewer has no role and sees
 * nothing.
 *
 * All views are READ-ONLY. No role can execute a command, deploy, or write.
 *
 * Phase IX: views carry a `group` so navigation is organised around executive
 * workflow (Command → Intelligence → Factory & Catalog → Governance → Platform)
 * rather than a flat developer list.
 */

export type PortalRole =
  "platform_owner" | "executive" | "administrator" | "developer" | "read_only_auditor";

export type PortalView =
  | "home"
  | "operations"
  | "marketing"
  | "references"
  | "tasks"
  | "search"
  | "applications"
  | "status"
  | "dashboard"
  | "catalog"
  | "factory"
  | "modules"
  | "capabilities"
  | "compositions"
  | "relationships"
  | "readiness"
  | "platform_health"
  | "graph"
  | "commercial"
  | "deployment"
  | "decisions"
  | "portfolio"
  | "intelligence"
  | "government";

export type NavGroup =
  "command" | "intelligence" | "factory" | "governance" | "platform";

export const ROLE_LABEL: Record<PortalRole, string> = {
  platform_owner: "Platform Owner",
  executive: "Executive",
  administrator: "Administrator",
  developer: "Developer",
  read_only_auditor: "Read-only Auditor",
};

/** Nav groups in executive display order. */
export const NAV_GROUPS: { group: NavGroup; label: string }[] = [
  { group: "command", label: "Command" },
  { group: "intelligence", label: "Intelligence" },
  { group: "factory", label: "Factory & Catalog" },
  { group: "governance", label: "Governance" },
  { group: "platform", label: "Platform" },
];

export interface ViewMeta {
  view: PortalView;
  path: string;
  label: string;
  description: string;
  group: NavGroup;
  /** True = commercially sensitive (owner/executive only). */
  sensitive: boolean;
}

export const VIEWS: ViewMeta[] = [
  // --- Command -----------------------------------------------------------
  {
    view: "home",
    path: "/",
    label: "CEO Home",
    description: "The executive operating dashboard",
    group: "command",
    sensitive: false,
  },
  {
    view: "operations",
    path: "/operations",
    label: "CEO Operations",
    description: "Customer Manufacturing System — one operating picture",
    group: "command",
    sensitive: true,
  },
  {
    view: "marketing",
    path: "/marketing",
    label: "Marketing & Growth",
    description: "Herman Legacy Marketing — campaigns, studio, growth",
    group: "command",
    sensitive: true,
  },
  {
    view: "references",
    path: "/references",
    label: "Reference Implementations",
    description:
      "Herman Legacy, Venuewise, HSCS — the Factory's reference transformations",
    group: "intelligence",
    sensitive: true,
  },
  {
    view: "tasks",
    path: "/tasks",
    label: "Task Center",
    description: "Everything awaiting a CEO decision",
    group: "command",
    sensitive: true,
  },
  {
    view: "search",
    path: "/search",
    label: "Global Search",
    description: "Find anything across the enterprise",
    group: "command",
    sensitive: false,
  },
  // --- Intelligence ------------------------------------------------------
  {
    view: "intelligence",
    path: "/intelligence",
    label: "Transformation Intelligence",
    description: "What happened, why, what to do, impact, approvals",
    group: "intelligence",
    sensitive: true,
  },
  {
    view: "government",
    path: "/government",
    label: "Government Contracts",
    description: "Opportunity → win probability → gaps → profit → decision",
    group: "intelligence",
    sensitive: true,
  },
  // --- Factory & Catalog -------------------------------------------------
  {
    view: "factory",
    path: "/factory",
    label: "Software Factory",
    description: "Assemble products from modules",
    group: "factory",
    sensitive: false,
  },
  {
    view: "catalog",
    path: "/catalog",
    label: "Enterprise Catalog",
    description: "Every software asset",
    group: "factory",
    sensitive: false,
  },
  {
    view: "modules",
    path: "/modules",
    label: "Module Registry",
    description: "Reusable engineering modules",
    group: "factory",
    sensitive: false,
  },
  {
    view: "capabilities",
    path: "/capabilities",
    label: "Capability Library",
    description: "Canonical reusable capabilities + duplicate gate",
    group: "factory",
    sensitive: false,
  },
  {
    view: "compositions",
    path: "/compositions",
    label: "Product Compositions",
    description: "How each product is assembled",
    group: "factory",
    sensitive: false,
  },
  {
    view: "readiness",
    path: "/readiness",
    label: "Product Readiness",
    description: "Completion and assembly status",
    group: "factory",
    sensitive: false,
  },
  {
    view: "portfolio",
    path: "/portfolio",
    label: "Product Portfolio",
    description: "Every product and its stage",
    group: "factory",
    sensitive: false,
  },
  // --- Governance --------------------------------------------------------
  {
    view: "applications",
    path: "/applications",
    label: "Application Registry",
    description: "Every Herman Legacy application, governed",
    group: "governance",
    sensitive: false,
  },
  {
    view: "commercial",
    path: "/commercial",
    label: "Commercial Readiness",
    description: "Pricing/licensing/ownership status",
    group: "governance",
    sensitive: true,
  },
  {
    view: "decisions",
    path: "/decisions",
    label: "CEO Decision Status",
    description: "Decisions awaiting the CEO",
    group: "governance",
    sensitive: true,
  },
  {
    view: "deployment",
    path: "/deployment",
    label: "Deployment Status",
    description: "What is built vs deployed",
    group: "governance",
    sensitive: false,
  },
  // --- Platform ----------------------------------------------------------
  {
    view: "status",
    path: "/status",
    label: "Platform Status",
    description: "Every system: health, version, dependencies",
    group: "platform",
    sensitive: false,
  },
  {
    view: "platform_health",
    path: "/platform-health",
    label: "Platform Health",
    description: "Schemas, tables, security posture",
    group: "platform",
    sensitive: false,
  },
  {
    view: "graph",
    path: "/graph",
    label: "Knowledge Graph",
    description: "How every asset relates — typed, explainable",
    group: "platform",
    sensitive: false,
  },
  {
    view: "relationships",
    path: "/relationships",
    label: "Asset Relationships",
    description: "Dependencies and dependents",
    group: "platform",
    sensitive: false,
  },
  {
    view: "dashboard",
    path: "/overview",
    label: "Enterprise Overview",
    description: "The original at-a-glance catalog dashboard",
    group: "platform",
    sensitive: false,
  },
];

const ALL: PortalRole[] = [
  "platform_owner",
  "executive",
  "administrator",
  "developer",
  "read_only_auditor",
];
const OPERATIONAL: PortalRole[] = ["platform_owner", "executive", "administrator"];
const EXEC: PortalRole[] = ["platform_owner", "executive"];

/**
 * The access matrix. Each view lists the roles allowed to see it.
 * - platform_owner: everything.
 * - executive: everything (incl. commercial + decisions).
 * - administrator: operational (no commercial/decisions).
 * - developer: technical readiness (no commercial/decisions/deployment).
 * - read_only_auditor: view-only, non-sensitive (no commercial/decisions/deployment).
 */
const MATRIX: Record<PortalView, PortalRole[]> = {
  home: ALL,
  search: ALL,
  applications: ALL,
  status: ALL,
  dashboard: ALL,
  catalog: ALL,
  factory: ALL,
  modules: ALL,
  capabilities: ALL,
  compositions: ALL,
  relationships: ALL,
  readiness: ALL,
  platform_health: ALL,
  graph: ALL,
  portfolio: ALL,
  deployment: OPERATIONAL,
  tasks: OPERATIONAL,
  operations: OPERATIONAL,
  marketing: OPERATIONAL,
  references: OPERATIONAL,
  intelligence: OPERATIONAL,
  government: EXEC,
  commercial: EXEC,
  decisions: EXEC,
};

/** THE check. `null` role (unauthenticated) can see nothing. */
export function canView(role: PortalRole | null, view: PortalView): boolean {
  if (role === null) return false;
  return MATRIX[view].includes(role);
}

/** The views a role may see, in display order. Empty for an unauthenticated viewer. */
export function viewsFor(role: PortalRole | null): ViewMeta[] {
  if (role === null) return [];
  return VIEWS.filter((v) => canView(role, v.view));
}

/** The views a role may see, grouped by nav group in executive order. */
export function groupedViewsFor(
  role: PortalRole | null,
): { group: NavGroup; label: string; views: ViewMeta[] }[] {
  const visible = viewsFor(role);
  return NAV_GROUPS.map((g) => ({
    group: g.group,
    label: g.label,
    views: visible.filter((v) => v.group === g.group),
  })).filter((g) => g.views.length > 0);
}

const VALID_ROLES = new Set<PortalRole>(ALL);

export function isPortalRole(value: unknown): value is PortalRole {
  return typeof value === "string" && VALID_ROLES.has(value as PortalRole);
}

/**
 * Resolve a portal role from HL-BOS platform permissions.
 * The mapping is deterministic and least-privilege: the highest role whose
 * required permission the user holds. `platform.*` (owner) wins; otherwise the
 * console permissions decide. No permission → null (no access).
 */
export function roleFromPermissions(perms: readonly string[]): PortalRole | null {
  const has = (p: string) => perms.includes(p);
  if (has("platform.owner") || has("platform.*")) return "platform_owner";
  if (has("platform.console.executive")) return "executive";
  if (has("platform.console.admin")) return "administrator";
  if (has("platform.console.read")) return "developer";
  if (has("platform.audit.read")) return "read_only_auditor";
  return null;
}
