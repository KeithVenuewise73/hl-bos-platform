// Where loads come from.
//
// Built today: manual entry (a `Load` object) and CSV import (below).
// NOT built: load-board integrations (DAT, Truckstop, 123Loadboard). The
// `LoadBoardAdapter` interface is the seam they will implement; there is no
// implementation and nothing in the app claims to fetch from a board.

import type { Load, Pay, Place } from "./types";

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

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export const CSV_COLUMNS = [
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

const REQUIRED = [
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

export interface CsvImportResult {
  loads: Load[];
  /** One entry per rejected row. A bad row never becomes a load with guessed values. */
  errors: { row: number; message: string }[];
}

/**
 * Parse loads from CSV. `places` resolves origin/destination names that come
 * without coordinates; a place that is neither known nor given coordinates is
 * an error for that row — never a guessed location.
 */
export function importLoadsCsv(
  text: string,
  opts: { tenantId: string; places: readonly Place[]; fileName?: string },
): CsvImportResult {
  const rows = parseCsv(text);
  const errors: CsvImportResult["errors"] = [];
  const loads: Load[] = [];
  const header = rows[0]?.map((h) => h.trim().toLowerCase());
  if (!header) return { loads, errors: [{ row: 1, message: "The file is empty." }] };
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    return {
      loads,
      errors: [{ row: 1, message: `Missing column(s): ${missing.join(", ")}.` }],
    };
  }
  const byName = new Map(opts.places.map((p) => [p.name.toLowerCase(), p]));
  const seenIds = new Set<string>();

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r] ?? [];
    const rowNo = r + 1;
    const get = (col: string) => {
      const idx = header.indexOf(col);
      return idx >= 0 ? (cells[idx] ?? "").trim() : "";
    };
    const problems: string[] = [];
    for (const c of REQUIRED) if (get(c) === "") problems.push(`${c} is blank`);

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
    const place = (prefix: "origin" | "destination"): Place | undefined => {
      const name = get(prefix);
      const lat = get(`${prefix}_lat`);
      const lon = get(`${prefix}_lon`);
      if (lat !== "" && lon !== "") {
        const la = Number(lat);
        const lo = Number(lon);
        if (
          !Number.isFinite(la) ||
          !Number.isFinite(lo) ||
          Math.abs(la) > 90 ||
          Math.abs(lo) > 180
        ) {
          problems.push(`${prefix} coordinates are invalid`);
          return undefined;
        }
        return { name, lat: la, lon: lo };
      }
      const known = byName.get(name.toLowerCase());
      if (!known) {
        if (name !== "") {
          problems.push(
            `${prefix} "${name}" is not a known place — add ${prefix}_lat and ${prefix}_lon`,
          );
        }
        return undefined;
      }
      return known;
    };
    const time = (col: string): string => {
      const v = get(col);
      if (v !== "" && Number.isNaN(Date.parse(v)))
        problems.push(`${col} "${v}" is not a date-time`);
      return v;
    };

    const id = get("id");
    if (id !== "" && seenIds.has(id)) problems.push(`duplicate id "${id}"`);
    const origin = place("origin");
    const destination = place("destination");
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
    } else if (basis !== "")
      problems.push(`pay_basis "${basis}" must be flat or per-mile`);
    const pickup = { earliest: time("pickup_earliest"), latest: time("pickup_latest") };
    const delivery = {
      earliest: time("delivery_earliest"),
      latest: time("delivery_latest"),
    };
    const equipmentTypes = get("equipment")
      .split("|")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

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
      continue;
    }
    seenIds.add(id);
    const notes = get("notes");
    loads.push({
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
      equipmentTypes,
      source: {
        kind: "csv",
        row: rowNo,
        ...(opts.fileName ? { fileName: opts.fileName } : {}),
      },
      ...(notes ? { notes } : {}),
    });
  }
  return { loads, errors };
}
