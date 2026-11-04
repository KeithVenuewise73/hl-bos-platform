/**
 * Shared scenario suite. The same tests run against
 *   - MemoryFleetBackend (always), and
 *   - the recovered production fleet.api in an isolated PostgreSQL (when
 *     TMS_PG_DB is set) —
 * so the demo's behaviour is pinned to production's, rule by rule.
 */

import { describe, expect, it } from "vitest";
import type { FleetBackend, Snapshot } from "../backend.ts";
import {
  BASE_CHECKLIST,
  TANKER_CHECKLIST,
  checklistFor,
  newInspectionId,
  newServiceId,
  type Check,
} from "../dvir.ts";
import type { Role } from "../entitlements.ts";
import { fleetSummary, unitStatuses } from "../fleet-status.ts";

export interface SeedableBackend extends FleetBackend {
  addUser(id: string, email: string, confirmed?: boolean): void;
  addWorkspace(id: string, name: string, opts?: { operable?: boolean }): void;
  addMember(workspace: string, user: string, role: Role, active?: boolean): void;
  putObject(
    workspace: string,
    path: string,
    owner: string,
    bytes: Uint8Array,
    contentType: string,
  ): void;
}

const uuid = () => crypto.randomUUID();

export async function fixture(b: SeedableBackend) {
  const ws = uuid();
  const tag = ws.slice(0, 8);
  const u = {
    owner: uuid(),
    manager: uuid(),
    maint: uuid(),
    dana: uuid(),
    devon: uuid(),
  };
  b.addWorkspace(ws, `Scenario Fuel ${tag}`);
  for (const [k, id] of Object.entries(u)) b.addUser(id, `${k}.${tag}@example.test`);
  b.addMember(ws, u.owner, "owner");
  b.addMember(ws, u.manager, "manager");
  b.addMember(ws, u.maint, "maintenance");
  b.addMember(ws, u.dana, "driver");
  b.addMember(ws, u.devon, "driver");
  const saved = await b.call(u.manager, "save_fleet", {
    workspace: ws,
    revision: 0,
    fleet: {
      assets: [
        {
          id: "T-101",
          name: "Tanker 101",
          type: "Tanker",
          tankConfig: "3 compartments",
          status: "Available",
        },
        {
          id: "B-201",
          name: "Box truck 201",
          type: "Box truck",
          tankConfig: "Not applicable",
          status: "Available",
        },
      ],
      work: [],
      fuel: [],
      drivers: [{ id: "dana", name: "Dana Driver" }],
      driverEvents: [],
    },
  });
  expect(saved).toEqual({ changes: 1 });
  await b.call(u.owner, "save_member", {
    workspace: ws,
    email: `dana.${tag}@example.test`,
    role: "driver",
    active: true,
    units: ["T-101"],
  });
  await b.call(u.owner, "save_member", {
    workspace: ws,
    email: `devon.${tag}@example.test`,
    role: "driver",
    active: true,
    units: ["B-201"],
  });
  return { ws, tag, u };
}

export function checks(
  unit: { type: string; tankConfig?: string },
  defects: Record<string, { level: number; note: string }> = {},
): Check[] {
  return checklistFor(unit).map((item) =>
    defects[item]
      ? { item, result: "Defect" as const, ...defects[item] }
      : { item, result: "Pass" as const },
  );
}

export function report(asset: string, c: Check[], extra: Record<string, unknown> = {}) {
  return {
    id: newInspectionId(),
    asset,
    phase: "Pre-trip",
    odometer: 120450,
    inspectedAt: new Date(Date.now() - 60_000).toISOString(),
    driver: "Dana Driver",
    signature: "Dana Driver",
    consent: true,
    checks: c,
    ...extra,
  };
}

const TANKER = { type: "Tanker", tankConfig: "3 compartments" };
const BOX = { type: "Box truck", tankConfig: "Not applicable" };
const sig = { signature: "Max Mechanic", consent: true };

export function fleetScenarios(name: string, make: () => SeedableBackend): void {
  describe(`fleet backend scenarios — ${name}`, () => {
    it("a driver sees only the vehicle assigned to them, with a reduced record", async () => {
      const b = make();
      const { ws, u } = await fixture(b);
      const s = await b.call<Snapshot>(u.dana, "snapshot", { workspace: ws });
      expect(s.state.payload?.assets.map((a) => a.id)).toEqual(["T-101"]);
      expect(Object.keys(s.state.payload!.assets[0]!).sort()).toEqual([
        "id",
        "name",
        "status",
        "tankConfig",
        "type",
      ]);
      expect(s.state.payload?.drivers).toEqual([]);
      const m = await b.call<Snapshot>(u.manager, "snapshot", { workspace: ws });
      expect(m.state.payload?.assets.map((a) => a.id)).toEqual(["B-201", "T-101"]);
      expect(m.state.payload?.drivers).toHaveLength(1);
    });

    it("Workflow A: driver inspects the assigned tanker, records a defect, submits; the unit goes out of service", async () => {
      const b = make();
      const { ws, u } = await fixture(b);
      const r = report(
        "T-101",
        checks(TANKER, { Tires: { level: 3, note: "Left steer tire cut to cord" } }),
      );
      expect(
        await b.call(u.dana, "submit_inspection", { workspace: ws, report: r }),
      ).toEqual({ changes: 1 });
      // Re-sending the same signed report is idempotent, not a second record.
      expect(
        await b.call(u.dana, "submit_inspection", { workspace: ws, report: r }),
      ).toEqual({ changes: 0, duplicate: true });
      const s = await b.call<Snapshot>(u.dana, "snapshot", { workspace: ws });
      expect(s.inspections).toHaveLength(1);
      expect(s.state.payload?.assets[0]?.status).toBe("Out of service");
      expect(s.inspections[0]?.payload.companyPolicy).toEqual({ daily: true, days: 7 });
    });

    it("the tanker checklist is enforced by the backend, not just the form", async () => {
      const b = make();
      const { ws, u } = await fixture(b);
      const partial = checks(BOX); // box-truck list on a tanker
      await expect(
        b.call(u.dana, "submit_inspection", {
          workspace: ws,
          report: report("T-101", partial),
        }),
      ).rejects.toThrow(`Required checklist item missing: ${TANKER_CHECKLIST[0]}`);
      expect(checklistFor(BOX)).toHaveLength(BASE_CHECKLIST.length);
    });

    it("a driver cannot inspect a vehicle that is not assigned to them", async () => {
      const b = make();
      const { ws, u } = await fixture(b);
      await expect(
        b.call(u.dana, "submit_inspection", {
          workspace: ws,
          report: report("B-201", checks(BOX)),
        }),
      ).rejects.toThrow("Unit not assigned or invalid report");
    });

    it("a defect without a severity and a description is refused", async () => {
      const b = make();
      const { ws, u } = await fixture(b);
      const c = checks(TANKER).map((x) =>
        x.item === "Horn"
          ? { item: "Horn", result: "Defect" as const, level: 2, note: "  " }
          : x,
      );
      await expect(
        b.call(u.dana, "submit_inspection", {
          workspace: ws,
          report: report("T-101", c),
        }),
      ).rejects.toThrow("Defect needs severity and description");
    });

    it("an unsigned inspection is refused", async () => {
      const b = make();
      const { ws, u } = await fixture(b);
      await expect(
        b.call(u.dana, "submit_inspection", {
          workspace: ws,
          report: report("T-101", checks(TANKER), { consent: false }),
        }),
      ).rejects.toThrow("Invalid signed inspection");
    });

    it("Workflow B: maintenance reviews, assesses, certifies the repair; the vehicle returns to service; the driver must acknowledge before the next trip", async () => {
      const b = make();
      const { ws, u } = await fixture(b);
      const r = report(
        "T-101",
        checks(TANKER, { Tires: { level: 3, note: "Left steer tire cut to cord" } }),
      );
      await b.call(u.dana, "submit_inspection", { workspace: ws, report: r });

      await b.call(u.maint, "submit_action", {
        workspace: ws,
        action: {
          inspection: r.id,
          kind: "acknowledge",
          note: "Seen; truck parked",
          ...sig,
        },
      });
      await b.call(u.maint, "submit_action", {
        workspace: ws,
        action: {
          inspection: r.id,
          kind: "assess",
          level: 3,
          note: "Confirmed: replace tire",
          ...sig,
        },
      });
      await expect(
        b.call(u.maint, "submit_action", {
          workspace: ws,
          action: {
            inspection: r.id,
            kind: "certify",
            resolution: "Repair unnecessary",
            note: "n/a",
            ...sig,
          },
        }),
      ).rejects.toThrow("Safety holds require repair or signed reassessment");
      await b.call(u.maint, "submit_action", {
        workspace: ws,
        action: {
          inspection: r.id,
          kind: "certify",
          resolution: "Repaired",
          note: "New tire mounted, torqued",
          ...sig,
        },
      });
      await expect(
        b.call(u.maint, "submit_action", {
          workspace: ws,
          action: { inspection: r.id, kind: "assess", level: 1, note: "again", ...sig },
        }),
      ).rejects.toThrow("Already certified; submit a new defect");

      const m = await b.call<Snapshot>(u.manager, "snapshot", { workspace: ws });
      expect(unitStatuses(m).find((x) => x.id === "T-101")?.status).toBe("Available");
      expect(fleetSummary(m).outstandingDefects).toBe(0);

      const next = report("T-101", checks(TANKER));
      await expect(
        b.call(u.dana, "submit_inspection", { workspace: ws, report: next }),
      ).rejects.toThrow("Prior repair certification acknowledgment required");
      expect(
        await b.call(u.dana, "submit_inspection", {
          workspace: ws,
          report: next,
          reviews: [{ inspection: r.id }],
        }),
      ).toEqual({ changes: 1 });
      const after = await b.call<Snapshot>(u.dana, "snapshot", { workspace: ws });
      expect(after.inspection_actions.map((a) => a.payload.kind)).toEqual([
        "acknowledge",
        "assess",
        "certify",
        "review",
      ]);
    });

    it("a driver cannot certify a repair", async () => {
      const b = make();
      const { ws, u } = await fixture(b);
      const r = report(
        "T-101",
        checks(TANKER, { Horn: { level: 1, note: "Weak horn" } }),
      );
      await b.call(u.dana, "submit_inspection", { workspace: ws, report: r });
      await expect(
        b.call(u.dana, "submit_action", {
          workspace: ws,
          action: {
            inspection: r.id,
            kind: "certify",
            resolution: "Repaired",
            note: "fixed it",
            ...sig,
          },
        }),
      ).rejects.toThrow("Maintenance permission required");
    });

    it("FINDING F-3: production does not refresh a manager's stored unit status — live status must be computed from records", async () => {
      const b = make();
      const { ws, u } = await fixture(b);
      await b.call(u.dana, "submit_inspection", {
        workspace: ws,
        report: report(
          "T-101",
          checks(TANKER, {
            "Service brakes / connections": { level: 4, note: "Air leak at gladhand" },
          }),
        ),
      });
      const m = await b.call<Snapshot>(u.manager, "snapshot", { workspace: ws });
      const stored = m.state.payload?.assets.find((a) => a.id === "T-101")?.status;
      expect(stored).toBe("Available"); // what production returns to a manager
      expect(unitStatuses(m).find((x) => x.id === "T-101")?.status).toBe(
        "Out of service",
      ); // what the TMS shows
    });

    it("saving the fleet uses an optimistic revision; drivers cannot save", async () => {
      const b = make();
      const { ws, u } = await fixture(b);
      const stale = {
        workspace: ws,
        revision: 0,
        fleet: { assets: [], work: [], fuel: [] },
      };
      expect(await b.call(u.manager, "save_fleet", stale)).toEqual({ changes: 0 });
      await expect(
        b.call(u.dana, "save_fleet", { ...stale, revision: 1 }),
      ).rejects.toThrow("Owner or manager required");
    });

    it("a suspended company is closed to everyone, including its owner", async () => {
      const b = make();
      const ws = uuid();
      const owner = uuid();
      b.addWorkspace(ws, "Suspended Co", { operable: false });
      b.addUser(owner, `owner.${ws.slice(0, 8)}@example.test`);
      b.addMember(ws, owner, "owner");
      await expect(b.call(owner, "snapshot", { workspace: ws })).rejects.toThrow(
        "No active membership in this company",
      );
      expect(await b.call(owner, "workspaces")).toEqual([]);
    });

    it("maintenance records a service against the unit; a driver cannot", async () => {
      const b = make();
      const { ws, u } = await fixture(b);
      const rec = {
        id: newServiceId(),
        asset: "T-101",
        category: "Tires",
        title: "Replace left steer tire",
        date: "2026-11-03",
        costCents: "41250",
      };
      expect(
        await b.call(u.maint, "submit_service", { workspace: ws, record: rec }),
      ).toEqual({ changes: 1 });
      await expect(
        b.call(u.dana, "submit_service", {
          workspace: ws,
          record: { ...rec, id: newServiceId() },
        }),
      ).rejects.toThrow("Maintenance permission required");
      const s = await b.call<Snapshot>(u.manager, "snapshot", { workspace: ws });
      expect(s.unit_records.map((x) => x.payload.title)).toEqual([
        "Replace left steer tire",
      ]);
    });

    it("only the owner manages access", async () => {
      const b = make();
      const { ws, tag, u } = await fixture(b);
      await expect(
        b.call(u.manager, "save_member", {
          workspace: ws,
          email: `dana.${tag}@example.test`,
          role: "manager",
          active: true,
        }),
      ).rejects.toThrow("Only the company owner can manage access");
      await expect(
        b.call(u.owner, "save_member", {
          workspace: ws,
          email: `owner.${tag}@example.test`,
          role: "manager",
          active: true,
        }),
      ).rejects.toThrow("You cannot remove your own owner access");
    });

    it("an inspection photo must already be uploaded, by the same driver, at the expected path", async () => {
      const b = make();
      const { ws, u } = await fixture(b);
      const r = report(
        "T-101",
        checks(TANKER, { Mirrors: { level: 1, note: "Cracked" } }),
      );
      const withPhoto = { ...r, photo: `dvir/${r.id}.jpg` };
      await expect(
        b.call(u.dana, "submit_inspection", { workspace: ws, report: withPhoto }),
      ).rejects.toThrow("Invalid inspection photo");
      b.putObject(
        ws,
        withPhoto.photo,
        u.devon,
        new Uint8Array([0xff, 0xd8]),
        "image/jpeg",
      );
      await expect(
        b.call(u.dana, "submit_inspection", { workspace: ws, report: withPhoto }),
      ).rejects.toThrow("Invalid inspection photo");
      const r2 = { ...report("T-101", checks(TANKER)), photo: "" };
      r2.photo = `dvir/${r2.id}.jpg`;
      b.putObject(ws, r2.photo, u.dana, new Uint8Array([0xff, 0xd8]), "image/jpeg");
      expect(
        await b.call(u.dana, "submit_inspection", { workspace: ws, report: r2 }),
      ).toEqual({ changes: 1 });
    });
  });
}
