/**
 * Entitlements: given the modules a company has licensed and the role of the
 * person signed in, which screens and operations are allowed?
 *
 * This is the single decision point. The app calls `canOpen` for every page and
 * `canCall` for every backend operation, on the server — a locked tile in the
 * navigation is a convenience, never the control.
 */

import {
  CAPABILITIES,
  MODULES,
  moduleByKey,
  type CapabilityKey,
  type ModuleKey,
} from "./modules.ts";

/** Roles exactly as production fleet.api defines them (fleet.members.role). */
export type Role = "owner" | "manager" | "maintenance" | "driver";
export const ROLES: readonly Role[] = ["owner", "manager", "maintenance", "driver"];

export interface ResolvedEntitlements {
  /** Licensed modules whose commercial dependencies are satisfied. */
  active: ModuleKey[];
  /** Licensed but unusable until a required module is also licensed. */
  blocked: { module: ModuleKey; needsOneOf: ModuleKey[] }[];
  /** Internal capabilities granted by the active modules. Never billed. */
  capabilities: CapabilityKey[];
}

export function resolveEntitlements(
  licensed: readonly ModuleKey[],
): ResolvedEntitlements {
  const set = new Set(licensed);
  const active: ModuleKey[] = [];
  const blocked: ResolvedEntitlements["blocked"] = [];
  for (const m of MODULES) {
    if (!set.has(m.key)) continue;
    if (m.requiresAnyOf.length > 0 && !m.requiresAnyOf.some((d) => set.has(d))) {
      blocked.push({ module: m.key, needsOneOf: [...m.requiresAnyOf] });
    } else {
      active.push(m.key);
    }
  }
  const caps = new Set<CapabilityKey>();
  for (const k of active) for (const c of moduleByKey(k).capabilities) caps.add(c);
  // Keep catalog order so output is stable.
  const capabilities = CAPABILITIES.map((c) => c.key).filter((k) => caps.has(k));
  return { active, blocked, capabilities };
}

/**
 * Every screen in the TMS app, the module(s) any one of which unlocks it, and
 * the roles allowed in. `module: "core"` screens are platform setup that every
 * licensed company gets (company, people, the basic vehicle list) — which is
 * how a DVIR-only customer registers trucks without buying Fleet Management.
 */
export type ScreenKey =
  | "home"
  | "setup"
  | "modules"
  | "fleet"
  | "fleet_detail"
  | "dashboard"
  | "drivers"
  | "driver_detail"
  | "driver_dvir"
  | "defects"
  | "inspection_report"
  | "maintenance";

export interface Screen {
  key: ScreenKey;
  path: string;
  label: string;
  modules: ModuleKey[] | "core";
  roles: readonly Role[];
  /** Shown in the main navigation. */
  nav: boolean;
}

const MANAGERS: readonly Role[] = ["owner", "manager"];
const OFFICE: readonly Role[] = ["owner", "manager", "maintenance"];

export const SCREENS: readonly Screen[] = [
  { key: "home", path: "/", label: "Home", modules: "core", roles: ROLES, nav: true },
  {
    key: "dashboard",
    path: "/dashboard",
    label: "Fleet status",
    modules: ["fleet_management"],
    roles: OFFICE,
    nav: true,
  },
  {
    key: "fleet",
    path: "/fleet",
    label: "Vehicles",
    modules: ["fleet_management"],
    roles: OFFICE,
    nav: true,
  },
  {
    key: "fleet_detail",
    path: "/fleet/[id]",
    label: "Vehicle",
    modules: ["fleet_management"],
    roles: OFFICE,
    nav: false,
  },
  {
    key: "drivers",
    path: "/drivers",
    label: "Drivers",
    modules: ["driver_management"],
    roles: MANAGERS,
    nav: true,
  },
  {
    key: "driver_detail",
    path: "/drivers/[id]",
    label: "Driver",
    modules: ["driver_management"],
    roles: MANAGERS,
    nav: false,
  },
  {
    key: "driver_dvir",
    path: "/driver",
    label: "Inspect a vehicle",
    modules: ["dvir"],
    roles: ROLES,
    nav: true,
  },
  {
    key: "defects",
    path: "/defects",
    label: "Defects",
    modules: ["dvir", "maintenance"],
    roles: OFFICE,
    nav: true,
  },
  {
    key: "inspection_report",
    path: "/inspections/[id]",
    label: "Inspection report",
    modules: ["dvir"],
    roles: ROLES,
    nav: false,
  },
  {
    key: "maintenance",
    path: "/maintenance",
    label: "Maintenance",
    modules: ["maintenance"],
    roles: OFFICE,
    nav: true,
  },
  {
    key: "setup",
    path: "/setup",
    label: "Company setup",
    modules: "core",
    roles: MANAGERS,
    nav: true,
  },
  {
    key: "modules",
    path: "/modules",
    label: "Modules",
    modules: "core",
    roles: ["owner"],
    nav: true,
  },
];

export function screenByKey(key: ScreenKey): Screen {
  const s = SCREENS.find((x) => x.key === key);
  if (!s) throw new Error(`Unknown screen ${key}`);
  return s;
}

export type Denial = "not_licensed" | "role_not_allowed" | "no_modules";

export type AccessDecision =
  { allowed: true } | { allowed: false; reason: Denial; detail: string };

export function canOpen(
  screen: ScreenKey,
  licensed: readonly ModuleKey[],
  role: Role,
): AccessDecision {
  const s = screenByKey(screen);
  const { active } = resolveEntitlements(licensed);
  if (s.key === "modules" && role === "owner") {
    // Billing must stay reachable when nothing is licensed: a failed payment
    // or a cancellation would otherwise lock the owner out of the one page
    // that fixes it. (Found by the browser test.) Operational screens stay shut.
    return { allowed: true };
  }
  if (s.modules === "core") {
    if (active.length === 0) {
      return {
        allowed: false,
        reason: "no_modules",
        detail: "This company has no active TMS module.",
      };
    }
  } else if (!s.modules.some((m) => active.includes(m))) {
    const names = s.modules.map((m) => moduleByKey(m).name).join(" or ");
    return {
      allowed: false,
      reason: "not_licensed",
      detail: `${s.label} is part of ${names}, which this company has not licensed.`,
    };
  }
  if (!s.roles.includes(role)) {
    return {
      allowed: false,
      reason: "role_not_allowed",
      detail: `${s.label} is not available to the ${role} role.`,
    };
  }
  return { allowed: true };
}

/**
 * Backend operations (fleet.api `op` values plus the app's own) and the
 * licence that covers them. Role checks for these ops stay where production
 * puts them — inside fleet.api — and are not duplicated here.
 *
 * `snapshot` and `save_fleet` are core: they read and write the shared vehicle
 * registry, which every module depends on.
 */
export type Operation =
  | "workspaces"
  | "snapshot"
  | "save_fleet"
  | "submit_inspection"
  | "submit_action"
  | "submit_service"
  | "team"
  | "save_member"
  | "templates"
  | "save_template";

const OPERATION_MODULES: Record<Operation, ModuleKey[] | "core"> = {
  workspaces: "core",
  snapshot: "core",
  save_fleet: "core",
  team: "core",
  save_member: "core",
  submit_inspection: ["dvir"],
  submit_action: ["dvir", "maintenance"],
  submit_service: ["maintenance"],
  templates: ["dvir"],
  save_template: ["dvir"],
};

export function canCall(op: Operation, licensed: readonly ModuleKey[]): AccessDecision {
  const need = OPERATION_MODULES[op];
  const { active } = resolveEntitlements(licensed);
  if (active.length === 0)
    return { allowed: false, reason: "no_modules", detail: "No active TMS module." };
  if (need === "core" || need.some((m) => active.includes(m))) return { allowed: true };
  return {
    allowed: false,
    reason: "not_licensed",
    detail: `Operation ${op} requires ${need.map((m) => moduleByKey(m).name).join(" or ")}.`,
  };
}

/** Navigation for a company and role: only screens that would open. */
export function navigation(licensed: readonly ModuleKey[], role: Role): Screen[] {
  return SCREENS.filter((s) => s.nav && canOpen(s.key, licensed, role).allowed);
}

/**
 * save_fleet writes the whole fleet document: the shared vehicle registry
 * (core) AND sections that belong to licensed modules. Without this check a
 * DVIR-only company could create work orders or driver profiles through the
 * core registry call. A section may only CHANGE if its module is active.
 */
export const FLEET_SECTION_MODULES = {
  work: ["maintenance"],
  fuel: ["fleet_management", "profitability", "maintenance"],
  drivers: ["driver_management"],
  driverEvents: ["driver_management"],
} as const satisfies Record<string, readonly ModuleKey[]>;

export type FleetSection = keyof typeof FLEET_SECTION_MODULES;

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v)
      .sort()
      .map(
        (k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

export function unlicensedFleetChanges(
  current: Partial<Record<FleetSection, unknown>> | null,
  incoming: Partial<Record<FleetSection, unknown>>,
  licensed: readonly ModuleKey[],
): FleetSection[] {
  const { active } = resolveEntitlements(licensed);
  const out: FleetSection[] = [];
  for (const [section, modules] of Object.entries(FLEET_SECTION_MODULES) as [
    FleetSection,
    readonly ModuleKey[],
  ][]) {
    if (modules.some((m) => active.includes(m))) continue;
    const before = canonical(current?.[section] ?? []);
    const after = canonical(incoming[section] ?? []);
    if (before !== after) out.push(section);
  }
  return out;
}

/**
 * Module keys as HL-BOS stores them (entitlements.modules, proposed P001)
 * mapped to this package's keys. The database is the source of truth for
 * what a company holds; this is only the name translation.
 */
export const DB_MODULE_KEY: Record<ModuleKey, string> = {
  fleet_management: "tms_fleet",
  driver_management: "tms_drivers",
  dvir: "tms_dvir",
  dispatch: "tms_dispatch",
  routes: "tms_routes",
  driver_app: "tms_driver_app",
  kpi_scorecards: "tms_kpi",
  profitability: "tms_profitability",
  maintenance: "tms_maintenance",
  executive_dashboard: "tms_executive",
  customer_portal: "tms_portal",
  automation: "tms_automation",
};

export function fromDbModules(dbKeys: readonly string[]): ModuleKey[] {
  const set = new Set(dbKeys);
  return (Object.keys(DB_MODULE_KEY) as ModuleKey[]).filter((k) =>
    set.has(DB_MODULE_KEY[k]),
  );
}
