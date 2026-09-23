// DispatchOS Match — the data model.
//
// Two rules shape every type in this file:
//
// 1. EQUIPMENT AND COMMODITIES ARE OPEN LISTS. `equipmentType` and
//    `commodity.class` are plain strings that resolve against a registry
//    (see equipment.ts), never a TypeScript union. A new trailer type is a new
//    registry entry, not a code change and not a migration.
//
// 2. EVERYTHING IS TENANT-SCOPED. Every truck and load carries the fleet that
//    owns it. The engine refuses to pair across tenants, so the same engine
//    can serve one carrier today and another tomorrow.

/** A place a truck can be or a load can move between. */
export interface Place {
  /** Human label, e.g. "Cleveland, OH". */
  name: string;
  lat: number;
  lon: number;
  /**
   * Market/region key used to group lane history (e.g. "OH-Cleveland").
   * Two places in the same market share lane history. Defaults to `name`.
   */
  region?: string;
}

/** A closed time window, ISO-8601 with offset. */
export interface TimeWindow {
  earliest: string;
  latest: string;
}

// ---------------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------------

/** One kind of equipment, as registered for a tenant. */
export interface EquipmentType {
  /** Stable id, e.g. "dump", "flatbed", "pneumatic-tanker". */
  id: string;
  label: string;
  /** Commodity classes this equipment can legally/practically haul. */
  allowedCommodityClasses: readonly string[];
  /** Whether this equipment has a meaningful cubic-yard limit. */
  measuresVolume: boolean;
  /** Plain-English explanation of what it can and cannot carry. */
  notes?: string;
}

export type DriverCost =
  { basis: "per-mile"; amount: number } | { basis: "per-day"; amount: number };

export interface Truck {
  id: string;
  tenantId: string;
  /** Unit number or short name the dispatcher uses. */
  name: string;
  /** Open string — resolved against the tenant's equipment registry. */
  equipmentType: string;
  capacity: {
    weightLbs: number;
    /** Cubic yards. Only meaningful for equipment that measures volume. */
    volumeCuYd?: number;
  };
  /**
   * Per-truck refinements on top of the equipment type's defaults — e.g. a
   * dump trailer with a poly liner kept clean for road salt excludes scrap.
   */
  commodityRestrictions?: {
    /** Classes this specific truck will NOT haul, even if the type allows them. */
    exclude?: readonly string[];
    /** Extra classes this truck CAN haul beyond the type's defaults. */
    include?: readonly string[];
    /** Why — shown to the dispatcher when a load is rejected for this. */
    reason?: string;
  };
  home: Place;
  /** Where the truck is (or will be) empty and ready for a backhaul. */
  currentLocation: Place;
  /** When the truck is empty at `currentLocation`, and when it must be finished. */
  availability: TimeWindow;
  /** Max empty miles the fleet will run to reach a backhaul pickup. */
  maxDeadheadMiles: number;
  /**
   * Service radius around home: a backhaul must deliver within this many
   * miles of home, otherwise it is not a backhaul, it is a new trip.
   */
  serviceRadiusMiles: number;
  driverCost: DriverCost;
  /**
   * Dedicated-lane equipment is never ranked against spot freight. The
   * engine reports it separately with `dedicatedLaneNote` and matches nothing.
   */
  dedicatedLaneOnly?: boolean;
  dedicatedLaneNote?: string;
}

// ---------------------------------------------------------------------------
// Loads
// ---------------------------------------------------------------------------

export type Pay =
  | { basis: "flat"; amount: number }
  /** Paid per loaded mile. Revenue is computed on the engine's loaded-mile estimate. */
  | { basis: "per-mile"; rate: number };

/**
 * Where a load came from. Board integrations do not exist yet — `board` is the
 * seam, and `LoadBoardAdapter` in sources.ts is the interface they will
 * implement. Nothing in the app pretends to fetch from a board.
 */
export type LoadSource =
  | { kind: "manual" }
  | { kind: "csv"; fileName?: string; row: number }
  | { kind: "board"; board: string; externalId: string }
  | { kind: "demo" };

export interface Load {
  id: string;
  tenantId: string;
  origin: Place;
  destination: Place;
  commodity: {
    name: string;
    /** Open string, e.g. "aggregate", "steel", "dry-bulk-powder". */
    class: string;
  };
  weightLbs: number;
  volumeCuYd?: number;
  pay: Pay;
  pickup: TimeWindow;
  delivery: TimeWindow;
  /** Equipment types the shipper will accept. Open strings. */
  equipmentTypes: readonly string[];
  source: LoadSource;
  /** Free-text shipper/broker note. */
  notes?: string;
}

// ---------------------------------------------------------------------------
// Lane history — the only thing allowed to produce a return-load probability
// ---------------------------------------------------------------------------

/**
 * One observed week on a lane: how many qualifying loads were actually seen.
 * This must come from real records (the fleet's own dispatch history or a
 * board export). The engine never synthesises it.
 */
export interface LaneObservation {
  tenantId: string;
  originRegion: string;
  destinationRegion: string;
  equipmentType: string;
  /** ISO date of the Monday of the observed week. */
  weekOf: string;
  loadsSeen: number;
}

// ---------------------------------------------------------------------------
// Config — every assumption the numbers depend on, in one visible place
// ---------------------------------------------------------------------------

export interface ScoreConfig {
  /** Weight given to the contribution component. */
  contributionWeight: number;
  /** Weight given to the revenue-per-total-mile component. */
  revenuePerMileWeight: number;
  /** Contribution ($) that scores 0 on its component. At or below → 0. */
  contributionFloor: number;
  /** Contribution ($) that scores full marks on its component. */
  contributionTarget: number;
  /** Revenue per total mile ($) that scores 0. */
  revenuePerMileFloor: number;
  /** Revenue per total mile ($) that scores full marks. */
  revenuePerMileTarget: number;
}

export interface MatchConfig {
  fuelCostPerMile: number;
  /** Insurance, maintenance, tyres, tolls, admin — per total mile. */
  overheadPerMile: number;
  /** Average road speed for timing checks. */
  averageMph: number;
  /**
   * Road miles ÷ straight-line miles. There is no routing API in this build,
   * so road distance is an estimate: great-circle distance × this factor.
   */
  roadCircuityFactor: number;
  /** Hours to load at origin and unload at destination (each). */
  dwellHoursPerStop: number;
  /** Max driving hours before a mandatory rest (US HOS: 11). */
  maxDrivingHoursPerShift: number;
  /** Rest break taken between shifts (US HOS: 10). */
  restHoursBetweenShifts: number;
  /** On-duty hours that count as one driver-day for per-day pay. */
  hoursPerDriverDay: number;
  /**
   * What "contribution" means for scoring:
   * - "full-trip": pay − cost of deadhead + loaded miles (the brief's definition).
   * - "vs-empty-return": pay − the EXTRA cost over simply driving home empty.
   *   This is how a dispatcher actually values a backhaul.
   */
  contributionBasis: "full-trip" | "vs-empty-return";
  /** Weeks of lane history required before a return-load probability is shown. */
  minLaneHistoryWeeks: number;
  score: ScoreConfig;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export interface ScoreBreakdown {
  score: number;
  contributionUsed: number;
  contributionComponent: number;
  revenuePerMileComponent: number;
  /** The formula with this match's numbers substituted in. */
  explanation: string;
}

export interface Economics {
  loadedMiles: number;
  deadheadMiles: number;
  totalMiles: number;
  revenue: number;
  fuelCost: number;
  driverCost: number;
  overheadCost: number;
  totalOperatingCost: number;
  revenuePerLoadedMile: number;
  revenuePerTotalMile: number;
  projectedContribution: number;
  /** Straight-home-empty baseline vs. taking this load and then going home. */
  vsEmptyReturn: {
    emptyReturnMiles: number;
    emptyReturnCost: number;
    milesAfterDeliveryToHome: number;
    extraMiles: number;
    extraCost: number;
    incrementalContribution: number;
  };
  driverDays: number | null;
}

export interface Timing {
  arriveAtPickup: string;
  loadedDeparture: string;
  arriveAtDelivery: string;
  finished: string;
  onDutyHours: number;
}

export type ReturnLoadProbability =
  | {
      available: true;
      probability: number;
      weeksObserved: number;
      weeksWithLoads: number;
    }
  | { available: false; reason: string };

export interface Match {
  truckId: string;
  loadId: string;
  rank: number;
  economics: Economics;
  timing: Timing;
  score: ScoreBreakdown;
  returnLoadProbability: ReturnLoadProbability;
  /** Soft concerns that did not disqualify the match but a dispatcher should see. */
  warnings: string[];
}

export type RejectionCode =
  | "equipment-not-accepted"
  | "equipment-not-registered"
  | "commodity-not-allowed"
  | "overweight"
  | "over-volume"
  | "deadhead-too-far"
  | "outside-service-radius"
  | "misses-pickup-window"
  | "misses-delivery-window"
  | "exceeds-availability";

export interface Rejection {
  truckId: string;
  loadId: string;
  code: RejectionCode;
  reason: string;
}

export interface DedicatedTruckNote {
  truckId: string;
  note: string;
}

export interface TruckResult {
  truck: Truck;
  matches: Match[];
  rejections: Rejection[];
}

export interface MatchRun {
  tenantId: string;
  config: MatchConfig;
  /** Ranked results for every spot-eligible truck. */
  trucks: TruckResult[];
  /** Trucks withheld from spot matching, with the reason. */
  dedicated: DedicatedTruckNote[];
  /** Loads no eligible truck can take, with one line on why. */
  unmatchedLoads: { loadId: string; summary: string }[];
}
