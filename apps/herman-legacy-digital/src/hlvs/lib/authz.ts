/**
 * Venture Studio authorization — PURE, deterministic, unit-tested.
 *
 * Read access is role-gated per view. The CEO decision is gated separately and
 * more tightly: `canDecide` is true ONLY for `platform_owner`, mirroring the
 * database permission `vstudio.decision.record` (granted to platform_owner
 * alone). The database is the authoritative gate; this is defense in depth.
 */

export type StudioRole =
  | "platform_owner" // the CEO — the only role that can record a decision
  | "platform_admin"
  | "executive"
  | "viewer";

export const ROLE_LABEL: Record<StudioRole, string> = {
  platform_owner: "CEO / Platform Owner",
  platform_admin: "Administrator",
  executive: "Executive",
  viewer: "Viewer",
};

export type StudioView =
  | "overview"
  | "opportunities"
  | "new_opportunity"
  | "opportunity_detail"
  | "evidence"
  | "evaluation"
  | "reuse"
  | "decision"
  | "factory_preview"
  | "notebook"
  | "notebook_detail"
  | "settings";

export interface ViewMeta {
  view: StudioView;
  path: string;
  label: string;
  description: string;
  /** True = requires an operating role (not a plain viewer). */
  operating: boolean;
}

export const VIEWS: ViewMeta[] = [
  {
    view: "overview",
    path: "/",
    label: "Executive Overview",
    description: "The CEO thinking environment — pipeline at a glance",
    operating: false,
  },
  {
    view: "opportunities",
    path: "/HLVS/opportunities",
    label: "Opportunity Catalog",
    description: "Every captured opportunity, filterable",
    operating: false,
  },
  {
    view: "new_opportunity",
    path: "/HLVS/opportunities/new",
    label: "New Opportunity",
    description: "Capture an opportunity (manual intake)",
    operating: true,
  },
  {
    view: "notebook",
    path: "/HLVS/notebook",
    label: "CEO Notebook",
    description: "Executive intelligence workspace — notes, requests, tasks",
    operating: false,
  },
  {
    view: "settings",
    path: "/HLVS/settings",
    label: "Sources & Settings",
    description: "Discovery source status (V2-1: none connected)",
    operating: false,
  },
];

const ALL: StudioRole[] = ["platform_owner", "platform_admin", "executive", "viewer"];
const OPERATING: StudioRole[] = ["platform_owner", "platform_admin", "executive"];

/** Read gate for a view. `null` role (unauthenticated) sees nothing. */
export function canView(
  role: StudioRole | null,
  view: ViewMeta | { operating: boolean },
): boolean {
  if (role === null) return false;
  return (view.operating ? OPERATING : ALL).includes(role);
}

/** Can this role capture/evaluate (write, but not decide)? */
export function canManage(role: StudioRole | null): boolean {
  return role !== null && OPERATING.includes(role);
}

/**
 * THE decision gate. Only the CEO (platform_owner) may record the authoritative
 * decision — identical to the database permission `vstudio.decision.record`.
 */
export function canDecide(role: StudioRole | null): boolean {
  return role === "platform_owner";
}

const VALID = new Set<StudioRole>(ALL);
export function isStudioRole(v: unknown): v is StudioRole {
  return typeof v === "string" && VALID.has(v as StudioRole);
}

/** Map HL-BOS platform permissions → a Studio role, least-privilege. */
export function roleFromPermissions(perms: readonly string[]): StudioRole | null {
  const has = (p: string) => perms.includes(p);
  if (has("platform.owner") || has("platform.*")) return "platform_owner";
  if (has("platform.console.admin")) return "platform_admin";
  if (has("platform.console.executive")) return "executive";
  if (has("platform.console.read") || has("platform.audit.read")) return "viewer";
  return null;
}
