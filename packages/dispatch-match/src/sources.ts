// Where loads and trucks come from.
//
// Built today: manual entry (a `Load` / `Truck` object) and CSV import.
// NOT built: load-board integrations (DAT, Truckstop, 123Loadboard). The
// `LoadBoardAdapter` interface is the seam they will implement; there is no
// implementation and nothing in the app claims to fetch from a board.
//
// Location-independent: CSV import takes a `PlaceResolver`, so the same
// importer works with the national resolver ("./places", server-side), a
// fleet's own list of yards, or anything else. Row-level coordinates always
// win over the resolver.

import type { DriverCost, Load, Pay, Place, Truck } from "./types";

export interface LoadBoardQuery {
  tenantId: string;
  equipmentTypes: readonly string[];
  near: Place;
  radiusMiles: number;
  pickupFrom: string;
  pickupTo: string;
}

/** The seam for board integrations. Implementations must set `source.kind = "board"`. */
export interface LoadBoardAdapter {
  readonly board: string;
  searchLoads(query: LoadBoardQuery): Promise<Load[]>;
}

/** Turns a written location into a Place, or says why it cannot. Never guesses. */
export type PlaceResolver = (
  text: string,
) => { ok: true; place: Place } | { ok: false; error: string };

/** A resolver over a fixed list of places, matched by exact name (case-insensitive). */
export function placeListResolver(places: readonly Place[]): PlaceResolver {
  const byName = new Map(places.map((p) => [p.name.toLowerCase(), p]));
  return (text) => {
    const p = byName.get(text.trim().toLowerCase());
    return p
      ? { ok: true, place: p }
      : { ok: false, error: `"${text}" is not a known place — add its coordinates` };
  };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export const LOAD_CSV_COLUMNS = [
  "id",
  "origin",
  "destination",
  "commodity",
  "commodity_class",
  "weight_lbs",
  "volume_cu_yd",
  "pay_basis",
  "pay",
  "pickup_earliest",
  "pickup_latest",
  "delivery_earliest",
  "delivery_latest",
  "equipment",
  "origin_lat",
  "origin_lon",
  "destination_lat",
  "destination_lon",
  "notes",
] as const;

/** Kept for callers of the first version. */
export const CSV_COLUMNS = LOAD_CSV_COLUMNS;

const LOAD_REQUIRED = [
  "id",
  "origin",
  "destination",
  "commodity",
  "commodity_class",
  "weight_lbs",
  "pay_basis",
  "pay",
  "pickup_earliest",
  "pickup_latest",
  "delivery_earliest",
  "delivery_latest",
  "equipment",
] as const;

export const TRUCK_CSV_COLUMNS = [
  "id",
  "name",
  "equipment",
  "weight_lbs",
  "volume_cu_yd",
  "home",
  "current_location",
  "available_from",
  "available_until",
  "max_deadhead_mi",
  "service_radius_mi",
  "driver_cost_basis",
  "driver_cost",
  "exclude_commodities",
  "include_commodities",
  "restriction_reason",
  "dedicated_lane_only",
  "dedicated_lane_note",
] as const;

const TRUCK_REQUIRED = [
  "id",
  "name",
  "equipment",
  "weight_lbs",
  "home",
  "current_location",
  "available_from",
  "available_until",
  "max_deadhead_mi",
  "service_radius_mi",
  "driver_cost_basis",
  "driver_cost",
] as const;

/** RFC-4180-ish: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/**
 * A timestamp must carry its UTC offset (or Z). A national fleet spans time
 * zones, and "08:00" with no offset would silently mean the server's zone.
 */
export const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;

export interface CsvImportResult<T> {
  items: T[];
  /** One entry per rejected row. A bad row never becomes a record with guessed values. */
  errors: { row: number; message: string }[];
}

/** Shared per-row reader: collects every problem on the row rather than stopping at the first. */
function rowReader(header: string[], cells: string[], resolver: PlaceResolver) {
  const problems: string[] = [];
  const get = (col: string) => {
    const idx = header.indexOf(col);
    return idx >= 0 ? (cells[idx] ?? "").trim() : "";
  };
  const num = (col: string, optional = false): number | undefined => {
    const v = get(col);
    if (v === "") {
      if (!optional) problems.push(`${col} is blank`);
      return undefined;
    }
    const n = Number(v.replace(/[$,]/g, ""));
    if (!Number.isFinite(n) || n < 0) {
      problems.push(`${col} "${v}" is not a non-negative number`);
      return undefined;
    }
    return n;
  };
  const place = (col: string, latCol?: string, lonCol?: string): Place | undefined => {
    const name = get(col);
    const lat = latCol ? get(latCol) : "";
    const lon = lonCol ? get(lonCol) : "";
    if (lat !== "" && lon !== "") {
      const la = Number(lat);
      const lo = Number(lon);
      if (
        !Number.isFinite(la) ||
        !Number.isFinite(lo) ||
        Math.abs(la) > 90 ||
        Math.abs(lo) > 180
      ) {
        problems.push(`${col} coordinates are invalid`);
        return undefined;
      }
      return { name: name || `${la}, ${lo}`, lat: la, lon: lo };
    }
    if (name === "") return undefined; // reported as blank by the required check
    const r = resolver(name);
    if (!r.ok) {
      problems.push(`${col}: ${r.error}`);
      return undefined;
    }
    return r.place;
  };
  const time = (col: string): string => {
    const v = get(col);
    if (v === "") return v;
    if (Number.isNaN(Date.parse(v))) problems.push(`${col} "${v}" is not a date-time`);
    else if (!HAS_OFFSET.test(v)) {
      problems.push(
        `${col} "${v}" has no UTC offset — write e.g. ${v}-05:00 (time zones differ across a national fleet)`,
      );
    }
    return v;
  };
  const list = (col: string) =>
    get(col)
      .split("|")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  return { problems, get, num, place, time, list };
}

function readCsv(
  text: string,
  required: readonly string[],
): { header: string[]; rows: string[][] } | { error: string } {
  const rows = parseCsv(text);
  const header = rows[0]?.map((h) => h.trim().toLowerCase());
  if (!header) return { error: "The file is empty." };
  const missing = required.filter((c) => !header.includes(c));
  if (missing.length > 0) return { error: `Missing column(s): ${missing.join(", ")}.` };
  return { header, rows: rows.slice(1) };
}

/**
 * Parse loads from CSV. Locations resolve through `resolvePlace` unless the
 * row gives coordinates. A location that does not resolve is an error for that
 * row — never a guessed place.
 */
export function importLoadsCsv(
  text: string,
  opts: { tenantId: string; resolvePlace: PlaceResolver; fileName?: string },
): CsvImportResult<Load> {
  const parsed = readCsv(text, LOAD_REQUIRED);
  if ("error" in parsed)
    return { items: [], errors: [{ row: 1, message: parsed.error }] };
  const { header, rows } = parsed;
  const errors: CsvImportResult<Load>["errors"] = [];
  const items: Load[] = [];
  const seenIds = new Set<string>();

  rows.forEach((cells, i) => {
    const rowNo = i + 2;
    const { problems, get, num, place, time, list } = rowReader(
      header,
      cells,
      opts.resolvePlace,
    );
    for (const c of LOAD_REQUIRED) if (get(c) === "") problems.push(`${c} is blank`);

    const id = get("id");
    if (id !== "" && seenIds.has(id)) problems.push(`duplicate id "${id}"`);
    const origin = place("origin", "origin_lat", "origin_lon");
    const destination = place("destination", "destination_lat", "destination_lon");
    const weightLbs = num("weight_lbs");
    const volumeCuYd = num("volume_cu_yd", true);
    const payAmount = num("pay");
    const basis = get("pay_basis").toLowerCase();
    let pay: Pay | undefined;
    if (basis === "flat" && payAmount !== undefined)
      pay = { basis: "flat", amount: payAmount };
    else if (
      (basis === "per-mile" || basis === "per_mile") &&
      payAmount !== undefined
    ) {
      pay = { basis: "per-mile", rate: payAmount };
    } else if (
      basis !== "" &&
      basis !== "flat" &&
      basis !== "per-mile" &&
      basis !== "per_mile"
    ) {
      problems.push(`pay_basis "${basis}" must be flat or per-mile`);
    }
    const pickup = { earliest: time("pickup_earliest"), latest: time("pickup_latest") };
    const delivery = {
      earliest: time("delivery_earliest"),
      latest: time("delivery_latest"),
    };

    if (
      problems.length > 0 ||
      !origin ||
      !destination ||
      weightLbs === undefined ||
      !pay
    ) {
      errors.push({
        row: rowNo,
        message: [...new Set(problems)].join("; ") || "incomplete row",
      });
      return;
    }
    seenIds.add(id);
    const notes = get("notes");
    items.push({
      id,
      tenantId: opts.tenantId,
      origin,
      destination,
      commodity: {
        name: get("commodity"),
        class: get("commodity_class").toLowerCase(),
      },
      weightLbs,
      ...(volumeCuYd !== undefined ? { volumeCuYd } : {}),
      pay,
      pickup,
      delivery,
      equipmentTypes: list("equipment"),
      source: {
        kind: "csv",
        row: rowNo,
        ...(opts.fileName ? { fileName: opts.fileName } : {}),
      },
      ...(notes ? { notes } : {}),
    });
  });
  return { items, errors };
}

/** Parse a fleet's trucks from CSV — the same rules as loads. */
export function importTrucksCsv(
  text: string,
  opts: { tenantId: string; resolvePlace: PlaceResolver },
): CsvImportResult<Truck> {
  const parsed = readCsv(text, TRUCK_REQUIRED);
  if ("error" in parsed)
    return { items: [], errors: [{ row: 1, message: parsed.error }] };
  const { header, rows } = parsed;
  const errors: CsvImportResult<Truck>["errors"] = [];
  const items: Truck[] = [];
  const seenIds = new Set<string>();

  rows.forEach((cells, i) => {
    const rowNo = i + 2;
    const { problems, get, num, place, time, list } = rowReader(
      header,
      cells,
      opts.resolvePlace,
    );
    for (const c of TRUCK_REQUIRED) if (get(c) === "") problems.push(`${c} is blank`);

    const id = get("id");
    if (id !== "" && seenIds.has(id)) problems.push(`duplicate id "${id}"`);
    const home = place("home");
    const currentLocation = place("current_location");
    const weightLbs = num("weight_lbs");
    const volumeCuYd = num("volume_cu_yd", true);
    const maxDeadheadMiles = num("max_deadhead_mi");
    const serviceRadiusMiles = num("service_radius_mi");
    const costAmount = num("driver_cost");
    const basis = get("driver_cost_basis").toLowerCase().replace("_", "-");
    let driverCost: DriverCost | undefined;
    if ((basis === "per-mile" || basis === "per-day") && costAmount !== undefined) {
      driverCost = { basis, amount: costAmount };
    } else if (basis !== "" && basis !== "per-mile" && basis !== "per-day") {
      problems.push(`driver_cost_basis "${basis}" must be per-mile or per-day`);
    }
    const availability = {
      earliest: time("available_from"),
      latest: time("available_until"),
    };
    const dedicatedRaw = get("dedicated_lane_only").toLowerCase();
    if (
      !["", "yes", "no", "true", "false", "y", "n", "1", "0"].includes(dedicatedRaw)
    ) {
      problems.push(`dedicated_lane_only "${dedicatedRaw}" must be yes or no`);
    }
    const dedicated = ["yes", "true", "y", "1"].includes(dedicatedRaw);

    if (
      problems.length > 0 ||
      !home ||
      !currentLocation ||
      weightLbs === undefined ||
      maxDeadheadMiles === undefined ||
      serviceRadiusMiles === undefined ||
      !driverCost
    ) {
      errors.push({
        row: rowNo,
        message: [...new Set(problems)].join("; ") || "incomplete row",
      });
      return;
    }
    seenIds.add(id);
    const exclude = list("exclude_commodities");
    const include = list("include_commodities");
    const reason = get("restriction_reason");
    const note = get("dedicated_lane_note");
    items.push({
      id,
      tenantId: opts.tenantId,
      name: get("name"),
      equipmentType: get("equipment").toLowerCase(),
      capacity: { weightLbs, ...(volumeCuYd !== undefined ? { volumeCuYd } : {}) },
      ...(exclude.length || include.length
        ? {
            commodityRestrictions: {
              ...(exclude.length ? { exclude } : {}),
              ...(include.length ? { include } : {}),
              ...(reason ? { reason } : {}),
            },
          }
        : {}),
      home,
      currentLocation,
      availability,
      maxDeadheadMiles,
      serviceRadiusMiles,
      driverCost,
      ...(dedicated ? { dedicatedLaneOnly: true } : {}),
      ...(note ? { dedicatedLaneNote: note } : {}),
    });
  });
  return { items, errors };
}
