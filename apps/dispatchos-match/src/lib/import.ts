// Server-side import. Locations resolve through the national US resolver,
// which carries ~5 MB of ZIP data — that is why this runs on the server and
// the browser only ever receives the resolved trucks and loads.

import {
  importLoadsCsv,
  importTrucksCsv,
  type Load,
  type Truck,
} from "@hl-bos/dispatch-match";
import { SAMPLE_FLEETS } from "@hl-bos/dispatch-match/demo";
import { resolvePlace, type PlaceResolution } from "@hl-bos/dispatch-match/places";

import { OWN_FLEET_TENANT } from "./fleets";

export { OWN_FLEET_TENANT };
export const MAX_CSV_BYTES = 1_000_000;
export const MAX_ROWS = 5_000;

const ALLOWED_TENANTS = new Set([
  OWN_FLEET_TENANT,
  ...SAMPLE_FLEETS.map((f) => f.tenantId),
]);

export type ImportResponse =
  | {
      ok: true;
      kind: "loads";
      loads: Load[];
      errors: { row: number; message: string }[];
    }
  | {
      ok: true;
      kind: "trucks";
      trucks: Truck[];
      errors: { row: number; message: string }[];
    }
  | { ok: false; error: string };

export function handleImport(body: unknown): ImportResponse {
  if (typeof body !== "object" || body === null)
    return { ok: false, error: "Expected a JSON body." };
  const { kind, text, tenantId } = body as Record<string, unknown>;
  if (kind !== "loads" && kind !== "trucks")
    return { ok: false, error: 'kind must be "loads" or "trucks".' };
  if (typeof text !== "string" || text.trim() === "")
    return { ok: false, error: "Nothing to import." };
  if (text.length > MAX_CSV_BYTES) {
    return {
      ok: false,
      error: `That is more than ${MAX_CSV_BYTES.toLocaleString("en-US")} characters. Split it up.`,
    };
  }
  if ((text.match(/\n/g)?.length ?? 0) > MAX_ROWS) {
    return {
      ok: false,
      error: `That is more than ${MAX_ROWS.toLocaleString("en-US")} rows. Split it up.`,
    };
  }
  if (typeof tenantId !== "string" || !ALLOWED_TENANTS.has(tenantId)) {
    return { ok: false, error: "Unknown fleet." };
  }
  if (kind === "loads") {
    const r = importLoadsCsv(text, { tenantId, resolvePlace, fileName: "pasted" });
    return { ok: true, kind, loads: r.items, errors: r.errors };
  }
  const r = importTrucksCsv(text, { tenantId, resolvePlace });
  return { ok: true, kind, trucks: r.items, errors: r.errors };
}

export function handlePlaceLookup(q: string | null): PlaceResolution {
  if (q === null || q.length > 200) return { ok: false, error: "Type a location." };
  return resolvePlace(q);
}
