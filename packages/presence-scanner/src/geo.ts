// Market geography, reusing hl-jobscout's approach: resolve a ZIP or town to a
// centre from USPS data (a lookup, never a guess), and measure straight-line
// miles. A market that cannot be resolved is reported as such -- the scan
// still runs, but without a radius.

import { PLACE_COORDS, ZIP_COORDS } from "./gazetteer-wny.ts";

export interface LatLon {
  lat: number;
  lon: number;
}

/** Great-circle distance in miles (same formula as hl-jobscout geo.ts). */
export function distanceMiles(a: LatLon, b: LatLon): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export interface MarketCentre {
  centre: LatLon | undefined;
  /** How the centre was found, in plain English. */
  resolvedBy: string;
}

/**
 * Centre of a market. A ZIP wins (exact); otherwise each town named in the
 * market text ("West Seneca and Orchard Park") is looked up and averaged.
 */
export function resolveMarket(market: string, zip: string | undefined): MarketCentre {
  const z = zip?.trim().slice(0, 5);
  if (z && ZIP_COORDS[z]) {
    const [lat, lon] = ZIP_COORDS[z];
    return { centre: { lat, lon }, resolvedBy: `ZIP ${z}` };
  }
  const towns = market
    .toLowerCase()
    .replace(/,?\s*\b(ny|new york)\b\.?/g, "")
    .split(/\s*(?:,|\band\b|&|\/|;)\s*/)
    .map((t) => t.trim())
    .filter(Boolean);
  const found: { name: string; at: readonly [number, number] }[] = [];
  for (const t of towns) {
    const at = PLACE_COORDS[`${t}|NY`];
    if (at) found.push({ name: t, at });
  }
  if (found.length === 0) {
    return {
      centre: undefined,
      resolvedBy: z
        ? `ZIP ${z} and "${market}" are outside the Western New York lookup`
        : `"${market}" is not in the Western New York lookup`,
    };
  }
  const lat = found.reduce((s, f) => s + f.at[0], 0) / found.length;
  const lon = found.reduce((s, f) => s + f.at[1], 0) / found.length;
  return {
    centre: { lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4 },
    resolvedBy: `town${found.length > 1 ? "s" : ""}: ${found.map((f) => f.name).join(", ")}`,
  };
}
