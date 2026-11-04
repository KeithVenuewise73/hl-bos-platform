import { describe, expect, it } from "vitest";
import {
  canCall,
  canOpen,
  navigation,
  resolveEntitlements,
  SCREENS,
  unlicensedFleetChanges,
} from "./entitlements.ts";
import { CAPABILITIES, MODULES } from "./modules.ts";

describe("module catalog", () => {
  it("has the twelve modules of the Phase 5 brief, numbered 1-12", () => {
    expect(MODULES.map((m) => m.number)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });
  it("every capability a module names exists", () => {
    const caps = new Set(CAPABILITIES.map((c) => c.key));
    for (const m of MODULES)
      for (const c of m.capabilities)
        expect(caps.has(c), `${m.key} -> ${c}`).toBe(true);
  });
  it("no module claims a UI that has no screen", () => {
    const screened = new Set(
      SCREENS.flatMap((s) => (s.modules === "core" ? [] : s.modules)),
    );
    for (const m of MODULES) {
      if (m.ui === "WORKING_PROTOTYPE") expect(screened.has(m.key), m.key).toBe(true);
    }
  });
});

describe("Workflow D — a DVIR-only company", () => {
  const dvirOnly = ["dvir"] as const;

  it("gets the vehicle and driver registries as internal capabilities, without buying Fleet or Driver Management", () => {
    const r = resolveEntitlements(dvirOnly);
    expect(r.active).toEqual(["dvir"]);
    expect(r.capabilities).toEqual(
      expect.arrayContaining([
        "vehicle_registry",
        "driver_registry",
        "unit_assignments",
      ]),
    );
  });

  it("can open DVIR screens and the core vehicle setup", () => {
    expect(canOpen("driver_dvir", dvirOnly, "driver").allowed).toBe(true);
    expect(canOpen("defects", dvirOnly, "owner").allowed).toBe(true);
    expect(canOpen("setup", dvirOnly, "owner").allowed).toBe(true);
    expect(canCall("snapshot", dvirOnly).allowed).toBe(true);
    expect(canCall("save_fleet", dvirOnly).allowed).toBe(true);
    expect(canCall("submit_inspection", dvirOnly).allowed).toBe(true);
  });

  it("cannot open unlicensed management modules", () => {
    for (const s of [
      "fleet",
      "fleet_detail",
      "dashboard",
      "drivers",
      "maintenance",
    ] as const) {
      const d = canOpen(s, dvirOnly, "owner");
      expect(d, s).toMatchObject({ allowed: false, reason: "not_licensed" });
    }
    expect(canCall("submit_service", dvirOnly)).toMatchObject({
      allowed: false,
      reason: "not_licensed",
    });
  });

  it("navigation for its owner shows only what will open", () => {
    expect(navigation(dvirOnly, "owner").map((s) => s.key)).toEqual([
      "home",
      "driver_dvir",
      "defects",
      "setup",
      "modules",
    ]);
  });
});

describe("roles", () => {
  const full = [
    "fleet_management",
    "driver_management",
    "dvir",
    "maintenance",
  ] as const;
  it("a driver gets the inspection screen only", () => {
    expect(navigation(full, "driver").map((s) => s.key)).toEqual([
      "home",
      "driver_dvir",
    ]);
  });
  it("maintenance cannot open company setup or module licensing", () => {
    expect(canOpen("setup", full, "maintenance")).toMatchObject({
      allowed: false,
      reason: "role_not_allowed",
    });
    expect(canOpen("modules", full, "manager")).toMatchObject({
      allowed: false,
      reason: "role_not_allowed",
    });
  });
});

describe("commercial dependencies", () => {
  it("Driver App alone is blocked until DVIR, Dispatch or Routes is licensed", () => {
    expect(resolveEntitlements(["driver_app"]).blocked).toEqual([
      { module: "driver_app", needsOneOf: ["dvir", "dispatch", "routes"] },
    ]);
    expect(resolveEntitlements(["driver_app", "dvir"]).active).toEqual([
      "dvir",
      "driver_app",
    ]);
  });
  it("a company with nothing licensed opens nothing", () => {
    expect(canOpen("home", [], "owner")).toMatchObject({
      allowed: false,
      reason: "no_modules",
    });
  });
  it("Maintenance alone still covers the defect queue", () => {
    expect(canOpen("defects", ["maintenance"], "maintenance").allowed).toBe(true);
    expect(canCall("submit_inspection", ["maintenance"]).allowed).toBe(false);
  });
});

describe("save_fleet cannot smuggle unlicensed module data", () => {
  it("a DVIR-only company may edit vehicles but not create work orders or driver profiles", () => {
    const current = { work: [], fuel: [], drivers: [], driverEvents: [] };
    expect(unlicensedFleetChanges(current, { ...current }, ["dvir"])).toEqual([]);
    expect(
      unlicensedFleetChanges(current, { ...current, work: [{ id: "WO-1" }] }, ["dvir"]),
    ).toEqual(["work"]);
    expect(
      unlicensedFleetChanges(current, { ...current, drivers: [{ id: "x" }] }, ["dvir"]),
    ).toEqual(["drivers"]);
    expect(
      unlicensedFleetChanges(current, { ...current, work: [{ id: "WO-1" }] }, [
        "dvir",
        "maintenance",
      ]),
    ).toEqual([]);
  });
  it("key order does not count as a change", () => {
    const current = { work: [{ id: "WO-1", status: "Open" }] };
    expect(
      unlicensedFleetChanges(current, { work: [{ status: "Open", id: "WO-1" }] }, [
        "dvir",
      ]),
    ).toEqual([]);
  });
});

describe("isFleetError", () => {
  it("recognises a FleetError from another copy of the module by name", async () => {
    const { isFleetError, FleetError } = await import("./backend.ts");
    const foreign = Object.assign(new Error("Safety holds require repair"), {
      name: "FleetError",
    });
    expect(isFleetError(foreign)).toBe(true);
    expect(isFleetError(new FleetError("x"))).toBe(true);
    expect(isFleetError(new Error("x"))).toBe(false);
  });
});

describe("billing stays reachable", () => {
  it("an owner with nothing licensed can still open Modules (to pay or resubscribe), and nothing else", () => {
    expect(canOpen("modules", [], "owner").allowed).toBe(true);
    expect(canOpen("modules", [], "manager")).toMatchObject({ allowed: false });
    expect(canOpen("driver_dvir", [], "owner")).toMatchObject({
      allowed: false,
      reason: "not_licensed",
    });
    expect(canOpen("setup", [], "owner")).toMatchObject({
      allowed: false,
      reason: "no_modules",
    });
    expect(navigation([], "owner").map((x) => x.key)).toEqual(["modules"]);
  });
});
