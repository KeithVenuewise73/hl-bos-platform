// National place resolution — SERVER-SIDE ONLY.
//
// Turns what a dispatcher or a load board actually writes into a Place:
//
//   "14510"            5-digit US ZIP (ZIP+4 accepted, the +4 is ignored)
//   "Buffalo, NY"      city + state code; "Buffalo NY" and "Buffalo, New York" too
//   "Buffalo, NY 14203" city + ZIP — the ZIP wins, it is more precise
//   "42.886, -78.878"  raw latitude, longitude
//
// Data: the `zipcodes` package (42,555 US ZIPs with city, state and
// coordinates). A city's point is the MEDIAN of its ZIPs, which keeps one
// far-flung PO-box ZIP from dragging a city across the county. Military
// (APO/FPO) codes carry no coordinates and are excluded.
//
// Anything that does not resolve is an error with a reason — never a guess.
// This module loads ~5 MB of data: import it from route handlers and scripts,
// never from a client component. It is a separate entry point
// ("@hl-bos/dispatch-match/places") so the engine itself stays small.

import zipData from "zipcodes/lib/codes.js";
import stateData from "zipcodes/lib/states.js";
import type { Place } from "./types";

export type PlaceResolution =
  | { ok: true; place: Place; matchedBy: "zip" | "city" | "coordinates" }
  | { ok: false; error: string };

interface CityPoint {
  city: string;
  state: string;
  lat: number;
  lon: number;
  zips: number;
}

let zipIndex: Map<
  string,
  { city: string; state: string; lat: number; lon: number }
> | null = null;
let cityIndex: Map<string, CityPoint> | null = null;
let stateNames: Map<string, string> | null = null;

/** Lower-case, strip punctuation, and fold the abbreviations US place names use both ways. */
export function normalizeCity(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/[-–]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map(
      (w) =>
        ({ st: "saint", ste: "sainte", ft: "fort", mt: "mount", pt: "port" })[w] ?? w,
    )
    .join(" ");
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

function load() {
  if (zipIndex && cityIndex && stateNames) return { zipIndex, cityIndex, stateNames };
  const zips = new Map<
    string,
    { city: string; state: string; lat: number; lon: number }
  >();
  const grouped = new Map<
    string,
    { city: string; state: string; lats: number[]; lons: number[] }
  >();
  for (const r of Object.values(zipData.codes)) {
    if (r.country !== "US") continue;
    // APO/FPO and a few others are recorded at 0,0 — not a place a truck goes.
    if (!Number.isFinite(r.latitude) || !Number.isFinite(r.longitude)) continue;
    if (r.latitude === 0 && r.longitude === 0) continue;
    zips.set(r.zip, {
      city: r.city,
      state: r.state,
      lat: r.latitude,
      lon: r.longitude,
    });
    const key = `${normalizeCity(r.city)}|${r.state}`;
    const g = grouped.get(key) ?? { city: r.city, state: r.state, lats: [], lons: [] };
    g.lats.push(r.latitude);
    g.lons.push(r.longitude);
    grouped.set(key, g);
  }
  const cities = new Map<string, CityPoint>();
  for (const [key, g] of grouped) {
    cities.set(key, {
      city: g.city,
      state: g.state,
      lat: Math.round(median(g.lats) * 1e4) / 1e4,
      lon: Math.round(median(g.lons) * 1e4) / 1e4,
      zips: g.lats.length,
    });
  }
  const names = new Map<string, string>();
  for (const [full, code] of Object.entries(stateData.full)) {
    names.set(full.toLowerCase(), code);
    names.set(code.toLowerCase(), code);
  }
  zipIndex = zips;
  cityIndex = cities;
  stateNames = names;
  return { zipIndex, cityIndex, stateNames };
}

/** How many US ZIPs and cities are resolvable — shown in the UI so the claim is checkable. */
export function gazetteerSize(): { zips: number; cities: number } {
  const { zipIndex: z, cityIndex: c } = load();
  return { zips: z.size, cities: c.size };
}

const titleCase = (s: string) =>
  s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());

export function resolvePlace(input: string): PlaceResolution {
  const text = input.trim();
  if (text === "") return { ok: false, error: "Location is blank." };
  const { zipIndex: zips, cityIndex: cities, stateNames: states } = load();

  // "lat, lon"
  const coord = /^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/.exec(text);
  if (coord) {
    const lat = Number(coord[1]);
    const lon = Number(coord[2]);
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return { ok: false, error: `"${text}" is not a valid latitude, longitude.` };
    }
    return { ok: true, matchedBy: "coordinates", place: { name: text, lat, lon } };
  }

  // A ZIP anywhere in the text wins: it is the most precise thing given.
  const zipMatch = /\b(\d{5})(?:-\d{4})?\s*$/.exec(text);
  if (zipMatch) {
    const zip = zipMatch[1]!;
    const z = zips.get(zip);
    if (!z) return { ok: false, error: `ZIP ${zip} is not in the US ZIP dataset.` };
    const city = titleCase(z.city);
    return {
      ok: true,
      matchedBy: "zip",
      place: {
        name: `${city}, ${z.state} ${zip}`,
        lat: z.lat,
        lon: z.lon,
        region: `${city}, ${z.state}`,
      },
    };
  }

  // "City, ST" / "City ST" / "City, State Name"
  let city: string | undefined;
  let state: string | undefined;
  const comma = text.lastIndexOf(",");
  if (comma > 0) {
    city = text.slice(0, comma);
    state = states.get(
      text
        .slice(comma + 1)
        .trim()
        .toLowerCase(),
    );
  } else {
    const m = /^(.*\S)\s+([A-Za-z]{2})$/.exec(text);
    if (m) {
      city = m[1];
      state = states.get(m[2]!.toLowerCase());
    }
  }
  if (!city || !state) {
    return {
      ok: false,
      error: `"${text}" needs a state — write it as "City, ST" (e.g. "Dallas, TX"), a 5-digit ZIP, or "lat, lon".`,
    };
  }
  const hit = cities.get(`${normalizeCity(city)}|${state}`);
  if (!hit) {
    return {
      ok: false,
      error: `No US city called "${city.trim()}" in ${state}. Try its ZIP code.`,
    };
  }
  const name = `${titleCase(hit.city)}, ${hit.state}`;
  return {
    ok: true,
    matchedBy: "city",
    place: { name, lat: hit.lat, lon: hit.lon, region: name },
  };
}
