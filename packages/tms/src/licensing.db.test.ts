/**
 * The TransportationOS licence gate (proposed P002) against the recovered
 * production fleet SQL in an isolated PostgreSQL.
 *
 *   bash scripts/local-test/tms-fleet-db.sh && TMS_PG_DB=tms_fleet pnpm --filter @hl-bos/tms test
 */
import { describe, expect, it } from "vitest";
import type { Snapshot } from "./backend.ts";
import { PgFleetBackend, type PgTarget } from "./testing/pg-backend.ts";
import { checks, fixture, report } from "./testing/scenarios.ts";

const env = process.env;
const target: PgTarget | null = env["TMS_PG_DB"]
  ? {
      host: env["PGHOST"] ?? "/tmp/tmspg",
      port: env["PGPORT"] ?? "5434",
      user: env["PGUSER"] ?? "postgres",
      database: env["TMS_PG_DB"],
    }
  : null;
const run = target ? describe : describe.skip;
const TANKER = { type: "Tanker", tankConfig: "3 compartments" };

run("TransportationOS licence gate on the production fleet API", () => {
  const b = () => new PgFleetBackend(target!);

  /** A DVIR-only company: same fixture, then licences cut down to Digital DVIR. */
  async function dvirOnly() {
    const be = b();
    const fx = await fixture(be);
    be.setModules(fx.ws, ["tms_dvir"]);
    return { be, ...fx };
  }

  describe("T-4 — a DVIR-only company", () => {
    it("can inspect, using the shared vehicle and driver registry", async () => {
      const { be, ws, u } = await dvirOnly();
      expect(
        await be.call(u.dana, "submit_inspection", {
          workspace: ws,
          report: report("T-101", checks(TANKER)),
        }),
      ).toEqual({ changes: 1 });
      const s = await be.call<Snapshot>(u.manager, "snapshot", { workspace: ws });
      expect(s.state.payload?.assets.map((x) => x.id)).toEqual(["B-201", "T-101"]);
    });

    it("can add a vehicle to the registry", async () => {
      const { be, ws, u } = await dvirOnly();
      const s = await be.call<Snapshot>(u.manager, "snapshot", { workspace: ws });
      const fleet = {
        ...s.state.payload!,
        assets: [
          ...s.state.payload!.assets,
          {
            id: "T-109",
            name: "Tanker 109",
            type: "Tanker",
            tankConfig: "1",
            status: "Available",
          },
        ],
      };
      expect(
        await be.call(u.manager, "save_fleet", {
          workspace: ws,
          revision: s.state.revision,
          fleet,
        }),
      ).toEqual({ changes: 1 });
    });

    it("cannot record maintenance, create work orders, or change driver profiles — in the database, not just the app", async () => {
      const { be, ws, u } = await dvirOnly();
      await expect(
        be.call(u.maint, "submit_service", {
          workspace: ws,
          record: {
            id: "SRV-abcdef12",
            asset: "T-101",
            category: "Tires",
            title: "x",
            date: "2026-11-01",
            costCents: "1",
          },
        }),
      ).rejects.toThrow("Maintenance Management is not licensed for this company");
      const s = await be.call<Snapshot>(u.manager, "snapshot", { workspace: ws });
      await expect(
        be.call(u.manager, "save_fleet", {
          workspace: ws,
          revision: s.state.revision,
          fleet: {
            ...s.state.payload!,
            work: [{ id: "WO-1", asset: "T-101", status: "Open" }],
          },
        }),
      ).rejects.toThrow("work orders cannot be changed");
      await expect(
        be.call(u.manager, "save_fleet", {
          workspace: ws,
          revision: s.state.revision,
          fleet: { ...s.state.payload!, drivers: [] },
        }),
      ).rejects.toThrow("Driver Management is not licensed for this company");
    });

    it("dispatch, routes and profitability are not licensed and not built — there is no operation to call", async () => {
      const { be, ws, u } = await dvirOnly();
      expect(
        be.sql(`select string_agg(key || '=' || entitlements.module_licensed('${ws}', key)::text || '/' || built::text, ',' order by number)
                     from entitlements.modules where key in ('tms_dispatch','tms_routes','tms_profitability')`),
      ).toBe(
        "tms_dispatch=false/false,tms_routes=false/false,tms_profitability=false/false",
      );
      await expect(
        be.call(u.manager, "dispatch" as never, { workspace: ws }),
      ).rejects.toThrow("Unsupported operation");
    });
  });

  it("driver medical cards require Driver Management", async () => {
    const { be, ws, u } = await dvirOnly();
    await expect(
      be.callRpc(u.owner, "hlg_fleet_medical_rpc", "list", { workspace: ws }),
    ).rejects.toThrow("Driver Management is not licensed for this company");
    be.setModules(ws, ["tms_dvir", "tms_drivers"]);
    expect(
      await be.callRpc(u.owner, "hlg_fleet_medical_rpc", "list", {
        workspace: ws,
        driver: "dana",
      }),
    ).toEqual([]);
  });

  it("a company with no TransportationOS module can do nothing", async () => {
    const be = b();
    const { ws, u } = await fixture(be);
    be.setModules(ws, []);
    await expect(be.call(u.manager, "snapshot", { workspace: ws })).rejects.toThrow(
      "This company has no TransportationOS module",
    );
  });

  it("losing a licence closes the door but keeps the history", async () => {
    const be = b();
    const { ws, u } = await fixture(be);
    await be.call(u.dana, "submit_inspection", {
      workspace: ws,
      report: report(
        "T-101",
        checks(TANKER, { Tires: { level: 2, note: "Low tread" } }),
      ),
    });
    be.setModules(ws, ["tms_fleet"]); // DVIR dropped
    await expect(
      be.call(u.dana, "submit_inspection", {
        workspace: ws,
        report: report("T-101", checks(TANKER)),
      }),
    ).rejects.toThrow("Digital DVIR is not licensed for this company");
    const s = await be.call<Snapshot>(u.manager, "snapshot", { workspace: ws });
    expect(s.inspections).toHaveLength(1);
    be.setModules(ws, ["tms_fleet", "tms_dvir"]); // resubscribed
    expect(
      await be.call(u.dana, "submit_inspection", {
        workspace: ws,
        report: report("T-101", checks(TANKER)),
        reviews: [],
      }),
    ).toEqual({ changes: 1 });
  });

  it("the gate cannot be bypassed by calling fleet.api directly", async () => {
    const be = b();
    const { ws, u } = await fixture(be);
    await expect(
      be.callFunction(u.manager, "fleet.api", "snapshot", { workspace: ws }),
    ).rejects.toThrow(/permission denied for function api/);
    await expect(
      be.callFunction(u.owner, "fleet.medical_api", "list", { workspace: ws }),
    ).rejects.toThrow(/permission denied for function medical_api/);
  });

  it("cross-company: a member of one company cannot read or write another's, and learns nothing about its licences", async () => {
    const be = b();
    const one = await fixture(be);
    const two = await fixture(be);
    be.setModules(two.ws, []);
    for (const op of ["snapshot", "team", "templates"] as const) {
      await expect(be.call(one.u.manager, op, { workspace: two.ws })).rejects.toThrow(
        "No active membership in this company",
      );
    }
    await expect(
      be.call(one.u.dana, "submit_inspection", {
        workspace: two.ws,
        report: report("T-101", checks(TANKER)),
      }),
    ).rejects.toThrow("No active membership in this company");
    await expect(
      be.call(one.u.manager, "snapshot", { workspace: "not-a-uuid" }),
    ).rejects.toThrow("No active membership in this company");
  });

  describe("configurable inspection templates (T3)", () => {
    const reefer = {
      id: "R-301",
      name: "Reefer 301",
      type: "Reefer",
      tankConfig: "Not applicable",
      status: "Available",
    };
    async function withReefer() {
      const be = b();
      const fx = await fixture(be);
      const s = await be.call<Snapshot>(fx.u.manager, "snapshot", { workspace: fx.ws });
      await be.call(fx.u.manager, "save_fleet", {
        workspace: fx.ws,
        revision: s.state.revision,
        fleet: { ...s.state.payload!, assets: [...s.state.payload!.assets, reefer] },
      });
      await be.call(fx.u.owner, "save_member", {
        workspace: fx.ws,
        email: `dana.${fx.tag}@example.test`,
        role: "driver",
        active: true,
        units: ["T-101", "R-301"],
      });
      return { be, ...fx };
    }

    it("a manager adds required items for an equipment type; drivers cannot", async () => {
      const { be, ws, u } = await withReefer();
      expect(
        await be.call(u.manager, "save_template", {
          workspace: ws,
          equipmentType: "Reefer",
          items: ["Reefer unit temperature", "Reefer fuel level"],
        }),
      ).toEqual({ saved: true });
      await expect(
        be.call(u.dana, "save_template", {
          workspace: ws,
          equipmentType: "Reefer",
          items: ["x"],
        }),
      ).rejects.toThrow("Owner or manager required");
      await expect(
        be.call(u.manager, "save_template", {
          workspace: ws,
          equipmentType: "Reefer",
          items: Array.from({ length: 15 }, (_, i) => `item ${i}`),
        }),
      ).rejects.toThrow("A template needs 1-14 distinct items");
      expect(await be.call(u.dana, "templates", { workspace: ws })).toEqual([
        {
          equipmentType: "Reefer",
          items: ["Reefer unit temperature", "Reefer fuel level"],
        },
      ]);
    });

    it("an inspection of that equipment must include the template's items", async () => {
      const { be, ws, u } = await withReefer();
      await be.call(u.manager, "save_template", {
        workspace: ws,
        equipmentType: "Reefer",
        items: ["Reefer unit temperature"],
      });
      const base = checks({ type: "Reefer" });
      await expect(
        be.call(u.dana, "submit_inspection", {
          workspace: ws,
          report: report("R-301", base),
        }),
      ).rejects.toThrow("Required checklist item missing: Reefer unit temperature");
      const full = [
        ...base,
        { item: "Reefer unit temperature", result: "Pass" as const },
      ];
      expect(
        await be.call(u.dana, "submit_inspection", {
          workspace: ws,
          report: report("R-301", full),
        }),
      ).toEqual({ changes: 1 });
    });
  });
});
