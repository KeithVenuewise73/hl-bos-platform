import { describe, expect, it } from "vitest";
import { importLoadsCsv, importTrucksCsv, parseCsv, placeListResolver } from "./index";
import { resolvePlace } from "./places";
import { DEMO_PLACE_LIST } from "./demo";

const HEADER =
  "id,origin,destination,commodity,commodity_class,weight_lbs,volume_cu_yd,pay_basis,pay,pickup_earliest,pickup_latest,delivery_earliest,delivery_latest,equipment,origin_lat,origin_lon,destination_lat,destination_lon,notes";

describe("parseCsv", () => {
  it("handles quotes, embedded commas and CRLF", () => {
    expect(parseCsv('a,"b, c","d ""e"""\r\n1,2,3\n')).toEqual([
      ["a", "b, c", 'd "e"'],
      ["1", "2", "3"],
    ]);
  });
});

describe("importLoadsCsv", () => {
  const opts = {
    tenantId: "t1",
    resolvePlace: placeListResolver(DEMO_PLACE_LIST),
    fileName: "loads.csv",
  };

  it("imports a valid row using a known place name", () => {
    const csv = `${HEADER}\nX1,"Erie, PA","Buffalo, NY",Gravel,aggregate,"40,000",25,flat,$900,2026-09-29T08:00:00-04:00,2026-09-29T12:00:00-04:00,2026-09-29T12:00:00-04:00,2026-09-29T18:00:00-04:00,dump|step-deck,,,,,rush`;
    const r = importLoadsCsv(csv, opts);
    expect(r.errors).toEqual([]);
    expect(r.items[0]).toMatchObject({
      id: "X1",
      tenantId: "t1",
      weightLbs: 40000,
      volumeCuYd: 25,
      pay: { basis: "flat", amount: 900 },
      equipmentTypes: ["dump", "step-deck"],
      source: { kind: "csv", row: 2, fileName: "loads.csv" },
      notes: "rush",
    });
    expect(r.items[0]?.origin.lat).toBeCloseTo(42.1292);
  });

  it("uses given coordinates for an unknown place", () => {
    const csv = `${HEADER}\nX2,Nowhere,"Buffalo, NY",Sand,sand,30000,,per-mile,2.5,2026-09-29T08:00:00-04:00,2026-09-29T12:00:00-04:00,2026-09-29T12:00:00-04:00,2026-09-29T18:00:00-04:00,dump,41.0,-79.0,,,`;
    const r = importLoadsCsv(csv, opts);
    expect(r.errors).toEqual([]);
    expect(r.items[0]?.origin).toEqual({ name: "Nowhere", lat: 41, lon: -79 });
    expect(r.items[0]?.pay).toEqual({ basis: "per-mile", rate: 2.5 });
  });

  it("rejects a row with an unknown place and no coordinates rather than guessing", () => {
    const csv = `${HEADER}\nX3,Atlantis,"Buffalo, NY",Sand,sand,30000,,flat,500,2026-09-29T08:00:00-04:00,2026-09-29T12:00:00-04:00,2026-09-29T12:00:00-04:00,2026-09-29T18:00:00-04:00,dump,,,,,`;
    const r = importLoadsCsv(csv, opts);
    expect(r.items).toEqual([]);
    expect(r.errors[0]?.message).toMatch(/Atlantis.*not a known place/);
  });

  it("reports every problem on a bad row and keeps the good rows", () => {
    const good = `G1,"Erie, PA","Buffalo, NY",Sand,sand,30000,,flat,500,2026-09-29T08:00:00-04:00,2026-09-29T12:00:00-04:00,2026-09-29T12:00:00-04:00,2026-09-29T18:00:00-04:00,dump,,,,,`;
    const bad = `B1,"Erie, PA","Buffalo, NY",Sand,sand,heavy,,barter,500,tomorrow,2026-09-29T12:00:00-04:00,2026-09-29T12:00:00-04:00,2026-09-29T18:00:00-04:00,dump,,,,,`;
    const r = importLoadsCsv(`${HEADER}\n${good}\n${bad}\n${good}`, opts);
    expect(r.items.map((l) => l.id)).toEqual(["G1"]);
    expect(r.errors.map((e) => e.row)).toEqual([3, 4]);
    expect(r.errors[0]?.message).toMatch(/weight_lbs/);
    expect(r.errors[0]?.message).toMatch(/pay_basis/);
    expect(r.errors[0]?.message).toMatch(/pickup_earliest/);
    expect(r.errors[1]?.message).toMatch(/duplicate id/);
  });

  it("refuses a file missing required columns", () => {
    const r = importLoadsCsv("id,origin\n1,x", opts);
    expect(r.items).toEqual([]);
    expect(r.errors[0]?.message).toMatch(/Missing column/);
  });
});

describe("national CSV import", () => {
  const nat = { tenantId: "t9", resolvePlace: resolvePlace };

  it("resolves any US city or ZIP through the national resolver", () => {
    const csv = `${HEADER}\nN1,"Fresno, CA",93721,Almonds,palletized-general,40000,,flat,2100,2026-09-29T08:00:00-07:00,2026-09-29T12:00:00-07:00,2026-09-30T08:00:00-07:00,2026-09-30T18:00:00-07:00,dry-van,,,,,`;
    const r = importLoadsCsv(csv, nat);
    expect(r.errors).toEqual([]);
    expect(r.items[0]?.origin.name).toBe("Fresno, CA");
    expect(r.items[0]?.destination.name).toBe("Fresno, CA 93721");
  });

  it("refuses a timestamp with no UTC offset instead of assuming a zone", () => {
    const csv = `${HEADER}\nN2,"Dallas, TX","Tulsa, OK",Pipe,steel,40000,,flat,900,2026-09-29T08:00:00,2026-09-29T12:00:00-05:00,2026-09-30T08:00:00-05:00,2026-09-30T18:00:00-05:00,flatbed,,,,,`;
    const r = importLoadsCsv(csv, nat);
    expect(r.items).toEqual([]);
    expect(r.errors[0]?.message).toMatch(/pickup_earliest .* has no UTC offset/);
  });

  it("imports a fleet's own trucks, anywhere in the country", () => {
    const csv = [
      "id,name,equipment,weight_lbs,volume_cu_yd,home,current_location,available_from,available_until,max_deadhead_mi,service_radius_mi,driver_cost_basis,driver_cost,exclude_commodities,include_commodities,restriction_reason,dedicated_lane_only,dedicated_lane_note",
      'R1,Reefer 1,reefer,44000,,"Atlanta, GA",32202,2026-09-29T06:00:00-04:00,2026-09-30T20:00:00-04:00,250,300,per-mile,0.62,,,,no,',
      'P1,Pneu 1,pneumatic-tanker,52000,,"Denver, CO","Pueblo, CO",2026-09-29T06:00:00-06:00,2026-09-30T20:00:00-06:00,100,150,per-day,300,,,,yes,Contract cement lane',
      'X1,Bad,flatbed,lots,,"Nowhere, ZZ","Denver, CO",2026-09-29T06:00:00,2026-09-30T20:00:00-06:00,100,150,hourly,30,,,,maybe,',
    ].join("\n");
    const r = importTrucksCsv(csv, nat);
    expect(r.items.map((t) => t.id)).toEqual(["R1", "P1"]);
    expect(r.items[0]).toMatchObject({
      equipmentType: "reefer",
      home: { name: "Atlanta, GA" },
      currentLocation: { name: "Jacksonville, FL 32202" },
      driverCost: { basis: "per-mile", amount: 0.62 },
    });
    expect(r.items[1]).toMatchObject({
      dedicatedLaneOnly: true,
      dedicatedLaneNote: "Contract cement lane",
    });
    const msg = r.errors[0]?.message ?? "";
    for (const bit of [
      "weight_lbs",
      "home:",
      "available_from",
      "driver_cost_basis",
      "dedicated_lane_only",
    ]) {
      expect(msg).toContain(bit);
    }
  });
});
