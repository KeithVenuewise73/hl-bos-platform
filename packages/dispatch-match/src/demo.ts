// SAMPLE / DEMO DATA.
//
// Illustrative only. These are NOT any carrier's real trucks, rates, shippers
// or freight. The fleet is modeled on a Western New York bulk carrier whose
// trucks run road salt outbound from the Genesee Valley and come back empty;
// the loads are plausible regional backhauls with made-up pay. Everything is
// tagged `source: { kind: "demo" }` and the app labels it as sample data.
//
// Dates are fixed to the week of 28 September 2026 (Eastern time) so the demo
// is deterministic.

import type { Load, Place, Truck } from "./types";

export const DEMO_TENANT_ID = "demo-wny-bulk";
export const DEMO_TENANT_LABEL =
  "Sample fleet — Western NY bulk carrier (illustrative)";

const P = (name: string, lat: number, lon: number): Place => ({ name, lat, lon });

/** Known places for CSV import and the demo. Coordinates are city centres. */
export const DEMO_PLACES = {
  mountMorris: P("Mount Morris, NY", 42.7256, -77.8739),
  buffalo: P("Buffalo, NY", 42.8864, -78.8784),
  lackawanna: P("Lackawanna, NY", 42.8256, -78.8234),
  rochester: P("Rochester, NY", 43.1566, -77.6088),
  batavia: P("Batavia, NY", 42.9981, -78.1875),
  canandaigua: P("Canandaigua, NY", 42.8875, -77.2817),
  syracuse: P("Syracuse, NY", 43.0481, -76.1474),
  albany: P("Albany, NY", 42.6526, -73.7562),
  binghamton: P("Binghamton, NY", 42.0987, -75.918),
  jamestown: P("Jamestown, NY", 42.097, -79.2353),
  olean: P("Olean, NY", 42.0776, -78.4297),
  erie: P("Erie, PA", 42.1292, -80.0851),
  pittsburgh: P("Pittsburgh, PA", 40.4406, -79.9959),
  scranton: P("Scranton, PA", 41.409, -75.6624),
  williamsport: P("Williamsport, PA", 41.2412, -77.0011),
  cleveland: P("Cleveland, OH", 41.4993, -81.6944),
  youngstown: P("Youngstown, OH", 41.0998, -80.6495),
  toledo: P("Toledo, OH", 41.6528, -83.5379),
} satisfies Record<string, Place>;

export const DEMO_PLACE_LIST: readonly Place[] = Object.values(DEMO_PLACES);

const T = (day: number, hhmm: string) =>
  `2026-09-${String(day).padStart(2, "0")}T${hhmm}:00-04:00`;
const home = DEMO_PLACES.mountMorris;

export const DEMO_TRUCKS: readonly Truck[] = [
  {
    id: "D-101",
    tenantId: DEMO_TENANT_ID,
    name: "Dump 101",
    equipmentType: "dump",
    capacity: { weightLbs: 48_000, volumeCuYd: 80 },
    home,
    currentLocation: DEMO_PLACES.cleveland,
    availability: { earliest: T(29, "06:00"), latest: T(30, "20:00") },
    maxDeadheadMiles: 175,
    serviceRadiusMiles: 150,
    driverCost: { basis: "per-mile", amount: 0.62 },
  },
  {
    id: "D-114",
    tenantId: DEMO_TENANT_ID,
    name: "Dump 114",
    equipmentType: "dump",
    capacity: { weightLbs: 50_000, volumeCuYd: 40 },
    commodityRestrictions: {
      exclude: ["scrap-metal"],
      reason: "poly-lined body kept clean for road salt; scrap would tear the liner",
    },
    home,
    currentLocation: DEMO_PLACES.pittsburgh,
    availability: { earliest: T(29, "08:00"), latest: T(29, "23:00") },
    maxDeadheadMiles: 150,
    serviceRadiusMiles: 150,
    driverCost: { basis: "per-day", amount: 320 },
  },
  {
    id: "F-207",
    tenantId: DEMO_TENANT_ID,
    name: "Flatbed 207",
    equipmentType: "flatbed",
    capacity: { weightLbs: 48_000 },
    home,
    currentLocation: DEMO_PLACES.pittsburgh,
    availability: { earliest: T(29, "07:00"), latest: T(30, "18:00") },
    maxDeadheadMiles: 150,
    serviceRadiusMiles: 150,
    driverCost: { basis: "per-mile", amount: 0.6 },
  },
  {
    id: "F-212",
    tenantId: DEMO_TENANT_ID,
    name: "Flatbed 212",
    equipmentType: "flatbed",
    capacity: { weightLbs: 47_000 },
    home,
    currentLocation: DEMO_PLACES.albany,
    availability: { earliest: T(29, "10:00"), latest: T(30, "18:00") },
    maxDeadheadMiles: 175,
    serviceRadiusMiles: 150,
    driverCost: { basis: "per-day", amount: 300 },
  },
  {
    id: "P-301",
    tenantId: DEMO_TENANT_ID,
    name: "Pneumatic 301",
    equipmentType: "pneumatic-tanker",
    capacity: { weightLbs: 52_000 },
    home,
    currentLocation: DEMO_PLACES.rochester,
    availability: { earliest: T(29, "06:00"), latest: T(30, "18:00") },
    maxDeadheadMiles: 100,
    serviceRadiusMiles: 150,
    driverCost: { basis: "per-mile", amount: 0.62 },
    dedicatedLaneOnly: true,
    dedicatedLaneNote:
      "Dedicated lane only. Pneumatic tankers run contracted dry-bulk lanes, and a spot powder load risks contaminating the tank and missing the contract run, so this unit is not ranked against spot freight.",
  },
];

const demo = { kind: "demo" } as const;

export const DEMO_LOADS: readonly Load[] = [
  {
    id: "L-101",
    tenantId: DEMO_TENANT_ID,
    origin: DEMO_PLACES.cleveland,
    destination: DEMO_PLACES.batavia,
    commodity: { name: "Crushed limestone #57", class: "aggregate" },
    weightLbs: 46_000,
    volumeCuYd: 32,
    pay: { basis: "flat", amount: 1450 },
    pickup: { earliest: T(29, "08:00"), latest: T(29, "14:00") },
    delivery: { earliest: T(29, "14:00"), latest: T(30, "12:00") },
    equipmentTypes: ["dump"],
    source: demo,
  },
  {
    id: "L-102",
    tenantId: DEMO_TENANT_ID,
    origin: DEMO_PLACES.erie,
    destination: DEMO_PLACES.lackawanna,
    commodity: { name: "Shredded scrap steel", class: "scrap-metal" },
    weightLbs: 38_000,
    volumeCuYd: 55,
    pay: { basis: "flat", amount: 780 },
    pickup: { earliest: T(29, "10:00"), latest: T(29, "18:00") },
    delivery: { earliest: T(29, "12:00"), latest: T(30, "16:00") },
    equipmentTypes: ["dump"],
    source: demo,
  },
  {
    id: "L-103",
    tenantId: DEMO_TENANT_ID,
    origin: DEMO_PLACES.jamestown,
    destination: DEMO_PLACES.rochester,
    commodity: { name: "Double-ground hardwood mulch", class: "mulch" },
    weightLbs: 24_000,
    volumeCuYd: 76,
    pay: { basis: "flat", amount: 1050 },
    pickup: { earliest: T(29, "09:00"), latest: T(29, "17:00") },
    delivery: { earliest: T(29, "12:00"), latest: T(30, "14:00") },
    equipmentTypes: ["dump"],
    source: demo,
  },
  {
    id: "L-104",
    tenantId: DEMO_TENANT_ID,
    origin: DEMO_PLACES.pittsburgh,
    destination: DEMO_PLACES.buffalo,
    commodity: { name: "Masonry sand", class: "sand" },
    weightLbs: 47_000,
    volumeCuYd: 29,
    pay: { basis: "per-mile", rate: 2.75 },
    pickup: { earliest: T(29, "09:00"), latest: T(29, "15:00") },
    delivery: { earliest: T(29, "15:00"), latest: T(30, "10:00") },
    equipmentTypes: ["dump"],
    source: demo,
  },
  {
    id: "L-105",
    tenantId: DEMO_TENANT_ID,
    origin: DEMO_PLACES.youngstown,
    destination: DEMO_PLACES.jamestown,
    commodity: { name: "Asphalt millings", class: "asphalt-millings" },
    weightLbs: 44_000,
    volumeCuYd: 30,
    pay: { basis: "flat", amount: 650 },
    pickup: { earliest: T(29, "06:00"), latest: T(29, "07:00") },
    delivery: { earliest: T(29, "09:00"), latest: T(29, "15:00") },
    equipmentTypes: ["dump"],
    source: demo,
    notes: "Paving crew needs millings at first light.",
  },
  {
    id: "L-106",
    tenantId: DEMO_TENANT_ID,
    origin: DEMO_PLACES.pittsburgh,
    destination: DEMO_PLACES.buffalo,
    commodity: { name: "Hot-rolled steel coils (3)", class: "steel" },
    weightLbs: 44_000,
    pay: { basis: "flat", amount: 1350 },
    pickup: { earliest: T(29, "08:00"), latest: T(29, "16:00") },
    delivery: { earliest: T(29, "14:00"), latest: T(30, "12:00") },
    equipmentTypes: ["flatbed", "step-deck"],
    source: demo,
  },
  {
    id: "L-107",
    tenantId: DEMO_TENANT_ID,
    origin: DEMO_PLACES.albany,
    destination: DEMO_PLACES.rochester,
    commodity: { name: "Kiln-dried framing lumber", class: "lumber" },
    weightLbs: 40_000,
    pay: { basis: "per-mile", rate: 2.4 },
    pickup: { earliest: T(29, "10:00"), latest: T(29, "16:00") },
    delivery: { earliest: T(29, "16:00"), latest: T(30, "14:00") },
    equipmentTypes: ["flatbed"],
    source: demo,
  },
  {
    id: "L-108",
    tenantId: DEMO_TENANT_ID,
    origin: DEMO_PLACES.syracuse,
    destination: DEMO_PLACES.batavia,
    commodity: { name: "Packaging machine (crated)", class: "machinery" },
    weightLbs: 26_000,
    pay: { basis: "flat", amount: 900 },
    pickup: { earliest: T(29, "12:00"), latest: T(29, "18:00") },
    delivery: { earliest: T(30, "07:00"), latest: T(30, "15:00") },
    equipmentTypes: ["flatbed", "step-deck"],
    source: demo,
  },
  {
    id: "L-109",
    tenantId: DEMO_TENANT_ID,
    origin: DEMO_PLACES.scranton,
    destination: DEMO_PLACES.canandaigua,
    commodity: { name: "Palletized concrete block", class: "building-materials" },
    weightLbs: 45_000,
    pay: { basis: "flat", amount: 1150 },
    pickup: { earliest: T(29, "11:00"), latest: T(29, "17:00") },
    delivery: { earliest: T(30, "07:00"), latest: T(30, "16:00") },
    equipmentTypes: ["flatbed"],
    source: demo,
  },
  {
    id: "L-110",
    tenantId: DEMO_TENANT_ID,
    origin: DEMO_PLACES.cleveland,
    destination: DEMO_PLACES.rochester,
    commodity: { name: "Structural steel beams", class: "steel" },
    weightLbs: 49_500,
    pay: { basis: "flat", amount: 1600 },
    pickup: { earliest: T(29, "08:00"), latest: T(29, "16:00") },
    delivery: { earliest: T(29, "16:00"), latest: T(30, "16:00") },
    equipmentTypes: ["flatbed"],
    source: demo,
    notes: "Needs a light tractor — gross is tight.",
  },
  {
    id: "L-111",
    tenantId: DEMO_TENANT_ID,
    origin: DEMO_PLACES.buffalo,
    destination: DEMO_PLACES.syracuse,
    commodity: { name: "Portland cement (bulk)", class: "dry-bulk-powder" },
    weightLbs: 50_000,
    pay: { basis: "flat", amount: 1100 },
    pickup: { earliest: T(29, "07:00"), latest: T(29, "15:00") },
    delivery: { earliest: T(29, "12:00"), latest: T(30, "12:00") },
    equipmentTypes: ["pneumatic-tanker"],
    source: demo,
  },
  {
    id: "L-112",
    tenantId: DEMO_TENANT_ID,
    origin: DEMO_PLACES.pittsburgh,
    destination: DEMO_PLACES.albany,
    commodity: { name: "Steel plate", class: "steel" },
    weightLbs: 42_000,
    pay: { basis: "flat", amount: 1900 },
    pickup: { earliest: T(29, "08:00"), latest: T(29, "14:00") },
    delivery: { earliest: T(30, "07:00"), latest: T(30, "17:00") },
    equipmentTypes: ["flatbed"],
    source: demo,
  },
];

// ===========================================================================
// SECOND SAMPLE FLEET — a Dallas-based regional carrier (illustrative).
//
// Exists to prove the engine is not tied to one region: different home base,
// different equipment (step deck, reefer, dry van), and a truck that starts in
// Mountain time (Albuquerque) while its loads are in Central time. Coordinates
// are the median of each city's ZIP codes in the `zipcodes` dataset — the same
// source the national place resolver uses. Loads, rates and shippers are
// invented.
// ===========================================================================

export const TX_TENANT_ID = "demo-tx-regional";
export const TX_TENANT_LABEL = "Sample fleet — Dallas regional carrier (illustrative)";

export const TX_PLACES = {
  dallas: P("Dallas, TX", 32.7673, -96.7776),
  fortWorth: P("Fort Worth, TX", 32.7714, -97.2915),
  houston: P("Houston, TX", 29.834, -95.4342),
  sanAntonio: P("San Antonio, TX", 29.4375, -98.4691),
  austin: P("Austin, TX", 30.3264, -97.7499),
  waco: P("Waco, TX", 31.5527, -97.1615),
  beaumont: P("Beaumont, TX", 30.0865, -94.1327),
  amarillo: P("Amarillo, TX", 35.2297, -101.8755),
  laredo: P("Laredo, TX", 27.5434, -99.481),
  oklahomaCity: P("Oklahoma City, OK", 35.5042, -97.5017),
  tulsa: P("Tulsa, OK", 36.1398, -95.9928),
  shreveport: P("Shreveport, LA", 32.6076, -93.7526),
  albuquerque: P("Albuquerque, NM", 35.0512, -106.6729),
} satisfies Record<string, Place>;

/** Central Daylight Time (−05:00) — the default for this fleet. */
const C = (day: number, hhmm: string) =>
  `2026-09-${String(day).padStart(2, "0")}T${hhmm}:00-05:00`;
/** Mountain Daylight Time (−06:00) — Albuquerque. */
const M = (day: number, hhmm: string) =>
  `2026-09-${String(day).padStart(2, "0")}T${hhmm}:00-06:00`;
const dallas = TX_PLACES.dallas;

export const TX_TRUCKS: readonly Truck[] = [
  {
    id: "TX-41",
    tenantId: TX_TENANT_ID,
    name: "Flatbed 41",
    equipmentType: "flatbed",
    capacity: { weightLbs: 48_000 },
    home: dallas,
    currentLocation: TX_PLACES.houston,
    availability: { earliest: C(29, "07:00"), latest: C(30, "19:00") },
    maxDeadheadMiles: 200,
    serviceRadiusMiles: 200,
    driverCost: { basis: "per-mile", amount: 0.6 },
  },
  {
    id: "TX-17",
    tenantId: TX_TENANT_ID,
    name: "Step Deck 17",
    equipmentType: "step-deck",
    capacity: { weightLbs: 46_000 },
    home: dallas,
    currentLocation: TX_PLACES.sanAntonio,
    availability: { earliest: C(29, "08:00"), latest: C(30, "18:00") },
    maxDeadheadMiles: 200,
    serviceRadiusMiles: 200,
    driverCost: { basis: "per-day", amount: 310 },
  },
  {
    id: "TX-08",
    tenantId: TX_TENANT_ID,
    name: "Reefer 8",
    equipmentType: "reefer",
    capacity: { weightLbs: 44_000 },
    home: dallas,
    currentLocation: TX_PLACES.albuquerque,
    availability: { earliest: M(29, "06:00"), latest: "2026-10-01T18:00:00-06:00" },
    maxDeadheadMiles: 350,
    serviceRadiusMiles: 250,
    driverCost: { basis: "per-mile", amount: 0.64 },
  },
  {
    id: "TX-22",
    tenantId: TX_TENANT_ID,
    name: "Van 22",
    equipmentType: "dry-van",
    capacity: { weightLbs: 45_000 },
    home: dallas,
    currentLocation: TX_PLACES.oklahomaCity,
    availability: { earliest: C(29, "07:00"), latest: C(30, "20:00") },
    maxDeadheadMiles: 200,
    serviceRadiusMiles: 250,
    driverCost: { basis: "per-mile", amount: 0.58 },
  },
];

const L = (
  id: string,
  from: Place,
  to: Place,
  commodity: Load["commodity"],
  weightLbs: number,
  pay: Load["pay"],
  pickup: Load["pickup"],
  delivery: Load["delivery"],
  equipmentTypes: string[],
  notes?: string,
): Load => ({
  id,
  tenantId: TX_TENANT_ID,
  origin: from,
  destination: to,
  commodity,
  weightLbs,
  pay,
  pickup,
  delivery,
  equipmentTypes,
  source: demo,
  ...(notes ? { notes } : {}),
});

export const TX_LOADS: readonly Load[] = [
  L(
    "T-201",
    TX_PLACES.houston,
    TX_PLACES.fortWorth,
    { name: "Line pipe", class: "steel" },
    44_000,
    { basis: "flat", amount: 1150 },
    { earliest: C(29, "08:00"), latest: C(29, "14:00") },
    { earliest: C(29, "14:00"), latest: C(30, "12:00") },
    ["flatbed", "step-deck"],
  ),
  L(
    "T-202",
    TX_PLACES.beaumont,
    dallas,
    { name: "Southern yellow pine", class: "lumber" },
    42_000,
    { basis: "per-mile", rate: 2.5 },
    { earliest: C(29, "10:00"), latest: C(29, "16:00") },
    { earliest: C(30, "07:00"), latest: C(30, "15:00") },
    ["flatbed"],
  ),
  L(
    "T-203",
    TX_PLACES.sanAntonio,
    TX_PLACES.waco,
    { name: "Compressor skid", class: "machinery" },
    38_000,
    { basis: "flat", amount: 900 },
    { earliest: C(29, "09:00"), latest: C(29, "15:00") },
    { earliest: C(29, "15:00"), latest: C(30, "12:00") },
    ["step-deck", "flatbed"],
  ),
  L(
    "T-204",
    TX_PLACES.albuquerque,
    dallas,
    { name: "Green chile, cased", class: "refrigerated" },
    40_000,
    { basis: "flat", amount: 2300 },
    { earliest: M(29, "08:00"), latest: M(29, "12:00") },
    { earliest: C(30, "06:00"), latest: C(30, "14:00") },
    ["reefer"],
    "Picks up in Mountain time, delivers in Central.",
  ),
  L(
    "T-205",
    TX_PLACES.amarillo,
    TX_PLACES.fortWorth,
    { name: "Boxed beef", class: "refrigerated" },
    42_000,
    { basis: "flat", amount: 1500 },
    { earliest: C(29, "09:00"), latest: C(29, "13:00") },
    { earliest: C(29, "18:00"), latest: C(30, "08:00") },
    ["reefer"],
  ),
  L(
    "T-206",
    TX_PLACES.oklahomaCity,
    dallas,
    { name: "Palletized beverages", class: "palletized-general" },
    44_000,
    { basis: "per-mile", rate: 2.3 },
    { earliest: C(29, "08:00"), latest: C(29, "12:00") },
    { earliest: C(29, "13:00"), latest: C(30, "10:00") },
    ["dry-van"],
  ),
  L(
    "T-207",
    TX_PLACES.tulsa,
    TX_PLACES.waco,
    { name: "Paper rolls on pallets", class: "palletized-general" },
    40_000,
    { basis: "flat", amount: 1050 },
    { earliest: C(29, "11:00"), latest: C(29, "17:00") },
    { earliest: C(30, "07:00"), latest: C(30, "15:00") },
    ["dry-van"],
  ),
  L(
    "T-208",
    TX_PLACES.shreveport,
    TX_PLACES.austin,
    { name: "Bagged cement", class: "building-materials" },
    43_000,
    { basis: "flat", amount: 1250 },
    { earliest: C(29, "09:00"), latest: C(29, "15:00") },
    { earliest: C(30, "07:00"), latest: C(30, "15:00") },
    ["flatbed", "dry-van"],
  ),
  L(
    "T-209",
    TX_PLACES.houston,
    dallas,
    { name: "Hot-rolled coil", class: "steel" },
    50_000,
    { basis: "flat", amount: 1300 },
    { earliest: C(29, "08:00"), latest: C(29, "16:00") },
    { earliest: C(29, "16:00"), latest: C(30, "16:00") },
    ["flatbed"],
  ),
  L(
    "T-210",
    TX_PLACES.beaumont,
    dallas,
    { name: "Liquid resin (bulk)", class: "liquid-bulk" },
    46_000,
    { basis: "flat", amount: 1600 },
    { earliest: C(29, "07:00"), latest: C(29, "15:00") },
    { earliest: C(29, "15:00"), latest: C(30, "12:00") },
    ["liquid-tanker"],
  ),
  L(
    "T-211",
    TX_PLACES.laredo,
    dallas,
    { name: "Auto parts (cross-border)", class: "palletized-general" },
    38_000,
    { basis: "flat", amount: 1400 },
    { earliest: C(29, "06:00"), latest: C(29, "10:00") },
    { earliest: C(29, "16:00"), latest: C(30, "12:00") },
    ["dry-van"],
  ),
];

// ===========================================================================
// Every sample fleet, for pickers. Each is its own tenant.
// ===========================================================================

export interface SampleFleet {
  id: string;
  label: string;
  tenantId: string;
  trucks: readonly Truck[];
  loads: readonly Load[];
}

export const SAMPLE_FLEETS: readonly SampleFleet[] = [
  {
    id: "wny-bulk",
    label: DEMO_TENANT_LABEL,
    tenantId: DEMO_TENANT_ID,
    trucks: DEMO_TRUCKS,
    loads: DEMO_LOADS,
  },
  {
    id: "tx-regional",
    label: TX_TENANT_LABEL,
    tenantId: TX_TENANT_ID,
    trucks: TX_TRUCKS,
    loads: TX_LOADS,
  },
];
