import { describe, expect, it } from "vitest";
import { importLoadsCsv, parseCsv } from "./index";
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
  const opts = { tenantId: "t1", places: DEMO_PLACE_LIST, fileName: "loads.csv" };

  it("imports a valid row using a known place name", () => {
    const csv = `${HEADER}\nX1,"Erie, PA","Buffalo, NY",Gravel,aggregate,"40,000",25,flat,$900,2026-09-29T08:00:00-04:00,2026-09-29T12:00:00-04:00,2026-09-29T12:00:00-04:00,2026-09-29T18:00:00-04:00,dump|step-deck,,,,,rush`;
    const r = importLoadsCsv(csv, opts);
    expect(r.errors).toEqual([]);
    expect(r.loads[0]).toMatchObject({
      id: "X1",
      tenantId: "t1",
      weightLbs: 40000,
      volumeCuYd: 25,
      pay: { basis: "flat", amount: 900 },
      equipmentTypes: ["dump", "step-deck"],
      source: { kind: "csv", row: 2, fileName: "loads.csv" },
      notes: "rush",
    });
    expect(r.loads[0]?.origin.lat).toBeCloseTo(42.1292);
  });

  it("uses given coordinates for an unknown place", () => {
    const csv = `${HEADER}\nX2,Nowhere,"Buffalo, NY",Sand,sand,30000,,per-mile,2.5,2026-09-29T08:00:00-04:00,2026-09-29T12:00:00-04:00,2026-09-29T12:00:00-04:00,2026-09-29T18:00:00-04:00,dump,41.0,-79.0,,,`;
    const r = importLoadsCsv(csv, opts);
    expect(r.errors).toEqual([]);
    expect(r.loads[0]?.origin).toEqual({ name: "Nowhere", lat: 41, lon: -79 });
    expect(r.loads[0]?.pay).toEqual({ basis: "per-mile", rate: 2.5 });
  });

  it("rejects a row with an unknown place and no coordinates rather than guessing", () => {
    const csv = `${HEADER}\nX3,Atlantis,"Buffalo, NY",Sand,sand,30000,,flat,500,2026-09-29T08:00:00-04:00,2026-09-29T12:00:00-04:00,2026-09-29T12:00:00-04:00,2026-09-29T18:00:00-04:00,dump,,,,,`;
    const r = importLoadsCsv(csv, opts);
    expect(r.loads).toEqual([]);
    expect(r.errors[0]?.message).toMatch(/Atlantis.*not a known place/);
  });

  it("reports every problem on a bad row and keeps the good rows", () => {
    const good = `G1,"Erie, PA","Buffalo, NY",Sand,sand,30000,,flat,500,2026-09-29T08:00:00-04:00,2026-09-29T12:00:00-04:00,2026-09-29T12:00:00-04:00,2026-09-29T18:00:00-04:00,dump,,,,,`;
    const bad = `B1,"Erie, PA","Buffalo, NY",Sand,sand,heavy,,barter,500,tomorrow,2026-09-29T12:00:00-04:00,2026-09-29T12:00:00-04:00,2026-09-29T18:00:00-04:00,dump,,,,,`;
    const r = importLoadsCsv(`${HEADER}\n${good}\n${bad}\n${good}`, opts);
    expect(r.loads.map((l) => l.id)).toEqual(["G1"]);
    expect(r.errors.map((e) => e.row)).toEqual([3, 4]);
    expect(r.errors[0]?.message).toMatch(/weight_lbs/);
    expect(r.errors[0]?.message).toMatch(/pay_basis/);
    expect(r.errors[0]?.message).toMatch(/pickup_earliest/);
    expect(r.errors[1]?.message).toMatch(/duplicate id/);
  });

  it("refuses a file missing required columns", () => {
    const r = importLoadsCsv("id,origin\n1,x", opts);
    expect(r.loads).toEqual([]);
    expect(r.errors[0]?.message).toMatch(/Missing column/);
  });
});
