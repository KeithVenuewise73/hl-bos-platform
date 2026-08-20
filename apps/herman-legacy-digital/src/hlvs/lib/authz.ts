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
  | "settings"
  | "portfolio"
  | "rising";

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
  // The five Top-100 portfolios. Each is a SAVED RANKED VIEW over the corpus
  // below, never a replacement for it — which is why Discovery Universe sits
  // beside them in the same navigation rather than being superseded.
  {
    view: "portfolio",
    path: "/HLVS/top100/logistics",
    label: "Top 100 · Logistics & Supply Chain",
    description: "Ranked on HLG suitability, where HLG domain knowledge counts",
    operating: false,
  },
  {
    view: "portfolio",
    path: "/HLVS/top100/transformation",
    label: "Top 100 · Business Transformation",
    description: "SMB operating systems, CRM, automation, vertical SaaS",
    operating: false,
  },
  {
    view: "portfolio",
    path: "/HLVS/top100/sports",
    label: "Top 100 · Sports & Sports Media",
    description: "Youth sports, teams, coaching, analytics, broadcast",
    operating: false,
  },
  {
    view: "portfolio",
    path: "/HLVS/top100/outside-core",
    label: "Top 100 · Outside HLG Core",
    description: "Ranked on demonstrated demand, deliberately not on HLG fit",
    operating: false,
  },
  {
    view: "portfolio",
    path: "/HLVS/top100/pain",
    label: "Top 100 · Public Pain Points",
    description: "Recurring problems people are publicly asking someone to solve",
    operating: false,
  },
  {
    view: "rising",
    path: "/HLVS/rising",
    label: "Rising Opportunities",
    description: "Measured growth between two observations — never assumed",
    operating: false,
  },
  {
    view: "opportunities",
    path: "/HLVS/opportunities",
    label: "Discovery Universe",
    description: "Every captured opportunity — the complete corpus, filterable",
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
