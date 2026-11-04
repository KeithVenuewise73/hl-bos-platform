/**
 * MemoryFleetBackend — an in-memory TypeScript port of production fleet.api.
 *
 * Ported operation by operation from the recovered SQL
 * (supabase/recovered/production-2026-10-17/, current definition read from
 * HL-BOS Core on 2026-11-04). Error messages are copied verbatim so a screen
 * shows the same words whichever backend is behind it, and so the parity tests
 * can compare outcomes directly.
 *
 * Ported: workspaces, snapshot, save_fleet, submit_inspection, submit_action,
 * submit_service, team, save_member.
 * Not ported: claim_owner (bootstrap), submit_document / submit_event
 * (document uploads), fleet.medical_api. The demo seeds owners directly.
 *
 * This is a DEMO STORE. It lives in process memory and is gone when the
 * process stops. It is not a substitute for the database.
 */

import {
  BASE_CHECKLIST,
  MUST_REPAIR_LEVEL,
  OUT_OF_SERVICE_LEVEL,
  SERVICE_CATEGORIES,
  TANKER_CHECKLIST,
  currentLevel,
  type InspectionAction,
  type StoredAction,
} from "./dvir.ts";
import type { Operation, Role } from "./entitlements.ts";
import {
  FleetError,
  type FleetBackend,
  type FleetPayload,
  type Snapshot,
  type StoredInspection,
  type StoredServiceRecord,
  type TeamMember,
  type WorkspaceSummary,
} from "./backend.ts";

/** Loose JSON object with the property names fleet.api reads (dot access under strict TS). */
interface Json {
  action?: unknown;
  active?: unknown;
  asset?: unknown;
  assets?: unknown;
  category?: unknown;
  checks?: unknown;
  consent?: unknown;
  cost?: unknown;
  costCents?: unknown;
  date?: unknown;
  driver?: unknown;
  driverEvents?: unknown;
  drivers?: unknown;
  due?: unknown;
  email?: unknown;
  fleet?: unknown;
  fuel?: unknown;
  gallons?: unknown;
  id?: unknown;
  inspectedAt?: unknown;
  inspection?: unknown;
  item?: unknown;
  kind?: unknown;
  level?: unknown;
  name?: unknown;
  note?: unknown;
  odometer?: unknown;
  phase?: unknown;
  photo?: unknown;
  policy?: unknown;
  record?: unknown;
  report?: unknown;
  resolution?: unknown;
  result?: unknown;
  reviews?: unknown;
  revision?: unknown;
  role?: unknown;
  signature?: unknown;
  status?: unknown;
  tankConfig?: unknown;
  title?: unknown;
  type?: unknown;
  units?: unknown;
  work?: unknown;
  workspace?: unknown;
  [k: string]: unknown;
}

interface User {
  id: string;
  email: string;
  confirmed: boolean;
}
interface Member {
  user: string;
  role: Role;
  active: boolean;
}
interface Workspace {
  id: string;
  name: string;
  operable: boolean;
  policy: Json;
  revision: number;
  initialized: boolean;
  version: string;
  members: Map<string, Member>;
  assignments: { unit: string; user: string }[];
  units: Map<string, Json>;
  work: Map<string, Json>;
  fuel: Map<string, Json>;
  drivers: Map<string, Json>;
  driverEvents: Map<string, Json>;
  inspections: StoredInspection[];
  actions: (StoredAction & { inspectionId: string })[];
  services: StoredServiceRecord[];
  audit: { actor: string | null; kind: string; details: Json; created_at: string }[];
  objects: Map<string, { owner: string; bytes: Uint8Array; contentType: string }>;
}

const UNIT_ID = /^[A-Za-z0-9_-]{1,80}$/;
const ROW_ID = /^[A-Za-z0-9_-]{1,100}$/;
const DV_ID = /^DV-[A-Za-z0-9-]{6,80}$/;
const SRV_ID = /^SRV-[A-Za-z0-9-]{6,80}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const perm = (m: string) => new FleetError(m, "42501");
const fail = (m: string) => new FleetError(m);

function str(v: unknown): string {
  return v === undefined || v === null
    ? ""
    : typeof v === "string"
      ? v
      : JSON.stringify(v);
}
function trimLen(v: unknown): number {
  return typeof v === "string"
    ? v.trim().length
    : v === undefined || v === null
      ? 0
      : str(v).trim().length;
}
function arr(v: unknown): Json[] | null {
  return Array.isArray(v) ? (v as Json[]) : null;
}
function clone<T>(v: T): T {
  return structuredClone(v);
}
function validDate(s: string): boolean {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export class MemoryFleetBackend implements FleetBackend {
  private users = new Map<string, User>();
  private workspaces = new Map<string, Workspace>();
  /** Monotonic clock so record order is deterministic, as clock_timestamp() is. */
  private tick = 0;
  private readonly start = Date.now();

  private now(): string {
    this.tick += 1;
    return new Date(this.start + this.tick).toISOString();
  }

  // ---------------------------------------------------------------- seeding
  // Administrative setup, standing in for HL-BOS provisioning + claim_owner.

  addUser(id: string, email: string, confirmed = true): void {
    this.users.set(id, { id, email, confirmed });
  }

  addWorkspace(id: string, name: string, opts: { operable?: boolean } = {}): void {
    this.workspaces.set(id, {
      id,
      name,
      operable: opts.operable ?? true,
      policy: { days: 7, daily: true },
      revision: 0,
      initialized: false,
      version: "1.0.0",
      members: new Map(),
      assignments: [],
      units: new Map(),
      work: new Map(),
      fuel: new Map(),
      drivers: new Map(),
      driverEvents: new Map(),
      inspections: [],
      actions: [],
      services: [],
      audit: [],
      objects: new Map(),
    });
  }

  addMember(workspace: string, user: string, role: Role, active = true): void {
    this.ws(workspace).members.set(user, { user, role, active });
  }

  /** Stands in for an upload to the private hlg-fleet-documents bucket. */
  putObject(
    workspace: string,
    path: string,
    owner: string,
    bytes: Uint8Array,
    contentType: string,
  ): void {
    this.ws(workspace).objects.set(path, { owner, bytes, contentType });
  }

  getObject(
    workspace: string,
    path: string,
  ): { bytes: Uint8Array; contentType: string } | undefined {
    const o = this.workspaces.get(workspace)?.objects.get(path);
    return o ? { bytes: o.bytes, contentType: o.contentType } : undefined;
  }

  // ------------------------------------------------------------- internals

  private ws(id: string): Workspace {
    const w = this.workspaces.get(id);
    if (!w) throw fail(`workspace ${id} not found`);
    return w;
  }

  /** fleet.member_role(w) */
  private roleOf(w: Workspace | undefined, actor: string): Role | null {
    if (!w || !w.operable) return null;
    const m = w.members.get(actor);
    const u = this.users.get(actor);
    return m && m.active && u?.confirmed ? m.role : null;
  }

  /** fleet.can_unit(w, u) */
  private canUnit(w: Workspace, actor: string, unit: string): boolean {
    const r = this.roleOf(w, actor);
    if (r === "owner" || r === "manager" || r === "maintenance") return true;
    return (
      r === "driver" && w.assignments.some((a) => a.unit === unit && a.user === actor)
    );
  }

  /** fleet.inspection_level(w, i) */
  private level(w: Workspace, inspectionId: string): number {
    const rec = w.inspections.find((i) => i.id === inspectionId);
    if (!rec) return 0;
    return currentLevel(
      rec.payload,
      w.actions.filter((a) => a.inspectionId === inspectionId),
    );
  }

  private latestDecisive(
    w: Workspace,
    inspectionId: string,
  ): InspectionAction | undefined {
    return w.actions
      .filter(
        (a) =>
          a.inspectionId === inspectionId &&
          (a.payload.kind === "assess" || a.payload.kind === "certify"),
      )
      .at(-1)?.payload;
  }

  // ------------------------------------------------------------------ api

  // eslint-disable-next-line @typescript-eslint/require-await -- async to match a network backend
  async call<T = unknown>(
    actor: string,
    op: Operation,
    a: Record<string, unknown> = {},
  ): Promise<T> {
    return clone(this.dispatch(actor, op, a)) as T;
  }

  private dispatch(actor: string, op: Operation, a: Json): unknown {
    const user = this.users.get(actor);
    if (!user || !user.confirmed) throw perm("Verified sign-in required");

    if (op === "workspaces") {
      const out: WorkspaceSummary[] = [];
      for (const w of this.workspaces.values()) {
        const m = w.members.get(actor);
        const r = this.roleOf(w, actor);
        if (m && m.active && r)
          out.push({ id: w.id, name: w.name, role: m.role, version: w.version });
      }
      return out;
    }

    const w = this.workspaces.get(str(a.workspace));
    const r = this.roleOf(w, actor);
    if (!w || r === null) throw perm("No active membership in this company");

    switch (op) {
      case "snapshot":
        return this.snapshot(w, actor, r);
      case "save_fleet":
        return this.saveFleet(w, actor, r, a);
      case "submit_inspection":
        return this.submitInspection(w, actor, a);
      case "submit_action":
        return this.submitAction(w, actor, r, a);
      case "submit_service":
        if (r === "driver") throw perm("Maintenance permission required");
        return this.submitService(w, actor, a);
      case "team":
        return this.team(w, r);
      case "save_member":
        return this.saveMember(w, actor, r, a);
      default:
        throw fail("Unsupported operation");
    }
  }

  private snapshot(w: Workspace, actor: string, r: Role): Snapshot {
    const sortById = (m: Map<string, Json>) =>
      [...m.entries()]
        .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
        .map(([, v]) => v);
    let payload: FleetPayload | null = null;
    if (w.initialized) {
      const assets = [...w.units.entries()]
        .filter(([id]) => this.canUnit(w, actor, id))
        .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
        .map(([id, u]) => {
          if (r !== "driver") return u;
          const held = w.inspections.some(
            (i) =>
              i.payload.asset === id && this.level(w, i.id) >= OUT_OF_SERVICE_LEVEL,
          );
          return {
            id,
            name: u.name,
            type: u.type,
            tankConfig: u.tankConfig,
            status: held ? "Out of service" : u.status,
          };
        });
      payload = {
        assets,
        work: r === "driver" ? [] : sortById(w.work),
        fuel: r === "driver" ? [] : sortById(w.fuel),
        drivers: r === "driver" || r === "maintenance" ? [] : sortById(w.drivers),
        driverEvents:
          r === "driver" || r === "maintenance" ? [] : sortById(w.driverEvents),
        policy: w.policy,
      };
    }
    const inspections = w.inspections.filter((i) =>
      this.canUnit(w, actor, i.payload.asset),
    );
    const visible = new Set(inspections.map((i) => i.id));
    return {
      state: { id: 1, revision: w.revision, payload },
      inspections,
      inspection_actions: w.actions
        .filter((x) => visible.has(x.inspectionId))
        .map(({ id, actor: who, created_at, payload: p }) => ({
          id,
          actor: who,
          created_at,
          payload: p,
        })),
      unit_records: r === "driver" ? [] : w.services,
      unit_documents: [],
      unit_record_events: [],
    };
  }

  private saveFleet(w: Workspace, actor: string, r: Role, a: Json): { changes: 0 | 1 } {
    if (r !== "owner" && r !== "manager") throw perm("Owner or manager required");
    const expected = a.revision;
    if (expected === undefined || expected === null) throw fail("Revision required");
    if (Number(expected) !== w.revision) return { changes: 0 };
    const f = (a.fleet ?? {}) as Json;
    const assets = arr(f.assets);
    const work = arr(f.work);
    const fuel = arr(f.fuel);
    if (!assets || !work || !fuel) throw fail("Invalid fleet snapshot");
    if (assets.length > 10000) throw fail("Batch exceeds 10,000 units");
    const ids = assets.map((x) => str(x.id));
    if (ids.some((id) => !UNIT_ID.test(id)) || new Set(ids).size !== ids.length)
      throw fail("Invalid or duplicate unit ID");
    for (const x of work) {
      if (
        !ROW_ID.test(str(x.id)) ||
        (x.cost !== undefined && x.cost !== null && Number(x.cost) < 0)
      )
        throw fail("Invalid work order");
    }
    for (const x of fuel) {
      const bad =
        !ROW_ID.test(str(x.id)) ||
        (x.cost !== undefined && x.cost !== null && Number(x.cost) < 0) ||
        (x.gallons !== undefined && x.gallons !== null && Number(x.gallons) <= 0);
      if (bad) throw fail("Invalid fuel entry");
    }
    // Referential integrity the database enforces with foreign keys.
    const keep = new Set(ids);
    for (const [id] of w.units) {
      if (keep.has(id)) continue;
      const referenced =
        w.inspections.some((i) => i.payload.asset === id) ||
        w.services.some((s) => s.asset === id) ||
        w.assignments.some((x) => x.unit === id) ||
        work.some((x) => x.asset === id) ||
        fuel.some((x) => x.asset === id);
      if (referenced)
        throw fail(`Unit ${id} has records or assignments and cannot be removed`);
    }
    for (const x of [...work, ...fuel]) {
      if (!keep.has(str(x.asset))) throw fail(`Unit ${str(x.asset)} not found`);
    }
    // Apply.
    for (const x0 of assets) {
      let x = x0;
      const id = str(x.id);
      if (
        w.inspections.some(
          (i) => i.payload.asset === id && this.level(w, i.id) >= OUT_OF_SERVICE_LEVEL,
        )
      ) {
        x = { ...x, status: "Out of service" };
      }
      w.units.set(id, x);
    }
    for (const id of [...w.units.keys()]) if (!keep.has(id)) w.units.delete(id);
    w.work = new Map(work.map((x) => [str(x.id), x]));
    w.fuel = new Map(fuel.map((x) => [str(x.id), x]));
    w.drivers = new Map((arr(f.drivers) ?? []).map((x) => [str(x.id), x]));
    w.driverEvents = new Map((arr(f.driverEvents) ?? []).map((x) => [str(x.id), x]));
    w.revision += 1;
    w.initialized = true;
    if (f.policy && typeof f.policy === "object") w.policy = f.policy as Json;
    w.audit.push({
      actor,
      kind: "fleet_saved",
      details: { previous_revision: Number(expected) },
      created_at: this.now(),
    });
    return { changes: 1 };
  }

  private submitInspection(
    w: Workspace,
    actor: string,
    a: Json,
  ): { changes: 0 | 1; duplicate?: true } {
    const v = (a.report ?? {}) as Json;
    const id = str(v.id);
    const asset = str(v.asset);
    if (!DV_ID.test(id) || !this.canUnit(w, actor, asset))
      throw perm("Unit not assigned or invalid report");
    if (!w.units.has(asset)) throw fail("Unit not found");
    if (w.inspections.some((i) => i.id === id && i.actor === actor))
      return { changes: 0, duplicate: true };

    const inspectedAt =
      typeof v.inspectedAt === "string" ? Date.parse(v.inspectedAt) : NaN;
    const invalid =
      !("odometer" in v && "inspectedAt" in v && "checks" in v) ||
      typeof v.odometer !== "number" ||
      typeof v.inspectedAt !== "string" ||
      !["Pre-trip", "End-of-day", "En-route"].includes(str(v.phase)) ||
      trimLen(v.signature) < 1 ||
      trimLen(v.signature) > 120 ||
      v.consent !== true ||
      trimLen(v.driver) < 1 ||
      trimLen(v.driver) > 120 ||
      v.odometer < 0 ||
      Number.isNaN(inspectedAt) ||
      inspectedAt > Date.now() + 5 * 60 * 1000;
    if (invalid) throw fail("Invalid signed inspection");

    const checks = arr(v.checks);
    if (!checks || checks.length > 30) throw fail("Invalid checklist");
    const unit = w.units.get(asset) ?? {};
    const tank =
      unit.type === "Tanker" ||
      !["Not applicable", ""].includes(str(unit.tankConfig || "Not applicable"));
    const required: string[] = [...BASE_CHECKLIST, ...(tank ? TANKER_CHECKLIST : [])];
    for (const need of required) {
      if (!checks.some((c) => c.item === need))
        throw fail(`Required checklist item missing: ${need}`);
    }
    if (new Set(checks.map((c) => str(c.item))).size !== checks.length)
      throw fail("Duplicate checklist items");
    for (const c of checks) {
      if (!["Pass", "Defect", "Not applicable"].includes(str(c.result)))
        throw fail("Invalid inspection result");
      if (c.result === "Defect") {
        const lvl = Number(c.level ?? 0);
        if (!(lvl >= 1 && lvl <= 4) || trimLen(c.note) < 1 || trimLen(c.note) > 1500) {
          throw fail("Defect needs severity and description");
        }
      }
    }
    if (v.photo !== undefined && v.photo !== null) {
      const o = w.objects.get(str(v.photo));
      if (v.photo !== `dvir/${id}.jpg` || !o || o.owner !== actor)
        throw fail("Invalid inspection photo");
    }

    if (v.phase === "Pre-trip") {
      const reviews = arr(a.reviews) ?? [];
      for (const rec of w.inspections.filter((i) => i.payload.asset === asset)) {
        const last = this.latestDecisive(w, rec.id);
        const reviewed = w.actions.some(
          (x) =>
            x.inspectionId === rec.id &&
            x.actor === actor &&
            x.payload.kind === "review",
        );
        if (last?.kind === "certify" && !reviewed) {
          if (!reviews.some((z) => z.inspection === rec.id))
            throw fail("Prior repair certification acknowledgment required");
          w.actions.push({
            id: crypto.randomUUID(),
            inspectionId: rec.id,
            actor,
            created_at: this.now(),
            payload: {
              inspection: rec.id,
              kind: "review",
              signature: str(v.signature),
              consent: true,
              note: "Prior report and repair certification reviewed before driving.",
            },
          });
        }
      }
    }

    const stored = {
      ...v,
      companyPolicy: w.policy,
    } as unknown as StoredInspection["payload"];
    w.inspections.push({ id, actor, created_at: this.now(), payload: stored });
    return { changes: 1 };
  }

  private submitAction(w: Workspace, actor: string, r: Role, a: Json): { changes: 1 } {
    const v = (a.action ?? {}) as Json;
    const rec = w.inspections.find((i) => i.id === str(v.inspection));
    if (!rec || !this.canUnit(w, actor, rec.payload.asset))
      throw perm("Report not accessible");
    if (!rec.payload.checks.some((c) => c.result === "Defect"))
      throw fail("No defect to act on");
    if (
      !["acknowledge", "assess", "certify", "review"].includes(str(v.kind)) ||
      trimLen(v.signature) < 1 ||
      trimLen(v.signature) > 120 ||
      v.consent !== true ||
      trimLen(v.note) < 1 ||
      trimLen(v.note) > 2000
    ) {
      throw fail("Invalid signed action");
    }
    if (r === "driver" && v.kind !== "review")
      throw perm("Maintenance permission required");
    const last = this.latestDecisive(w, rec.id);
    if ((v.kind === "assess" || v.kind === "certify") && last?.kind === "certify")
      throw fail("Already certified; submit a new defect");
    if (v.kind === "review" && last?.kind !== "certify")
      throw fail("Repair certification required first");
    if (v.kind === "assess") {
      const lvl = Number(v.level ?? 0);
      if (!(lvl >= 1 && lvl <= 4)) throw fail("Invalid severity");
    }
    if (
      v.kind === "certify" &&
      (!["Repaired", "Repair unnecessary"].includes(str(v.resolution)) ||
        (v.resolution === "Repair unnecessary" &&
          this.level(w, rec.id) >= MUST_REPAIR_LEVEL))
    ) {
      throw fail("Safety holds require repair or signed reassessment");
    }
    w.actions.push({
      id: crypto.randomUUID(),
      inspectionId: rec.id,
      actor,
      created_at: this.now(),
      payload: v as unknown as InspectionAction,
    });
    return { changes: 1 };
  }

  private submitService(w: Workspace, actor: string, a: Json): { changes: 1 } {
    const v = (a.record ?? {}) as Json;
    if (
      !(SERVICE_CATEGORIES as readonly string[]).includes(str(v.category)) ||
      trimLen(v.title) < 1 ||
      trimLen(v.title) > 160 ||
      !SRV_ID.test(str(v.id)) ||
      !/^[0-9]+$/.test(str(v.costCents))
    ) {
      throw fail("Invalid service record");
    }
    if (!DATE.test(str(v.date))) throw fail("Service date required");
    if (!validDate(str(v.date)))
      throw fail(`invalid input syntax for type date: "${str(v.date)}"`);
    if (str(v.due) !== "" && !validDate(str(v.due)))
      throw fail(`invalid input syntax for type date: "${str(v.due)}"`);
    const asset = str(v.asset);
    if (str(v.work) !== "") {
      const wo = w.work.get(str(v.work));
      if (!wo || wo.asset !== asset || wo.status !== "Completed")
        throw fail("Completed work order must belong to this unit");
    }
    if (
      str(v.inspection) !== "" &&
      !w.inspections.some(
        (i) => i.id === str(v.inspection) && i.payload.asset === asset,
      )
    ) {
      throw fail("DVIR must belong to this unit");
    }
    if (!w.units.has(asset)) throw fail(`Unit ${asset} not found`);
    if (w.services.some((s) => s.id === str(v.id)))
      throw fail("duplicate service record id");
    w.services.push({
      id: str(v.id),
      asset,
      work_id: str(v.work) || null,
      actor,
      created_at: this.now(),
      payload: v,
    });
    return { changes: 1 };
  }

  private team(w: Workspace, r: Role): { members: TeamMember[] } {
    if (r !== "owner" && r !== "manager") throw perm("Manager required");
    return {
      members: [...w.members.values()].map((m) => ({
        id: m.user,
        email: this.users.get(m.user)?.email ?? "",
        role: m.role,
        active: m.active,
        units: w.assignments.filter((x) => x.user === m.user).map((x) => x.unit),
      })),
    };
  }

  private saveMember(w: Workspace, actor: string, r: Role, a: Json): { saved: true } {
    if (r !== "owner") throw perm("Only the company owner can manage access");
    const email = str(a.email).trim().toLowerCase();
    const target = [...this.users.values()].find(
      (u) => u.email.toLowerCase() === email && u.confirmed,
    );
    if (!target) throw fail("This person must create and verify an HLG account first");
    const role = str(a.role) as Role;
    if (!["owner", "manager", "maintenance", "driver"].includes(role))
      throw fail("Invalid role");
    if (target.id === actor && (role !== "owner" || a.active !== true))
      throw fail("You cannot remove your own owner access");
    const old = w.members.get(target.id);
    const owners = [...w.members.values()].filter(
      (m) => m.role === "owner" && m.active,
    ).length;
    if (old?.role === "owner" && (role !== "owner" || a.active !== true) && owners <= 1)
      throw fail("At least one owner is required");
    const units = (Array.isArray(a.units) ? a.units : []).map((u) => str(u));
    for (const u of units) if (!w.units.has(u)) throw fail(`Unit ${u} not found`);
    w.members.set(target.id, { user: target.id, role, active: a.active === true });
    w.assignments = w.assignments
      .filter((x) => x.user !== target.id)
      .concat(units.map((unit) => ({ unit, user: target.id })));
    w.audit.push({
      actor,
      kind: "member_updated",
      details: { user: target.id, role, active: a.active, units },
      created_at: this.now(),
    });
    return { saved: true };
  }
}
