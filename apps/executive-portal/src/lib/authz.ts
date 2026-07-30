/**
 * Authorization matrix — the security heart of the Executive Portal.
 *
 * PURE and deterministic: no I/O, no session, no environment. This is what the
 * automated authorization-boundary tests assert. Every route calls `canView`
 * server-side before rendering; an unauthenticated viewer has no role and sees
 * nothing.
 *
 * All views are READ-ONLY. No role can execute a command, deploy, or write.
 */

export type PortalRole =
  "platform_owner" | "executive" | "administrator" | "developer" | "read_only_auditor";

export type PortalView =
  | "dashboard"
  | "catalog"
  | "factory"
  | "modules"
  | "compositions"
  | "relationships"
  | "readiness"
  | "platform_health"
  | "commercial"
  | "deployment"
  | "decisions"
  | "portfolio";

export const ROLE_LABEL: Record<PortalRole, string> = {
  platform_owner: "Platform Owner",
  executive: "Executive",
  administrator: "Administrator",
  developer: "Developer",
  read_only_auditor: "Read-only Auditor",
};

export interface ViewMeta {
  view: PortalView;
  path: string;
  label: string;
  description: string;
  /** True = commercially sensitive (owner/executive only). */
  sensitive: boolean;
}

export const VIEWS: ViewMeta[] = [
  {
    view: "dashboard",
    path: "/",
    label: "Executive Dashboard",
    description: "The whole picture at a glance",
    sensitive: false,
  },
  {
    view: "catalog",
    path: "/catalog",
    label: "Enterprise Catalog",
    description: "Every software asset",
    sensitive: false,
  },
  {
    view: "factory",
    path: "/factory",
    label: "Software Factory",
    description: "Assemble products from modules",
    sensitive: false,
  },
  {
    view: "modules",
    path: "/modules",
    label: "Module Registry",
    description: "Reusable engineering modules",
    sensitive: false,
  },
  {
    view: "compositions",
    path: "/compositions",
    label: "Product Compositions",
    description: "How each product is assembled",
    sensitive: false,
  },
  {
    view: "relationships",
    path: "/relationships",
    label: "Asset Relationships",
    description: "Dependencies and dependents",
    sensitive: false,
  },
  {
    view: "readiness",
    path: "/readiness",
    label: "Product Readiness",
    description: "Completion and assembly status",
    sensitive: false,
  },
  {
    view: "platform_health",
    path: "/platform-health",
    label: "Platform Health",
    description: "Schemas, tables, security posture",
    sensitive: false,
  },
  {
    view: "portfolio",
    path: "/portfolio",
    label: "Product Portfolio",
    description: "Every product and its stage",
    sensitive: false,
  },
  {
    view: "deployment",
    path: "/deployment",
    label: "Deployment Status",
    description: "What is built vs deployed",
    sensitive: false,
  },
  {
    view: "commercial",
    path: "/commercial",
    label: "Commercial Readiness",
    description: "Pricing/licensing/ownership status",
    sensitive: true,
  },
  {
    view: "decisions",
    path: "/decisions",
    label: "CEO Decision Status",
    description: "Decisions awaiting the CEO",
    sensitive: true,
  },
];

/**
 * The access matrix. Each view lists the roles allowed to see it.
 * - platform_owner: everything.
 * - executive: everything (incl. commercial + decisions).
 * - administrator: operational (no commercial/decisions).
 * - developer: technical readiness (no commercial/decisions/deployment).
 * - read_only_auditor: view-only, non-sensitive (no commercial/decisions/deployment).
 */
const MATRIX: Record<PortalView, PortalRole[]> = {
  dashboard: [
    "platform_owner",
    "executive",
    "administrator",
    "developer",
    "read_only_auditor",
  ],
  catalog: [
    "platform_owner",
    "executive",
    "administrator",
    "developer",
    "read_only_auditor",
  ],
  factory: [
    "platform_owner",
    "executive",
    "administrator",
    "developer",
    "read_only_auditor",
  ],
  modules: [
    "platform_owner",
    "executive",
    "administrator",
    "developer",
    "read_only_auditor",
  ],
  compositions: [
    "platform_owner",
    "executive",
    "administrator",
    "developer",
    "read_only_auditor",
  ],
  relationships: [
    "platform_owner",
    "executive",
    "administrator",
    "developer",
    "read_only_auditor",
  ],
  readiness: [
    "platform_owner",
    "executive",
    "administrator",
    "developer",
    "read_only_auditor",
  ],
  platform_health: [
    "platform_owner",
    "executive",
    "administrator",
    "developer",
    "read_only_auditor",
  ],
  portfolio: [
    "platform_owner",
    "executive",
    "administrator",
    "developer",
    "read_only_auditor",
  ],
  deployment: ["platform_owner", "executive", "administrator"],
  commercial: ["platform_owner", "executive"],
  decisions: ["platform_owner", "executive"],
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

const VALID_ROLES = new Set<PortalRole>([
  "platform_owner",
  "executive",
  "administrator",
  "developer",
  "read_only_auditor",
]);

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
