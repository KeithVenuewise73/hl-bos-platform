/**
 * Digital DVIR rules.
 *
 * Every constant here is copied from the production backend, fleet.api
 * (recovered to supabase/recovered/production-2026-10-17/), so the screens ask
 * for exactly what the database will accept. The parity tests in
 * backend.parity.test.ts run the same scenarios through the in-memory backend
 * and through the recovered SQL, and fail if the two disagree.
 *
 * COMPLIANCE NOTE (deliberately not a claim): the base list resembles the
 * 49 CFR 396.11 driver-report items for a power unit and the tanker additions
 * cover cargo-tank equipment. Whether a given customer's vehicles, trailers,
 * hazmat class and state rules are satisfied has NOT been validated. Do not
 * describe this as "DOT compliant" until it has been.
 */

export const BASE_CHECKLIST = [
  "Service brakes / connections",
  "Parking brake",
  "Steering",
  "Lights / reflectors",
  "Tires",
  "Horn",
  "Windshield wipers",
  "Mirrors",
  "Coupling devices",
  "Wheels / rims",
  "Emergency equipment",
] as const;

export const TANKER_CHECKLIST = [
  "Tank / fittings / leaks",
  "Valves / caps / closures",
  "Hoses / delivery equipment",
  "Placards / markings",
  "Emergency shutoff",
] as const;

export const PHASES = ["Pre-trip", "En-route", "End-of-day"] as const;
export type Phase = (typeof PHASES)[number];

export const RESULTS = ["Pass", "Defect", "Not applicable"] as const;
export type CheckResult = (typeof RESULTS)[number];

/**
 * Severity 1-4. The production backend enforces two thresholds and these
 * labels describe exactly those thresholds, nothing more:
 *   level >= 2  -> the unit is shown "Out of service" until certified
 *   level >= 3  -> "Repair unnecessary" is refused; it must be repaired
 */
export const SEVERITY = [
  {
    level: 1,
    label: "Minor — note for maintenance",
    outOfService: false,
    mustRepair: false,
  },
  {
    level: 2,
    label: "Out of service until reviewed",
    outOfService: true,
    mustRepair: false,
  },
  {
    level: 3,
    label: "Safety hold — repair required",
    outOfService: true,
    mustRepair: true,
  },
  {
    level: 4,
    label: "Critical — repair required",
    outOfService: true,
    mustRepair: true,
  },
] as const;
export const OUT_OF_SERVICE_LEVEL = 2;
export const MUST_REPAIR_LEVEL = 3;

export const ACTION_KINDS = ["acknowledge", "assess", "certify", "review"] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];
export const RESOLUTIONS = ["Repaired", "Repair unnecessary"] as const;

export const SERVICE_CATEGORIES = [
  "Repair",
  "Preventive maintenance",
  "Inspection / testing",
  "Fuel",
  "Insurance",
  "Registration / permits",
  "Tires",
  "Tolls",
  "Other",
] as const;

export interface Unit {
  id: string;
  name: string;
  type: string;
  tankConfig?: string;
  status?: string;
  [k: string]: unknown;
}

export function isTankUnit(u: Pick<Unit, "type" | "tankConfig">): boolean {
  const cfg = u.tankConfig ?? "Not applicable";
  return u.type === "Tanker" || (cfg !== "Not applicable" && cfg !== "");
}

export function checklistFor(u: Pick<Unit, "type" | "tankConfig">): string[] {
  return isTankUnit(u) ? [...BASE_CHECKLIST, ...TANKER_CHECKLIST] : [...BASE_CHECKLIST];
}

export interface Check {
  item: string;
  result: CheckResult;
  level?: number;
  note?: string;
}

export interface InspectionReport {
  id: string;
  asset: string;
  phase: Phase;
  odometer: number;
  inspectedAt: string;
  driver: string;
  signature: string;
  consent: true;
  checks: Check[];
  photo?: string;
  [k: string]: unknown;
}

export interface InspectionAction {
  id?: string;
  inspection: string;
  kind: ActionKind;
  signature: string;
  consent: true;
  note: string;
  level?: number;
  resolution?: (typeof RESOLUTIONS)[number];
}

/** IDs in the exact formats fleet.api accepts. */
export function newInspectionId(): string {
  return `DV-${crypto.randomUUID()}`;
}
export function newServiceId(): string {
  return `SRV-${crypto.randomUUID()}`;
}
export function photoPathFor(inspectionId: string): string {
  return `dvir/${inspectionId}.jpg`;
}

/** Highest severity recorded on the report itself (0 = no defects). */
export function reportedLevel(r: Pick<InspectionReport, "checks">): number {
  return r.checks.reduce(
    (m, c) => (c.result === "Defect" ? Math.max(m, Number(c.level ?? 0)) : m),
    0,
  );
}

export interface StoredAction {
  id: string;
  actor: string;
  created_at: string;
  payload: InspectionAction;
}

/**
 * Port of fleet.inspection_level(): the latest assess/certify action wins
 * (certify = 0); with none, the highest defect level on the report.
 */
export function currentLevel(
  report: Pick<InspectionReport, "checks">,
  actions: readonly StoredAction[],
): number {
  const decisive = actions
    .filter((a) => a.payload.kind === "assess" || a.payload.kind === "certify")
    .sort((a, b) =>
      a.created_at === b.created_at
        ? a.id < b.id
          ? -1
          : 1
        : a.created_at < b.created_at
          ? -1
          : 1,
    );
  const last = decisive.at(-1);
  if (last)
    return last.payload.kind === "certify" ? 0 : Number(last.payload.level ?? 0);
  return reportedLevel(report);
}

export type DefectState = "none" | "open" | "assessed" | "certified" | "reviewed";

export function defectState(
  report: Pick<InspectionReport, "checks">,
  actions: readonly StoredAction[],
): DefectState {
  if (!report.checks.some((c) => c.result === "Defect")) return "none";
  const kinds = [...actions]
    .sort((a, b) =>
      a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0,
    )
    .map((a) => a.payload.kind);
  const lastDecisive = [...kinds]
    .reverse()
    .find((k) => k === "assess" || k === "certify");
  if (lastDecisive === "certify")
    return kinds.lastIndexOf("review") > kinds.lastIndexOf("certify")
      ? "reviewed"
      : "certified";
  if (lastDecisive === "assess") return "assessed";
  return "open";
}

/**
 * Display text for a free-form JSON field (fleet.api stores records as jsonb).
 * Strings and numbers render; anything else renders as the fallback, never as
 * "[object Object]".
 */
export function text(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return fallback;
}
