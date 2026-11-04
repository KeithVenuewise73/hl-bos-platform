/**
 * Fleet status, computed live from inspection records.
 *
 * Why this exists: production fleet.api stores a unit's `status` inside its
 * JSON payload and only rewrites it to "Out of service" during save_fleet.
 * For a driver, snapshot() recomputes it on read; for a manager it does NOT.
 * So a manager reading the stored status after a driver reports a level-2
 * defect would still see "Available" until somebody next saves the fleet, and
 * would still see "Out of service" after the repair is certified. Every TMS
 * screen therefore derives status here, from the records, instead of trusting
 * the stored field. (Recorded as finding F-3 in the Phase 5 report.)
 */

import {
  OUT_OF_SERVICE_LEVEL,
  currentLevel,
  text,
  defectState,
  type DefectState,
  type StoredAction,
} from "./dvir.ts";
import type { Snapshot, StoredInspection } from "./backend.ts";

export type LiveStatus = "Out of service" | "Defect open" | "Available" | "Inactive";

export interface UnitStatus {
  id: string;
  name: string;
  type: string;
  status: LiveStatus;
  /** Highest current severity across this unit's reports. */
  level: number;
  openDefects: number;
  lastInspection: StoredInspection | undefined;
  inspectedToday: boolean;
}

export interface DefectRow {
  inspection: StoredInspection;
  unitId: string;
  level: number;
  state: DefectState;
  defects: { item: string; level: number; note: string }[];
  actions: StoredAction[];
}

function actionsFor(s: Snapshot, inspectionId: string): StoredAction[] {
  return s.inspection_actions.filter((a) => a.payload.inspection === inspectionId);
}

export function defectRows(s: Snapshot): DefectRow[] {
  return s.inspections
    .filter((i) => i.payload.checks.some((c) => c.result === "Defect"))
    .map((i) => {
      const actions = actionsFor(s, i.id);
      return {
        inspection: i,
        unitId: i.payload.asset,
        level: currentLevel(i.payload, actions),
        state: defectState(i.payload, actions),
        defects: i.payload.checks
          .filter((c) => c.result === "Defect")
          .map((c) => ({
            item: c.item,
            level: Number(c.level ?? 0),
            note: text(c.note, ""),
          })),
        actions,
      };
    })
    .sort(
      (a, b) =>
        b.level - a.level ||
        (a.inspection.created_at < b.inspection.created_at ? 1 : -1),
    );
}

/** A defect is outstanding until a repair is certified. */
export function isOutstanding(d: DefectRow): boolean {
  return d.state === "open" || d.state === "assessed";
}

function sameDay(iso: string, today: Date): boolean {
  return iso.slice(0, 10) === today.toISOString().slice(0, 10);
}

export function unitStatuses(s: Snapshot, today = new Date()): UnitStatus[] {
  const units = s.state.payload?.assets ?? [];
  const defects = defectRows(s);
  return units.map((u) => {
    const id = text(u.id);
    const mine = defects.filter((d) => d.unitId === id);
    const level = mine.reduce((m, d) => Math.max(m, d.level), 0);
    const open = mine.filter(isOutstanding).length;
    const inspections = s.inspections.filter((i) => i.payload.asset === id);
    const last = inspections.at(-1);
    const stored = text(u.status, "");
    const status: LiveStatus =
      level >= OUT_OF_SERVICE_LEVEL
        ? "Out of service"
        : open > 0
          ? "Defect open"
          : stored === "Inactive"
            ? "Inactive"
            : "Available";
    return {
      id,
      name: text(u.name, id),
      type: text(u.type, ""),
      status,
      level,
      openDefects: open,
      lastInspection: last,
      inspectedToday: inspections.some((i) => sameDay(i.payload.inspectedAt, today)),
    };
  });
}

export interface FleetSummary {
  units: number;
  available: number;
  outOfService: number;
  defectOpen: number;
  inactive: number;
  inspectedToday: number;
  /** Units in service that have an inspection today / units in service. null when there are none. */
  inspectionCompletion: number | null;
  outstandingDefects: number;
}

export function fleetSummary(s: Snapshot, today = new Date()): FleetSummary {
  const st = unitStatuses(s, today);
  const inService = st.filter((u) => u.status !== "Inactive");
  const inspected = inService.filter((u) => u.inspectedToday).length;
  return {
    units: st.length,
    available: st.filter((u) => u.status === "Available").length,
    outOfService: st.filter((u) => u.status === "Out of service").length,
    defectOpen: st.filter((u) => u.status === "Defect open").length,
    inactive: st.filter((u) => u.status === "Inactive").length,
    inspectedToday: inspected,
    inspectionCompletion: inService.length === 0 ? null : inspected / inService.length,
    outstandingDefects: defectRows(s).filter(isOutstanding).length,
  };
}
