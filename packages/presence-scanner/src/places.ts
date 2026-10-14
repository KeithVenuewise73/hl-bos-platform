// Google Places API (New) -- Text Search, behind an adapter.
//
// Isolated on purpose: the scorer never sees an HTTP response, only the
// normalized PlaceRecord, so swapping or removing Google changes nothing else.
//
// BILLING (checked 2026-10-14 against Google's published SKU tables -- re-check
// before raising the cap). The field mask decides the SKU, and a request is
// billed at the HIGHEST tier any requested field belongs to. Phone, website,
// rating, review count and opening hours are "Text Search Enterprise" fields,
// so every request this adapter makes bills as Text Search Enterprise:
// US$35.00 per 1,000 requests at the first tier, with 1,000 free requests per
// month for that SKU. One request returns up to 20 places; Google returns at
// most 60 (three pages) for one query. Nothing from the Atmosphere tier
// (reviews text, amenities) is requested.
//
// STORAGE (Google Maps Platform terms and Places API policies, same date).
// Place IDs may be stored indefinitely. Latitude/longitude may be cached for at
// most 30 days. Other returned content has no caching exception, so this tool
// treats every Places field except the place ID as a temporary copy: it is
// stamped with an expiry 30 days out and purged on read after that
// (expirePlacesContent). Shown without a Google map, Places data must be
// attributed to "Google Maps" -- the Lead Board and Lead Card do so.
//
// It never scrapes Google search or Maps pages. It only calls the API, and only
// when a key is configured.

import { redact } from "../../../supabase/functions/_shared/ai/redact.ts";
import type { ApiUsage, PlaceRecord, PlacesSnapshot, Prospect } from "./types.ts";

export const PLACES_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";

/** Exactly the fields the scanner uses. Nothing else is requested. */
export const PLACES_FIELDS = [
  "places.id",
  "places.displayName",
  "places.primaryType",
  "places.primaryTypeDisplayName",
  "places.types",
  "places.formattedAddress",
  "places.location",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
  "places.regularOpeningHours",
  "places.photos",
] as const;

export const PLACES_PRICING = {
  sku: "Places API Text Search Enterprise",
  usdPer1000: 35,
  freeMonthlyRequests: 1000,
  checkedOn: "2026-10-14",
} as const;

/** Google's hard limits for one Text Search query. */
export const PLACES_PAGE_SIZE = 20;
export const PLACES_MAX_RESULTS = 60;

/** Days Places content (other than the place ID) is kept before purge. */
export const PLACES_RETENTION_DAYS = 30;

export const PLACES_KEY_ENV = "GOOGLE_PLACES_API_KEY";

export interface PlacesQuery {
  textQuery: string;
  centre: { lat: number; lon: number } | undefined;
  radiusMiles: number;
  maxResults: number;
}

export interface PlacesSearchResult {
  places: PlaceRecord[];
  usage: ApiUsage;
  /** Plain-English failure, if the search could not complete. */
  error: string | undefined;
}

export interface PlacesClient {
  searchText(q: PlacesQuery): Promise<PlacesSearchResult>;
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** What the console says when there is no key. The app still works. */
export function placesConfigMessage(hasKey: boolean): string {
  return hasKey
    ? "Google Places is connected. Scans call Google and are billed to the key's account."
    : "Google Places is not connected, so Google search is switched off. Everything else works: paste a list of businesses instead. Add a Google Places key on the Connections page to turn search on.";
}

export function usageFor(requests: number): ApiUsage {
  return {
    requests,
    sku: PLACES_PRICING.sku,
    estimatedCostUsd: Math.round(requests * PLACES_PRICING.usdPer1000 * 10) / 10000,
    note: `List price US$${PLACES_PRICING.usdPer1000} per 1,000 requests (checked ${PLACES_PRICING.checkedOn}); Google gives ${PLACES_PRICING.freeMonthlyRequests.toLocaleString("en-US")} free requests a month for this SKU, which this estimate does not subtract.`,
  };
}

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
const obj = (v: unknown): Record<string, unknown> | undefined =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;

/**
 * One raw Places (New) place object -> PlaceRecord. Unknown or malformed values
 * become undefined; nothing is filled in or guessed.
 */
export function normalizePlace(
  raw: unknown,
  requestedFields: readonly string[] = PLACES_FIELDS,
): PlaceRecord | undefined {
  const p = obj(raw);
  const placeId = str(p?.["id"]);
  if (!p || !placeId) return undefined;
  const loc = obj(p["location"]);
  const lat = num(loc?.["latitude"]);
  const lon = num(loc?.["longitude"]);
  const photos = p["photos"];
  const hours = obj(p["regularOpeningHours"]);
  const has = (f: string) => requestedFields.includes(`places.${f}`);
  return {
    placeId,
    name: str(obj(p["displayName"])?.["text"]),
    primaryType: str(p["primaryType"]),
    primaryTypeLabel: str(obj(p["primaryTypeDisplayName"])?.["text"]),
    types: Array.isArray(p["types"])
      ? p["types"].filter((t): t is string => typeof t === "string")
      : [],
    address: str(p["formattedAddress"]),
    phone: str(p["nationalPhoneNumber"]),
    website: str(p["websiteUri"]),
    mapsUrl: str(p["googleMapsUri"]),
    rating: num(p["rating"]),
    reviewCount: num(p["userRatingCount"]),
    businessStatus: str(p["businessStatus"]),
    // Requested-but-absent means Google has none on file; not requested means unknown.
    hasHours: hours ? true : has("regularOpeningHours") ? false : undefined,
    photoCount: Array.isArray(photos)
      ? Math.min(photos.length, 10)
      : has("photos")
        ? 0
        : undefined,
    location: lat !== undefined && lon !== undefined ? { lat, lon } : undefined,
    requestedFields: [...requestedFields],
  };
}

/**
 * The Google Places Text Search client. `fetchImpl` is injected so tests never
 * touch the network; the key is only ever placed in a request header and is
 * scrubbed from any error text that might echo it.
 */
export function createGooglePlacesClient(opts: {
  apiKey: string;
  fetchImpl: FetchLike;
}): PlacesClient {
  const { apiKey, fetchImpl } = opts;
  return {
    async searchText(q: PlacesQuery): Promise<PlacesSearchResult> {
      const target = Math.max(1, Math.min(q.maxResults, PLACES_MAX_RESULTS));
      const seen = new Set<string>();
      const places: PlaceRecord[] = [];
      let requests = 0;
      let pageToken: string | undefined;
      try {
        do {
          const body: Record<string, unknown> = {
            textQuery: q.textQuery,
            pageSize: Math.min(PLACES_PAGE_SIZE, target - places.length),
          };
          if (q.centre) {
            body["locationBias"] = {
              circle: {
                center: { latitude: q.centre.lat, longitude: q.centre.lon },
                // Google's maximum bias radius is 50 km.
                radius: Math.min(50_000, Math.round(q.radiusMiles * 1609.344)),
              },
            };
          }
          if (pageToken) body["pageToken"] = pageToken;
          requests++;
          const res = await fetchImpl(PLACES_ENDPOINT, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "X-Goog-Api-Key": apiKey,
              "X-Goog-FieldMask": [...PLACES_FIELDS, "nextPageToken"].join(","),
            },
            body: JSON.stringify(body),
          });
          const json = obj(await res.json().catch(() => undefined));
          if (!res.ok) {
            const message = str(obj(json?.["error"])?.["message"]) ?? "no detail";
            return {
              places,
              usage: usageFor(requests),
              error: redact(
                `Google Places refused the search (HTTP ${res.status}): ${message}`,
                [apiKey],
              ),
            };
          }
          const batch = Array.isArray(json?.["places"]) ? json["places"] : [];
          for (const raw of batch) {
            const rec = normalizePlace(raw);
            if (rec && !seen.has(rec.placeId) && places.length < target) {
              seen.add(rec.placeId);
              places.push(rec);
            }
          }
          pageToken = str(json?.["nextPageToken"]);
        } while (pageToken && places.length < target && requests < 3);
      } catch (e) {
        return {
          places,
          usage: usageFor(requests),
          error: redact(`Could not reach Google Places: ${String(e)}`, [apiKey]),
        };
      }
      return { places, usage: usageFor(requests), error: undefined };
    },
  };
}

export function placesSnapshot(record: PlaceRecord, now: Date): PlacesSnapshot {
  return {
    record,
    observedAt: now.toISOString(),
    expiresAt: new Date(
      now.getTime() + PLACES_RETENTION_DAYS * 86_400_000,
    ).toISOString(),
  };
}

const EXPIRED_LABELS: Record<string, string> = {
  "places.category": "Google category",
  "places.business_status": "Google status",
  "places.website": "Website on Google profile",
  "places.phone": "Phone on Google profile",
  "places.hours": "Opening hours on Google profile",
  "places.photos": "Photos on Google profile",
  "places.reviews": "Google reviews",
};

/**
 * Enforce the retention rule on a stored prospect: once its Places copy has
 * expired, drop everything Google supplied except the place ID -- the record
 * itself, and the Google values quoted in finding labels, evidence, score
 * explanations and qualification details. The score's points are kept (they
 * are HLG's own derived output) but explained generically, and the lead needs
 * a rescan to show Google data again.
 */
export function expirePlacesContent(p: Prospect, now: Date): Prospect {
  if (!p.places || new Date(p.places.expiresAt).getTime() > now.getTime()) return p;
  const purged = `purged after ${PLACES_RETENTION_DAYS} days (Google's storage rules); rescan to refresh`;
  const googleKeys = new Set(
    p.findings.filter((f) => f.source === "google_places").map((f) => f.key),
  );
  return {
    ...p,
    places: undefined,
    findings: p.findings.map((f) =>
      f.source === "google_places"
        ? {
            ...f,
            label: `${EXPIRED_LABELS[f.key] ?? "Google data"} (expired)`,
            status: "not_checked",
            evidence: `Google data from ${f.observedAt.slice(0, 10)} was ${purged}.`,
          }
        : f,
    ),
    score: {
      ...p.score,
      components: p.score.components.map((c) => ({
        ...c,
        contributions: c.contributions.map((x) =>
          x.findingKeys.every((k) => googleKeys.has(k))
            ? { ...x, label: `${x.ruleId}: Google listing gap (details ${purged})` }
            : x,
        ),
        note:
          c.component === "reviews" || c.component === "profile"
            ? `Scored from Google data that was later ${purged}.`
            : c.note,
      })),
    },
    qualification: {
      ...p.qualification,
      checks: p.qualification.checks.map((c) =>
        c.code === "operating" || c.code === "vertical"
          ? { ...c, detail: `Based on Google data that was later ${purged}.` }
          : c,
      ),
    },
  };
}
