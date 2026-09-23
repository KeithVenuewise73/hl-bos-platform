// The matcher.
//
//   1. Scope to one tenant. A truck is never paired with another fleet's load.
//   2. Set aside dedicated-lane equipment — it is reported, never ranked.
//   3. Hard-filter every remaining (truck, load) pair. The first failed
//      constraint is recorded as a plain-English rejection, so "why isn't
//      that load on the list?" always has an answer.
//   4. Price what survives, score it, rank best first.

import { DEFAULT_MATCH_CONFIG } from "./config";
import { buildEquipmentRegistry, type EquipmentRegistry } from "./equipment";
import { estimatedRoadDistance, type DistanceProvider } from "./geo";
import { returnLoadProbability } from "./lane-history";
import { computeScore } from "./score";
import type {
  DedicatedTruckNote,
  Economics,
  LaneObservation,
  Load,
  Match,
  MatchConfig,
  MatchRun,
  Place,
  Rejection,
  RejectionCode,
  Timing,
  Truck,
  TruckResult,
} from "./types";

export interface MatchInput {
  tenantId: string;
  trucks: readonly Truck[];
  loads: readonly Load[];
  config?: MatchConfig;
  equipment?: EquipmentRegistry;
  laneHistory?: readonly LaneObservation[];
  distance?: DistanceProvider;
}

const HOUR_MS = 3_600_000;
const round2 = (x: number) => Math.round(x * 100) / 100;
const regionOf = (p: Place) => p.region ?? p.name;
const fmtMi = (n: number) => `${n.toLocaleString("en-US")} mi`;

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Minutes east of UTC written on an ISO time, or null if it carries none (or "Z"). */
export function offsetMinutes(iso: string): number | null {
  const m = /([+-])(\d{2}):?(\d{2})$/.exec(iso);
  if (!m) return null;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

/**
 * Human time in the zone a time was written in (taken from a reference ISO
 * string — the pickup window for a pickup, the truck's availability for the
 * truck), e.g. "Tue 29 Sep 07:27". With `showZone`, the UTC offset is added
 * ("Tue 29 Sep 07:27 UTC−5") — used whenever a trip crosses time zones, so
 * two clock times on one line are never silently in different zones.
 * Rejection reasons are read by dispatchers, not parsed by machines.
 */
export function formatLocalTime(
  ms: number,
  referenceIso: string,
  opts: { showZone?: boolean } = {},
): string {
  const off = offsetMinutes(referenceIso);
  const d = new Date(ms + (off ?? 0) * 60_000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const base = `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${hh}:${mm}`;
  if (off === null) return `${base} UTC`;
  if (!opts.showZone) return base;
  const h = Math.trunc(Math.abs(off) / 60);
  const min = Math.abs(off) % 60;
  return `${base} UTC${off < 0 ? "−" : "+"}${h}${min ? `:${String(min).padStart(2, "0")}` : ""}`;
}

/** True when the truck's times and the load's windows are not all written in one offset. */
export function tripSpansTimeZones(truck: Truck, load: Load): boolean {
  const offsets = new Set(
    [
      truck.availability.earliest,
      truck.availability.latest,
      load.pickup.earliest,
      load.pickup.latest,
      load.delivery.earliest,
      load.delivery.latest,
    ].map(offsetMinutes),
  );
  return offsets.size > 1;
}

function parseTime(s: string, what: string): number {
  const t = Date.parse(s);
  if (Number.isNaN(t))
    throw new Error(`Invalid ${what}: "${s}" is not an ISO-8601 date-time.`);
  return t;
}

/**
 * A driving clock that honours the hours-of-service shape: after
 * `maxDrivingHoursPerShift` of driving, a rest of `restHoursBetweenShifts` is
 * inserted. A wait at least as long as a full rest resets the shift.
 * Simplification (stated in the README): the 14-hour on-duty window and the
 * 30-minute break are not modelled.
 */
class Clock {
  private drivenThisShift = 0;
  onDutyHours = 0;
  constructor(
    public now: number,
    private readonly cfg: MatchConfig,
  ) {}

  drive(hours: number): void {
    let left = hours;
    while (left > 1e-9) {
      const avail = this.cfg.maxDrivingHoursPerShift - this.drivenThisShift;
      if (avail <= 1e-9) {
        this.now += this.cfg.restHoursBetweenShifts * HOUR_MS;
        this.drivenThisShift = 0;
        continue;
      }
      const step = Math.min(left, avail);
      this.now += step * HOUR_MS;
      this.drivenThisShift += step;
      this.onDutyHours += step;
      left -= step;
    }
  }

  work(hours: number): void {
    this.now += hours * HOUR_MS;
    this.onDutyHours += hours;
  }

  waitUntil(t: number): number {
    const waited = Math.max(0, t - this.now) / HOUR_MS;
    if (waited >= this.cfg.restHoursBetweenShifts) this.drivenThisShift = 0;
    this.now = Math.max(this.now, t);
    return waited;
  }
}

function reject(
  truck: Truck,
  load: Load,
  code: RejectionCode,
  reason: string,
): Rejection {
  return { truckId: truck.id, loadId: load.id, code, reason };
}

function driverCostFor(
  truck: Truck,
  miles: number,
  onDutyHours: number,
  cfg: MatchConfig,
) {
  if (truck.driverCost.basis === "per-mile") {
    return { cost: truck.driverCost.amount * miles, days: null };
  }
  const days = onDutyHours / cfg.hoursPerDriverDay;
  return { cost: truck.driverCost.amount * days, days };
}

type Evaluation =
  | { ok: false; rejection: Rejection }
  | { ok: true; economics: Economics; timing: Timing; warnings: string[] };

function evaluate(
  truck: Truck,
  load: Load,
  equipment: EquipmentRegistry,
  dist: DistanceProvider,
  cfg: MatchConfig,
): Evaluation {
  const fail = (code: RejectionCode, reason: string): Evaluation => ({
    ok: false,
    rejection: reject(truck, load, code, reason),
  });
  const warnings: string[] = [];

  // --- Equipment and commodity ---------------------------------------------
  const type = equipment.get(truck.equipmentType);
  if (!type) {
    return fail(
      "equipment-not-registered",
      `Equipment type "${truck.equipmentType}" is not in this fleet's equipment registry.`,
    );
  }
  if (!load.equipmentTypes.includes(truck.equipmentType)) {
    return fail(
      "equipment-not-accepted",
      `Shipper requires ${load.equipmentTypes.join(" or ")}; this is a ${type.label.toLowerCase()}.`,
    );
  }
  const cls = load.commodity.class;
  const r = truck.commodityRestrictions;
  if (r?.exclude?.includes(cls)) {
    return fail(
      "commodity-not-allowed",
      `This truck does not haul ${cls}${r.reason ? ` — ${r.reason}` : ""}.`,
    );
  }
  if (!type.allowedCommodityClasses.includes(cls) && !r?.include?.includes(cls)) {
    return fail(
      "commodity-not-allowed",
      `A ${type.label.toLowerCase()} cannot haul ${cls}.${type.notes ? ` ${type.notes}` : ""}`,
    );
  }

  // --- Capacity ------------------------------------------------------------
  if (load.weightLbs > truck.capacity.weightLbs) {
    return fail(
      "overweight",
      `${load.weightLbs.toLocaleString("en-US")} lb exceeds this truck's ${truck.capacity.weightLbs.toLocaleString("en-US")} lb payload.`,
    );
  }
  if (type.measuresVolume && truck.capacity.volumeCuYd !== undefined) {
    if (load.volumeCuYd === undefined) {
      warnings.push(
        "Shipper gave no volume — checked on weight only. Confirm it fits the body.",
      );
    } else if (load.volumeCuYd > truck.capacity.volumeCuYd) {
      return fail(
        "over-volume",
        `${load.volumeCuYd} cu yd exceeds this trailer's ${truck.capacity.volumeCuYd} cu yd body.`,
      );
    }
  }

  // --- Geography -----------------------------------------------------------
  const deadheadMiles = dist.roadMiles(truck.currentLocation, load.origin);
  if (deadheadMiles > truck.maxDeadheadMiles) {
    return fail(
      "deadhead-too-far",
      `Pickup is ${fmtMi(deadheadMiles)} empty from ${truck.currentLocation.name}; the limit is ${fmtMi(truck.maxDeadheadMiles)}.`,
    );
  }
  const destToHome = dist.roadMiles(load.destination, truck.home);
  if (destToHome > truck.serviceRadiusMiles) {
    return fail(
      "outside-service-radius",
      `Delivers ${fmtMi(destToHome)} from home (${truck.home.name}); the service radius is ${fmtMi(truck.serviceRadiusMiles)}. That is a new trip, not a backhaul.`,
    );
  }
  const loadedMiles = dist.roadMiles(load.origin, load.destination);

  // --- Timing --------------------------------------------------------------
  const availFrom = parseTime(
    truck.availability.earliest,
    `availability start for ${truck.id}`,
  );
  const availUntil = parseTime(
    truck.availability.latest,
    `availability end for ${truck.id}`,
  );
  const puEarliest = parseTime(load.pickup.earliest, `pickup window for ${load.id}`);
  const puLatest = parseTime(load.pickup.latest, `pickup window for ${load.id}`);
  const delEarliest = parseTime(
    load.delivery.earliest,
    `delivery window for ${load.id}`,
  );
  const delLatest = parseTime(load.delivery.latest, `delivery window for ${load.id}`);

  // Each time is shown in the zone of the place it happens: pickup times in the
  // pickup window's offset, delivery in the delivery window's, the truck's
  // release in the truck's. The offset is printed when the trip crosses zones.
  const showZone = tripSpansTimeZones(truck, load);
  const at = (ref: string) => (ms: number) => formatLocalTime(ms, ref, { showZone });
  const atPickup = at(load.pickup.latest);
  const atDelivery = at(load.delivery.latest);
  const atTruck = at(truck.availability.latest);
  const clock = new Clock(availFrom, cfg);
  clock.drive(deadheadMiles / cfg.averageMph);
  const arriveAtPickup = clock.now;
  if (arriveAtPickup > puLatest) {
    return fail(
      "misses-pickup-window",
      `Earliest arrival at pickup is ${atPickup(arriveAtPickup)}; the window closes ${atPickup(puLatest)}.`,
    );
  }
  const waitAtPickup = clock.waitUntil(puEarliest);
  if (waitAtPickup >= 8) {
    warnings.push(
      `Truck waits about ${Math.round(waitAtPickup)} h at pickup for the window to open.`,
    );
  }
  clock.work(cfg.dwellHoursPerStop);
  const loadedDeparture = clock.now;
  clock.drive(loadedMiles / cfg.averageMph);
  const arriveAtDelivery = clock.now;
  if (arriveAtDelivery > delLatest) {
    return fail(
      "misses-delivery-window",
      `Earliest delivery is ${atDelivery(arriveAtDelivery)}; the window closes ${atDelivery(delLatest)}.`,
    );
  }
  clock.waitUntil(delEarliest);
  clock.work(cfg.dwellHoursPerStop);
  const finished = clock.now;
  if (finished > availUntil) {
    return fail(
      "exceeds-availability",
      `Finishes ${atTruck(finished)}, after the truck must be released (${atTruck(availUntil)}).`,
    );
  }

  // --- Economics -----------------------------------------------------------
  const totalMiles = loadedMiles + deadheadMiles;
  const revenue =
    load.pay.basis === "flat" ? load.pay.amount : load.pay.rate * loadedMiles;
  if (load.pay.basis === "per-mile") {
    warnings.push(
      `Paid per mile: revenue uses the estimated ${fmtMi(loadedMiles)}; the broker's mileage governs.`,
    );
  }
  const fuelCost = totalMiles * cfg.fuelCostPerMile;
  const overheadCost = totalMiles * cfg.overheadPerMile;
  const driver = driverCostFor(truck, totalMiles, clock.onDutyHours, cfg);
  const totalOperatingCost = fuelCost + overheadCost + driver.cost;
  const projectedContribution = revenue - totalOperatingCost;

  // Baseline: the truck goes home empty anyway. What does taking this load add?
  const emptyReturnMiles = dist.roadMiles(truck.currentLocation, truck.home);
  const emptyHours = emptyReturnMiles / cfg.averageMph;
  const emptyReturnCost =
    emptyReturnMiles * (cfg.fuelCostPerMile + cfg.overheadPerMile) +
    driverCostFor(truck, emptyReturnMiles, emptyHours, cfg).cost;
  const withLoadMiles = totalMiles + destToHome;
  const withLoadHours = clock.onDutyHours + destToHome / cfg.averageMph;
  const withLoadCost =
    withLoadMiles * (cfg.fuelCostPerMile + cfg.overheadPerMile) +
    driverCostFor(truck, withLoadMiles, withLoadHours, cfg).cost;
  const extraCost = withLoadCost - emptyReturnCost;

  if (projectedContribution < 0) {
    warnings.push(
      "Loses money on a full-trip basis (pay does not cover deadhead + loaded miles).",
    );
  }

  return {
    ok: true,
    warnings,
    timing: {
      arriveAtPickup: iso(arriveAtPickup),
      loadedDeparture: iso(loadedDeparture),
      arriveAtDelivery: iso(arriveAtDelivery),
      finished: iso(finished),
      onDutyHours: round2(clock.onDutyHours),
    },
    economics: {
      loadedMiles,
      deadheadMiles,
      totalMiles,
      revenue: round2(revenue),
      fuelCost: round2(fuelCost),
      driverCost: round2(driver.cost),
      overheadCost: round2(overheadCost),
      totalOperatingCost: round2(totalOperatingCost),
      revenuePerLoadedMile: loadedMiles > 0 ? round2(revenue / loadedMiles) : 0,
      revenuePerTotalMile: totalMiles > 0 ? round2(revenue / totalMiles) : 0,
      projectedContribution: round2(projectedContribution),
      vsEmptyReturn: {
        emptyReturnMiles,
        emptyReturnCost: round2(emptyReturnCost),
        milesAfterDeliveryToHome: destToHome,
        extraMiles: withLoadMiles - emptyReturnMiles,
        extraCost: round2(extraCost),
        incrementalContribution: round2(revenue - extraCost),
      },
      driverDays: driver.days === null ? null : round2(driver.days),
    },
  };
}

export function matchFleet(input: MatchInput): MatchRun {
  const cfg = input.config ?? DEFAULT_MATCH_CONFIG;
  const equipment = input.equipment ?? buildEquipmentRegistry();
  const dist = input.distance ?? estimatedRoadDistance(cfg.roadCircuityFactor);
  const history = input.laneHistory ?? [];
  const { tenantId } = input;

  // Tenant scope is applied before anything else, and silently: another
  // fleet's freight must not even appear as a rejection.
  const trucks = input.trucks.filter((t) => t.tenantId === tenantId);
  const loads = input.loads.filter((l) => l.tenantId === tenantId);

  const dedicated: DedicatedTruckNote[] = [];
  const results: TruckResult[] = [];

  for (const truck of trucks) {
    if (truck.dedicatedLaneOnly) {
      dedicated.push({
        truckId: truck.id,
        note:
          truck.dedicatedLaneNote ??
          "Marked dedicated-lane only. It is committed to a contracted lane, so it is not offered spot backhauls and is not ranked.",
      });
      continue;
    }

    const matches: Match[] = [];
    const rejections: Rejection[] = [];
    for (const load of loads) {
      const ev = evaluate(truck, load, equipment, dist, cfg);
      if (!ev.ok) {
        rejections.push(ev.rejection);
        continue;
      }
      const contribution =
        cfg.contributionBasis === "full-trip"
          ? ev.economics.projectedContribution
          : ev.economics.vsEmptyReturn.incrementalContribution;
      matches.push({
        truckId: truck.id,
        loadId: load.id,
        rank: 0,
        economics: ev.economics,
        timing: ev.timing,
        score: computeScore(contribution, ev.economics.revenuePerTotalMile, cfg.score),
        returnLoadProbability: returnLoadProbability({
          history,
          tenantId,
          originRegion: regionOf(load.origin),
          destinationRegion: regionOf(load.destination),
          equipmentType: truck.equipmentType,
          minWeeks: cfg.minLaneHistoryWeeks,
        }),
        warnings: ev.warnings,
      });
    }

    matches.sort(
      (a, b) =>
        b.score.score - a.score.score ||
        b.score.contributionUsed - a.score.contributionUsed ||
        a.loadId.localeCompare(b.loadId),
    );
    matches.forEach((m, i) => (m.rank = i + 1));
    results.push({ truck, matches, rejections });
  }

  // The same load can rank well for more than one truck. Say so on each, so a
  // dispatcher does not promise one load to two drivers.
  const byLoad = new Map<string, { truckName: string; rank: number }[]>();
  for (const r of results) {
    for (const m of r.matches) {
      const list = byLoad.get(m.loadId) ?? [];
      list.push({ truckName: r.truck.name, rank: m.rank });
      byLoad.set(m.loadId, list);
    }
  }
  for (const r of results) {
    for (const m of r.matches) {
      const others = (byLoad.get(m.loadId) ?? []).filter(
        (o) => o.truckName !== r.truck.name,
      );
      if (others.length > 0) {
        m.warnings.push(
          `Also a match for ${others.map((o) => `${o.truckName} (#${o.rank})`).join(", ")} — one load, one truck.`,
        );
      }
    }
  }

  // Loads nobody can take, with the reason per truck.
  const dedicatedTypes = new Set(
    trucks.filter((t) => t.dedicatedLaneOnly).map((t) => t.equipmentType),
  );
  const unmatchedLoads: MatchRun["unmatchedLoads"] = [];
  for (const load of loads) {
    if (results.some((r) => r.matches.some((m) => m.loadId === load.id))) continue;
    const spotTypes = new Set(results.map((r) => r.truck.equipmentType));
    const onlyDedicated =
      load.equipmentTypes.some((e) => dedicatedTypes.has(e)) &&
      !load.equipmentTypes.some((e) => spotTypes.has(e));
    if (onlyDedicated) {
      unmatchedLoads.push({
        loadId: load.id,
        summary: `Needs ${load.equipmentTypes.join(" or ")}. The fleet's only such equipment is dedicated-lane and is not offered spot freight.`,
      });
      continue;
    }
    const reasons = results
      .map((r) => {
        const rej = r.rejections.find((x) => x.loadId === load.id);
        return rej && rej.code !== "equipment-not-accepted"
          ? `${r.truck.name}: ${rej.reason}`
          : null;
      })
      .filter((x): x is string => x !== null);
    unmatchedLoads.push({
      loadId: load.id,
      summary:
        reasons.length > 0
          ? reasons.join(" ")
          : `No truck in the fleet runs ${load.equipmentTypes.join(" or ")}.`,
    });
  }

  return { tenantId, config: cfg, trucks: results, dedicated, unmatchedLoads };
}
