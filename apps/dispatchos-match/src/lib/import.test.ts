import { describe, expect, it } from "vitest";
import { handleImport, handlePlaceLookup, OWN_FLEET_TENANT } from "./import";

const TRUCKS = [
  "id,name,equipment,weight_lbs,volume_cu_yd,home,current_location,available_from,available_until,max_deadhead_mi,service_radius_mi,driver_cost_basis,driver_cost",
  'R1,Reefer 1,reefer,44000,,"Atlanta, GA",32202,2026-09-29T06:00:00-04:00,2026-09-30T20:00:00-04:00,250,350,per-mile,0.62',
].join("\n");

describe("server-side import", () => {
  it("imports a fleet anywhere in the US into the own-fleet tenant", () => {
    const r = handleImport({
      kind: "trucks",
      text: TRUCKS,
      tenantId: OWN_FLEET_TENANT,
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.kind === "trucks") {
      expect(r.trucks[0]?.currentLocation.name).toBe("Jacksonville, FL 32202");
      expect(r.trucks[0]?.tenantId).toBe(OWN_FLEET_TENANT);
    }
  });

  it("refuses an unknown fleet, an unknown kind, and oversized input", () => {
    expect(
      handleImport({ kind: "trucks", text: TRUCKS, tenantId: "someone-else" }),
    ).toEqual({
      ok: false,
      error: "Unknown fleet.",
    });
    expect(
      handleImport({ kind: "drivers", text: TRUCKS, tenantId: OWN_FLEET_TENANT }).ok,
    ).toBe(false);
    expect(
      handleImport({
        kind: "loads",
        text: "x".repeat(1_000_001),
        tenantId: OWN_FLEET_TENANT,
      }).ok,
    ).toBe(false);
    expect(handleImport(null).ok).toBe(false);
  });

  it("looks a place up, or says why not", () => {
    expect(handlePlaceLookup("Boise, ID")).toMatchObject({
      ok: true,
      place: { name: "Boise, ID" },
    });
    expect(handlePlaceLookup("Boise").ok).toBe(false);
    expect(handlePlaceLookup(null).ok).toBe(false);
  });
});
