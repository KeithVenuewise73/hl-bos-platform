import { describe, expect, it } from "vitest";

import {
  createGooglePlacesClient,
  expirePlacesContent,
  normalizePlace,
  PLACES_FIELDS,
  placesConfigMessage,
  placesSnapshot,
  usageFor,
  type FetchLike,
} from "./places.ts";
import type { Prospect } from "./types.ts";
import { NOW } from "./test-helpers.ts";

const RAW = {
  id: "ChIJ123",
  displayName: { text: "Smith Roofing", languageCode: "en" },
  primaryType: "roofing_contractor",
  primaryTypeDisplayName: { text: "Roofing contractor" },
  types: ["roofing_contractor", "point_of_interest"],
  formattedAddress: "12 Main St, West Seneca, NY 14224, USA",
  location: { latitude: 42.84, longitude: -78.79 },
  nationalPhoneNumber: "(716) 555-0101",
  websiteUri: "http://smithroofing.example/",
  googleMapsUri: "https://maps.google.com/?cid=1",
  rating: 4.1,
  userRatingCount: 12,
  businessStatus: "OPERATIONAL",
  regularOpeningHours: { openNow: true },
  photos: [{ name: "a" }, { name: "b" }],
};

describe("normalizePlace", () => {
  it("maps every field the scanner uses", () => {
    const p = normalizePlace(RAW)!;
    expect(p).toMatchObject({
      placeId: "ChIJ123",
      name: "Smith Roofing",
      primaryType: "roofing_contractor",
      primaryTypeLabel: "Roofing contractor",
      address: "12 Main St, West Seneca, NY 14224, USA",
      phone: "(716) 555-0101",
      website: "http://smithroofing.example/",
      mapsUrl: "https://maps.google.com/?cid=1",
      rating: 4.1,
      reviewCount: 12,
      businessStatus: "OPERATIONAL",
      hasHours: true,
      photoCount: 2,
      location: { lat: 42.84, lon: -78.79 },
    });
  });

  it("records requested-but-absent fields as absent, never invents them", () => {
    const p = normalizePlace({ id: "X", displayName: { text: "Bare" } })!;
    expect(p.website).toBeUndefined();
    expect(p.phone).toBeUndefined();
    expect(p.rating).toBeUndefined();
    expect(p.reviewCount).toBeUndefined();
    // Requested in the mask and not returned -> Google has none on file.
    expect(p.hasHours).toBe(false);
    expect(p.photoCount).toBe(0);
  });

  it("leaves fields that were not requested unknown", () => {
    const p = normalizePlace({ id: "X" }, ["places.id"])!;
    expect(p.hasHours).toBeUndefined();
    expect(p.photoCount).toBeUndefined();
  });

  it("rejects malformed values and records without an id", () => {
    expect(normalizePlace({ displayName: { text: "No id" } })).toBeUndefined();
    expect(normalizePlace(null)).toBeUndefined();
    const p = normalizePlace({
      id: "X",
      rating: "4.9",
      userRatingCount: NaN,
      types: [1, "bar"],
    })!;
    expect(p.rating).toBeUndefined();
    expect(p.reviewCount).toBeUndefined();
    expect(p.types).toEqual(["bar"]);
  });

  it("caps photo count at Google's 10", () => {
    const p = normalizePlace({
      id: "X",
      photos: Array.from({ length: 10 }, () => ({})),
    })!;
    expect(p.photoCount).toBe(10);
  });
});

function fakeFetch(pages: unknown[], status = 200) {
  const calls: { headers: Record<string, string>; body: Record<string, unknown> }[] =
    [];
  const fn: FetchLike = (_url, init) => {
    calls.push({
      headers: init.headers,
      body: JSON.parse(init.body) as Record<string, unknown>,
    });
    const page = pages[calls.length - 1] ?? { places: [] };
    return Promise.resolve({
      ok: status === 200,
      status,
      json: () => Promise.resolve(page),
    });
  };
  return { fn, calls };
}

describe("Google Places client", () => {
  it("sends the narrow field mask and the key only in a header", async () => {
    const { fn, calls } = fakeFetch([{ places: [RAW] }]);
    const client = createGooglePlacesClient({
      apiKey: "test-places-key-not-real",
      fetchImpl: fn,
    });
    const res = await client.searchText({
      textQuery: "roofer in West Seneca",
      centre: { lat: 42.8, lon: -78.8 },
      radiusMiles: 10,
      maxResults: 5,
    });
    expect(res.places).toHaveLength(1);
    expect(calls[0]!.headers["X-Goog-FieldMask"]).toBe(
      [...PLACES_FIELDS, "nextPageToken"].join(","),
    );
    expect(calls[0]!.headers["X-Goog-FieldMask"]).not.toContain("reviews");
    expect(JSON.stringify(calls[0]!.body)).not.toContain("test-places-key");
    expect(calls[0]!.headers["X-Goog-Api-Key"]).toBe("test-places-key-not-real");
    expect(calls[0]!.body["pageSize"]).toBe(5);
    expect(calls[0]!.body["locationBias"]).toEqual({
      circle: { center: { latitude: 42.8, longitude: -78.8 }, radius: 16093 },
    });
  });

  it("pages up to the cap, de-duplicates by place ID, and counts every request", async () => {
    const mk = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ ...RAW, id: `P${i}` }));
    const { fn, calls } = fakeFetch([
      { places: mk(20), nextPageToken: "t1" },
      {
        places: [...mk(20).slice(10), { ...RAW, id: "P20" }, { ...RAW, id: "P21" }],
        nextPageToken: "t2",
      },
      { places: mk(30) },
    ]);
    const client = createGooglePlacesClient({ apiKey: "k", fetchImpl: fn });
    const res = await client.searchText({
      textQuery: "q",
      centre: undefined,
      radiusMiles: 10,
      maxResults: 22,
    });
    expect(res.places.map((p) => p.placeId)).toEqual([
      ...mk(20).map((p) => p.id),
      "P20",
      "P21",
    ]);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.body["pageToken"]).toBe("t1");
    expect(calls[1]!.body["pageSize"]).toBe(2);
    expect(res.usage.requests).toBe(2);
    expect(calls[0]!.body["locationBias"]).toBeUndefined();
  });

  it("never asks for more than 60 results (three pages)", async () => {
    const page = { places: [], nextPageToken: "more" };
    const { fn, calls } = fakeFetch([page, page, page, page, page]);
    const client = createGooglePlacesClient({ apiKey: "k", fetchImpl: fn });
    await client.searchText({
      textQuery: "q",
      centre: undefined,
      radiusMiles: 10,
      maxResults: 500,
    });
    expect(calls).toHaveLength(3);
    expect(calls[0]!.body["pageSize"]).toBe(20);
  });

  it("reports a refusal in plain English without echoing the key", async () => {
    const key = "secret-places-key-not-real";
    const { fn } = fakeFetch([{ error: { message: `API key ${key} not valid` } }], 400);
    const client = createGooglePlacesClient({ apiKey: key, fetchImpl: fn });
    const res = await client.searchText({
      textQuery: "q",
      centre: undefined,
      radiusMiles: 10,
      maxResults: 5,
    });
    expect(res.error).toContain("Google Places refused the search (HTTP 400)");
    expect(res.error).not.toContain(key);
    expect(res.usage.requests).toBe(1);
  });

  it("reports a network failure without throwing", async () => {
    const client = createGooglePlacesClient({
      apiKey: "k",
      fetchImpl: () => Promise.reject(new Error("ECONNRESET")),
    });
    const res = await client.searchText({
      textQuery: "q",
      centre: undefined,
      radiusMiles: 10,
      maxResults: 5,
    });
    expect(res.error).toContain("Could not reach Google Places");
    expect(res.places).toEqual([]);
  });
});

describe("configuration and cost", () => {
  it("explains a missing key and says the app still works", () => {
    const m = placesConfigMessage(false);
    expect(m).toContain("not connected");
    expect(m).toContain("paste a list");
  });

  it("estimates cost from the request count at the Enterprise list price", () => {
    expect(usageFor(3).estimatedCostUsd).toBeCloseTo(0.105, 6);
    expect(usageFor(0).estimatedCostUsd).toBe(0);
    expect(usageFor(1).sku).toBe("Places API Text Search Enterprise");
  });
});

describe("retention", () => {
  const prospect = (): Prospect => {
    const record = normalizePlace(RAW)!;
    return {
      places: placesSnapshot(record, NOW),
      placeId: "ChIJ123",
      findings: [
        {
          key: "places.reviews",
          label: "r",
          status: "present",
          source: "google_places",
          observedAt: NOW.toISOString(),
          evidence: "e",
          confidence: "high",
        },
        {
          key: "site.title",
          label: "t",
          status: "present",
          source: "website",
          observedAt: NOW.toISOString(),
          evidence: "e",
          confidence: "high",
        },
      ],
      score: {
        version: "v",
        total: 9,
        checkedMax: 15,
        components: [
          {
            component: "reviews",
            label: "Reviews",
            max: 15,
            awarded: 9,
            status: "scored",
            contributions: [
              {
                ruleId: "R.very_few_reviews",
                label: "Fewer than 10 reviews (3)",
                points: 9,
                findingKeys: ["places.reviews"],
              },
            ],
            note: "3 reviews",
          },
        ],
      },
      qualification: {
        computed: "qualified",
        override: undefined,
        checks: [
          {
            code: "vertical",
            label: "v",
            outcome: "pass",
            detail: 'Google category "roofing_contractor"',
          },
        ],
      },
    } as unknown as Prospect;
  };

  it("keeps Google content for 30 days", () => {
    const p = prospect();
    const later = new Date(NOW.getTime() + 29 * 86_400_000);
    expect(expirePlacesContent(p, later)).toBe(p);
  });

  it("purges everything but the place ID after 30 days", () => {
    const later = new Date(NOW.getTime() + 31 * 86_400_000);
    const p = expirePlacesContent(prospect(), later);
    expect(p.places).toBeUndefined();
    expect(p.placeId).toBe("ChIJ123");
    expect(p.findings[0]!.status).toBe("not_checked");
    expect(p.findings[0]!.evidence).toContain("purged");
    expect(p.findings[1]!.status).toBe("present");
    expect(p.findings[0]!.label).toBe("Google reviews (expired)");
    // No Google value survives anywhere in the stored lead.
    const json = JSON.stringify({ ...p, placeId: undefined });
    expect(json).not.toContain("(3)");
    expect(json).not.toContain("roofing_contractor");
    expect(p.score.total).toBe(9);
  });
});
