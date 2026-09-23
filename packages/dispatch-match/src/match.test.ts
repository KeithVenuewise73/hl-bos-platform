import { describe, expect, it } from "vitest";
import {
  DEFAULT_MATCH_CONFIG,
  buildEquipmentRegistry,
  computeScore,
  describeScoreFormula,
  matchFleet,
  type DistanceProvider,
  type Load,
  type MatchConfig,
  type Truck,
} from "./index";
import { DEMO_LOADS, DEMO_TENANT_ID, DEMO_TRUCKS } from "./demo";

// A synthetic distance table so economics can be checked by hand.
// Places are named; distances are looked up symmetrically.
const table: Record<string, number> = {
  "A|B": 100, // current -> origin (deadhead)
  "B|C": 300, // origin -> destination (loaded)
  "C|H": 20, // destination -> home
  "A|H": 250, // current -> home (empty return)
  "B|H": 280,
};
const dist: DistanceProvider = {
  roadMiles: (a, b) => {
    if (a.name === b.name) return 0;
    const k1 = `${a.name}|${b.name}`;
    const k2 = `${b.name}|${a.name}`;
    const v = table[k1] ?? table[k2];
    if (v === undefined) throw new Error(`no distance ${k1}`);
    return v;
  },
};
const place = (name: string) => ({ name, lat: 0, lon: 0 });

const truck = (over: Partial<Truck> = {}): Truck => ({
  id: "T1",
  tenantId: "t1",
  name: "Unit 1",
  equipmentType: "dump",
  capacity: { weightLbs: 48_000, volumeCuYd: 40 },
  home: place("H"),
  currentLocation: place("A"),
  availability: {
    earliest: "2026-09-29T06:00:00-04:00",
    latest: "2026-09-30T20:00:00-04:00",
  },
  maxDeadheadMiles: 150,
  serviceRadiusMiles: 150,
  driverCost: { basis: "per-mile", amount: 0.6 },
  ...over,
});

const load = (over: Partial<Load> = {}): Load => ({
  id: "L1",
  tenantId: "t1",
  origin: place("B"),
  destination: place("C"),
  commodity: { name: "Stone", class: "aggregate" },
  weightLbs: 40_000,
  volumeCuYd: 30,
  pay: { basis: "flat", amount: 1600 },
  pickup: {
    earliest: "2026-09-29T06:00:00-04:00",
    latest: "2026-09-29T18:00:00-04:00",
  },
  delivery: {
    earliest: "2026-09-29T06:00:00-04:00",
    latest: "2026-09-30T18:00:00-04:00",
  },
  equipmentTypes: ["dump"],
  source: { kind: "manual" },
  ...over,
});

const cfg: MatchConfig = {
  ...DEFAULT_MATCH_CONFIG,
  fuelCostPerMile: 0.7,
  overheadPerMile: 0.4,
};
const run = (trucks: Truck[], loads: Load[], config: MatchConfig = cfg) =>
  matchFleet({ tenantId: "t1", trucks, loads, config, distance: dist });

describe("economics", () => {
  it("computes every metric in the brief from first principles", () => {
    const r = run([truck()], [load()]);
    const m = r.trucks[0]?.matches[0];
    expect(m).toBeDefined();
    const e = m!.economics;
    expect(e.loadedMiles).toBe(300);
    expect(e.deadheadMiles).toBe(100);
    expect(e.totalMiles).toBe(400);
    expect(e.fuelCost).toBe(280); // 400 × 0.70
    expect(e.overheadCost).toBe(160); // 400 × 0.40
    expect(e.driverCost).toBe(240); // 400 × 0.60
    expect(e.totalOperatingCost).toBe(680);
    expect(e.revenuePerLoadedMile).toBe(5.33); // 1600 / 300
    expect(e.revenuePerTotalMile).toBe(4); // 1600 / 400
    expect(e.projectedContribution).toBe(920); // 1600 − 680
  });

  it("values the backhaul against driving home empty", () => {
    const e = run([truck()], [load()]).trucks[0]!.matches[0]!.economics;
    // Empty home: 250 mi × (0.7 + 0.4 + 0.6) = 425.
    // With load: 100 + 300 + 20 = 420 mi × 1.7 = 714. Extra = 289.
    expect(e.vsEmptyReturn.emptyReturnMiles).toBe(250);
    expect(e.vsEmptyReturn.extraMiles).toBe(170);
    expect(e.vsEmptyReturn.extraCost).toBe(289);
    expect(e.vsEmptyReturn.incrementalContribution).toBe(1311);
  });

  it("pays per-mile loads on loaded miles and says the estimate governs nothing", () => {
    const m = run([truck()], [load({ pay: { basis: "per-mile", rate: 3 } })]).trucks[0]!
      .matches[0]!;
    expect(m.economics.revenue).toBe(900);
    expect(m.warnings.join(" ")).toMatch(/broker's mileage governs/);
  });

  it("charges per-day drivers by on-duty time", () => {
    const m = run([truck({ driverCost: { basis: "per-day", amount: 300 } })], [load()])
      .trucks[0]!.matches[0]!;
    // 400 mi at 50 mph = 8 h driving + 2 × 1.5 h dwell = 11 h on duty = 1.1 days.
    expect(m.timing.onDutyHours).toBe(11);
    expect(m.economics.driverDays).toBe(1.1);
    expect(m.economics.driverCost).toBe(330);
  });

  it("switching the contribution basis changes the score input, not the economics", () => {
    const a = run([truck()], [load()]).trucks[0]!.matches[0]!;
    const b = run([truck()], [load()], { ...cfg, contributionBasis: "vs-empty-return" })
      .trucks[0]!.matches[0]!;
    expect(a.economics).toEqual(b.economics);
    expect(a.score.contributionUsed).toBe(920);
    expect(b.score.contributionUsed).toBe(1311);
  });
});

describe("hard constraints", () => {
  const codeFor = (t: Truck, l: Load) => run([t], [l]).trucks[0]!.rejections[0]?.code;

  it("rejects equipment the shipper did not ask for", () => {
    expect(codeFor(truck(), load({ equipmentTypes: ["flatbed"] }))).toBe(
      "equipment-not-accepted",
    );
  });
  it("rejects a commodity the equipment type cannot haul (dump vs palletized)", () => {
    const l = load({ commodity: { name: "Pallets", class: "palletized-general" } });
    expect(codeFor(truck(), l)).toBe("commodity-not-allowed");
  });
  it("rejects a flatbed for liquids", () => {
    const l = load({
      commodity: { name: "Brine", class: "liquid-bulk" },
      equipmentTypes: ["flatbed"],
    });
    expect(
      codeFor(truck({ equipmentType: "flatbed", capacity: { weightLbs: 48_000 } }), l),
    ).toBe("commodity-not-allowed");
  });
  it("honours a per-truck exclusion and explains it", () => {
    const t = truck({
      commodityRestrictions: { exclude: ["aggregate"], reason: "liner" },
    });
    const rej = run([t], [load()]).trucks[0]!.rejections[0]!;
    expect(rej.code).toBe("commodity-not-allowed");
    expect(rej.reason).toMatch(/liner/);
  });
  it("honours a per-truck inclusion beyond the type default", () => {
    const l = load({ commodity: { name: "Logs", class: "logs" } });
    expect(codeFor(truck(), l)).toBe("commodity-not-allowed");
    expect(
      run([truck({ commodityRestrictions: { include: ["logs"] } })], [l]).trucks[0]!
        .matches,
    ).toHaveLength(1);
  });
  it("rejects overweight and over-volume", () => {
    expect(codeFor(truck(), load({ weightLbs: 48_001 }))).toBe("overweight");
    expect(codeFor(truck(), load({ volumeCuYd: 41 }))).toBe("over-volume");
  });
  it("warns rather than guesses when volume is missing", () => {
    const { volumeCuYd: _v, ...noVol } = load();
    const m = run([truck()], [noVol]).trucks[0]!.matches[0]!;
    expect(m.warnings.join(" ")).toMatch(/no volume/);
  });
  it("rejects too much deadhead and deliveries outside the service radius", () => {
    expect(codeFor(truck({ maxDeadheadMiles: 99 }), load())).toBe("deadhead-too-far");
    expect(codeFor(truck({ serviceRadiusMiles: 19 }), load())).toBe(
      "outside-service-radius",
    );
  });
  it("rejects a pickup window the truck cannot reach", () => {
    // 100 mi deadhead at 50 mph = arrives 08:00.
    const l = load({
      pickup: {
        earliest: "2026-09-29T06:00:00-04:00",
        latest: "2026-09-29T07:59:00-04:00",
      },
    });
    const rej = run([truck()], [l]).trucks[0]!.rejections[0]!;
    expect(rej.code).toBe("misses-pickup-window");
    expect(rej.reason).toContain("Tue 29 Sep 08:00");
    const ok = load({
      pickup: {
        earliest: "2026-09-29T06:00:00-04:00",
        latest: "2026-09-29T08:00:00-04:00",
      },
    });
    expect(run([truck()], [ok]).trucks[0]!.matches).toHaveLength(1);
  });
  it("rejects a delivery window the truck cannot make", () => {
    // Pickup 08:00, dwell to 09:30, 6 h loaded -> 15:30.
    const l = load({
      delivery: {
        earliest: "2026-09-29T06:00:00-04:00",
        latest: "2026-09-29T15:00:00-04:00",
      },
    });
    expect(codeFor(truck(), l)).toBe("misses-delivery-window");
  });
  it("rejects a trip that runs past the truck's availability", () => {
    const t = truck({
      availability: {
        earliest: "2026-09-29T06:00:00-04:00",
        latest: "2026-09-29T16:00:00-04:00",
      },
    });
    // Finishes 15:30 + 1.5 h unload = 17:00.
    expect(codeFor(t, load())).toBe("exceeds-availability");
  });
  it("inserts a mandatory rest after 11 hours of driving", () => {
    table["B|C"] = 650; // 13 h loaded
    try {
      const m = run([truck({ serviceRadiusMiles: 999 })], [load()]).trucks[0]!
        .matches[0]!;
      // 06:00 + 2 h deadhead + 1.5 h load = 09:30. 9 h drive -> 18:30 (11 h in shift),
      // 10 h rest -> 04:30, 4 h -> 08:30 on the 30th.
      expect(m.timing.arriveAtDelivery).toBe("2026-09-30T12:30:00.000Z");
    } finally {
      table["B|C"] = 300;
    }
  });
  it("reports an unregistered equipment type instead of crashing", () => {
    const t = truck({ equipmentType: "hover-trailer" });
    expect(codeFor(t, load({ equipmentTypes: ["hover-trailer"] }))).toBe(
      "equipment-not-registered",
    );
  });
  it("accepts a new equipment type once a tenant registers it — no code change", () => {
    const equipment = buildEquipmentRegistry([
      {
        id: "walking-floor",
        label: "Walking floor",
        allowedCommodityClasses: ["mulch"],
        measuresVolume: true,
      },
    ]);
    const t = truck({
      equipmentType: "walking-floor",
      capacity: { weightLbs: 45_000, volumeCuYd: 120 },
    });
    const l = load({
      commodity: { name: "Chips", class: "mulch" },
      volumeCuYd: 110,
      equipmentTypes: ["walking-floor"],
    });
    const r = matchFleet({
      tenantId: "t1",
      trucks: [t],
      loads: [l],
      config: cfg,
      distance: dist,
      equipment,
    });
    expect(r.trucks[0]!.matches).toHaveLength(1);
  });
});

describe("tenancy and dedicated lanes", () => {
  it("never pairs across tenants — the other fleet's load does not even appear as a rejection", () => {
    const r = run([truck()], [load(), load({ id: "OTHER", tenantId: "t2" })]);
    const t = r.trucks[0]!;
    expect(t.matches.map((m) => m.loadId)).toEqual(["L1"]);
    expect(t.rejections).toHaveLength(0);
    expect(r.unmatchedLoads).toHaveLength(0);
  });
  it("ignores another tenant's trucks", () => {
    const r = run([truck({ tenantId: "t2" })], [load()]);
    expect(r.trucks).toHaveLength(0);
  });
  it("withholds dedicated-lane trucks from ranking and says why", () => {
    const t = truck({ equipmentType: "pneumatic-tanker", dedicatedLaneOnly: true });
    const l = load({
      commodity: { name: "Cement", class: "dry-bulk-powder" },
      equipmentTypes: ["pneumatic-tanker"],
    });
    const r = run([t], [l]);
    expect(r.trucks).toHaveLength(0);
    expect(r.dedicated[0]?.note).toMatch(/dedicated/i);
    expect(r.unmatchedLoads[0]?.summary).toMatch(/dedicated-lane/);
  });
});

describe("ranking and score", () => {
  it("ranks best score first and numbers ranks 1..n", () => {
    const loads = [
      load({ id: "cheap", pay: { basis: "flat", amount: 700 } }),
      load({ id: "rich", pay: { basis: "flat", amount: 2000 } }),
      load({ id: "mid", pay: { basis: "flat", amount: 1200 } }),
    ];
    const ms = run([truck()], loads).trucks[0]!.matches;
    expect(ms.map((m) => m.loadId)).toEqual(["rich", "mid", "cheap"]);
    expect(ms.map((m) => m.rank)).toEqual([1, 2, 3]);
  });
  it("follows the published formula exactly", () => {
    const s = computeScore(500, 2.25, DEFAULT_MATCH_CONFIG.score);
    // C = 500/1000 = 0.5; R = (2.25 − 1)/(3.5 − 1) = 0.5 → 100 × (0.6×0.5 + 0.4×0.5) = 50
    expect(s.score).toBe(50);
    expect(computeScore(-50, 0.5, DEFAULT_MATCH_CONFIG.score).score).toBe(0);
    expect(computeScore(5000, 9, DEFAULT_MATCH_CONFIG.score).score).toBe(100);
    expect(describeScoreFormula(DEFAULT_MATCH_CONFIG.score)).toContain(
      "0.60 × C + 0.40 × R",
    );
  });
  it("is adjustable: all weight on revenue per mile ignores contribution", () => {
    const sc = {
      ...DEFAULT_MATCH_CONFIG.score,
      contributionWeight: 0,
      revenuePerMileWeight: 1,
    };
    expect(computeScore(10_000, 2.25, sc).score).toBe(50);
  });
  it("flags a load that ranks for two trucks", () => {
    const r = run([truck(), truck({ id: "T2", name: "Unit 2" })], [load()]);
    expect(r.trucks[0]!.matches[0]!.warnings.join(" ")).toMatch(
      /Also a match for Unit 2/,
    );
  });
});

describe("return-load probability", () => {
  it("is omitted — with a reason, and no number — when there is no lane history", () => {
    const p = run([truck()], [load()]).trucks[0]!.matches[0]!.returnLoadProbability;
    expect(p.available).toBe(false);
    expect(p).not.toHaveProperty("probability");
  });
  it("is omitted when history is thinner than the minimum", () => {
    const history = [0, 1, 2].map((i) => ({
      tenantId: "t1",
      originRegion: "B",
      destinationRegion: "C",
      equipmentType: "dump",
      weekOf: `2026-08-0${i + 1}`,
      loadsSeen: 2,
    }));
    const r = matchFleet({
      tenantId: "t1",
      trucks: [truck()],
      loads: [load()],
      config: cfg,
      distance: dist,
      laneHistory: history,
    });
    const p = r.trucks[0]!.matches[0]!.returnLoadProbability;
    expect(p.available).toBe(false);
    if (!p.available) expect(p.reason).toMatch(/Only 3 week/);
  });
  it("is computed from real history when there is enough, and ignores other tenants' history", () => {
    const weeks = Array.from({ length: 10 }, (_, i) => ({
      tenantId: "t1",
      originRegion: "B",
      destinationRegion: "C",
      equipmentType: "dump",
      weekOf: `2026-06-${String(i + 1).padStart(2, "0")}`,
      loadsSeen: i < 7 ? 1 : 0,
    }));
    const foreign = {
      ...weeks[0]!,
      tenantId: "t2",
      weekOf: "2026-01-01",
      loadsSeen: 50,
    };
    const r = matchFleet({
      tenantId: "t1",
      trucks: [truck()],
      loads: [load()],
      config: cfg,
      distance: dist,
      laneHistory: [...weeks, foreign],
    });
    const p = r.trucks[0]!.matches[0]!.returnLoadProbability;
    expect(p).toEqual({
      available: true,
      probability: 0.7,
      weeksObserved: 10,
      weeksWithLoads: 7,
    });
  });
});

describe("demo fleet", () => {
  const r = matchFleet({
    tenantId: DEMO_TENANT_ID,
    trucks: DEMO_TRUCKS,
    loads: DEMO_LOADS,
  });

  it("is labelled demo on every load", () => {
    expect(DEMO_LOADS.every((l) => l.source.kind === "demo")).toBe(true);
    expect(DEMO_LOADS.length).toBeGreaterThanOrEqual(8);
    expect(DEMO_TRUCKS.length).toBeGreaterThanOrEqual(3);
  });
  it("sets the tanker aside and leaves the cement load unmatched for that reason", () => {
    expect(r.dedicated.map((d) => d.truckId)).toEqual(["P-301"]);
    expect(r.trucks.map((t) => t.truck.id)).not.toContain("P-301");
    expect(r.unmatchedLoads.find((u) => u.loadId === "L-111")?.summary).toMatch(
      /dedicated-lane/,
    );
  });
  it("exercises each kind of hard filter", () => {
    const codes = new Set(r.trucks.flatMap((t) => t.rejections.map((x) => x.code)));
    for (const c of [
      "equipment-not-accepted",
      "commodity-not-allowed",
      "overweight",
      "over-volume",
      "deadhead-too-far",
      "outside-service-radius",
      "misses-pickup-window",
    ]) {
      expect(codes, c).toContain(c);
    }
  });
  it("shows no return-load probability anywhere, because the demo has no lane history", () => {
    const all = r.trucks.flatMap((t) => t.matches);
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((m) => !m.returnLoadProbability.available)).toBe(true);
  });
});
