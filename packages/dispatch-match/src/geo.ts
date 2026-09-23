// Distance.
//
// There is no routing API in this build. Road miles are ESTIMATED as
// great-circle distance × a circuity factor (1.2 is a common planning figure
// for the US highway network). The UI labels every mile figure "est.".
//
// `DistanceProvider` is the seam: a PC*MILER / Google / HERE adapter replaces
// the estimator without touching the engine.

import type { Place } from "./types";

export interface DistanceProvider {
  roadMiles(from: Place, to: Place): number;
}

const EARTH_RADIUS_MILES = 3958.8;

export function greatCircleMiles(a: Place, b: Place): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function estimatedRoadDistance(circuityFactor: number): DistanceProvider {
  return {
    roadMiles: (from, to) => Math.round(greatCircleMiles(from, to) * circuityFactor),
  };
}
