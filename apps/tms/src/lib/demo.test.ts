import { describe, expect, it } from "vitest";
import { fleetSummary, navigation, type Snapshot } from "@hl-bos/tms";
import { demo, LAKESHORE, TWOTRUCKS, USERS } from "./demo.ts";

describe("demo seed", () => {
  it("starts with one out-of-service tanker from a seeded level-2 defect (synthetic)", async () => {
    const d = await demo();
    const morgan = USERS.find((u) => u.role === "manager")!;
    const s = await d.backend.call<Snapshot>(morgan.id, "snapshot", {
      workspace: LAKESHORE,
    });
    const sum = fleetSummary(s);
    expect(sum).toMatchObject({
      units: 5,
      outOfService: 1,
      inactive: 1,
      outstandingDefects: 1,
    });
  });

  it("licenses the full Release 1 set to Lakeshore and DVIR only to Two Trucks", async () => {
    const d = await demo();
    expect(d.companies.get(LAKESHORE)?.licensed).toEqual([
      "fleet_management",
      "driver_management",
      "dvir",
      "maintenance",
    ]);
    expect(d.companies.get(TWOTRUCKS)?.licensed).toEqual(["dvir"]);
    expect(navigation(["dvir"], "driver").map((x) => x.key)).toEqual([
      "home",
      "driver_dvir",
    ]);
  });

  it("every demo address is on the reserved example.test domain", () => {
    for (const u of USERS) expect(u.email.endsWith(".example.test")).toBe(true);
  });
});
