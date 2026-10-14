// The Lead Board's filtering and sorting. Browser-safe: it imports only the
// display labels from the scanner package, never the engine, so the board
// filters and sorts instantly without a round trip.

import { LEAD_STAGES } from "@hl-bos/presence-scanner/labels";
import type {
  LeadStage,
  QualificationStatus,
  Vertical,
  WebsiteStatus,
} from "@hl-bos/presence-scanner";

export interface LeadRow {
  id: string;
  name: string;
  location: string;
  market: string;
  vertical: Vertical;
  score: number;
  checkedMax: number;
  websiteStatus: WebsiteStatus;
  /** Google figures are attributed to Google Maps wherever shown. */
  rating: number | undefined;
  reviews: number | undefined;
  ratingSource: "Google Maps" | "imported" | undefined;
  topFindings: string[];
  qualification: QualificationStatus;
  overridden: boolean;
  stage: LeadStage;
  lastScannedAt: string;
}

export interface LeadFilters {
  market?: string;
  vertical?: string;
  minScore?: number;
  maxScore?: number;
  websiteStatus?: string;
  stage?: string;
  qualification?: string;
  /** ISO date (YYYY-MM-DD): last scanned on or after. */
  scannedSince?: string;
}

export type SortKey =
  "score" | "name" | "rating" | "reviews" | "lastScannedAt" | "stage";

export function filterLeads(rows: LeadRow[], f: LeadFilters): LeadRow[] {
  return rows.filter(
    (r) =>
      (!f.market || r.market === f.market) &&
      (!f.vertical || r.vertical === f.vertical) &&
      (f.minScore === undefined || r.score >= f.minScore) &&
      (f.maxScore === undefined || r.score <= f.maxScore) &&
      (!f.websiteStatus || r.websiteStatus === f.websiteStatus) &&
      (!f.stage || r.stage === f.stage) &&
      (!f.qualification || r.qualification === f.qualification) &&
      (!f.scannedSince || r.lastScannedAt.slice(0, 10) >= f.scannedSince),
  );
}

const STAGE_ORDER = new Map(LEAD_STAGES.map((s, i) => [s.key, i]));

export function sortLeads(
  rows: LeadRow[],
  key: SortKey,
  dir: "asc" | "desc",
): LeadRow[] {
  const val = (r: LeadRow): number | string => {
    switch (key) {
      case "score":
        return r.score;
      case "name":
        return r.name.toLowerCase();
      case "rating":
        return r.rating ?? -1;
      case "reviews":
        return r.reviews ?? -1;
      case "lastScannedAt":
        return r.lastScannedAt;
      case "stage":
        return STAGE_ORDER.get(r.stage) ?? 99;
    }
  };
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    return (x < y ? -1 : x > y ? 1 : 0) * sign || a.name.localeCompare(b.name);
  });
}

/** Lead Board filters from a URL query (the export links carry the board's filters). */
export function filtersFromParams(q: URLSearchParams): LeadFilters {
  const s = (k: string) => q.get(k)?.trim() || undefined;
  const n = (k: string) => {
    const v = s(k);
    if (v === undefined) return undefined;
    const x = Number(v);
    return Number.isFinite(x) ? x : undefined;
  };
  const f: LeadFilters = {};
  const set = <K extends keyof LeadFilters>(k: K, v: LeadFilters[K] | undefined) => {
    if (v !== undefined) f[k] = v;
  };
  set("market", s("market"));
  set("vertical", s("vertical"));
  set("minScore", n("minScore"));
  set("maxScore", n("maxScore"));
  set("websiteStatus", s("websiteStatus"));
  set("stage", s("stage"));
  set("qualification", s("qualification"));
  const since = s("scannedSince");
  set("scannedSince", since && /^\d{4}-\d{2}-\d{2}$/.test(since) ? since : undefined);
  return f;
}

/** The inverse, for building export links from the board's current filters. */
export function filtersToParams(f: LeadFilters): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(f))
    if (v !== undefined && v !== "") q.set(k, String(v));
  return q.toString();
}
