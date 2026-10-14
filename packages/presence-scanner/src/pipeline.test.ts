import { describe, expect, it } from "vitest";

import {
  runMarketScan,
  rescanProspect,
  validateRequest,
  type ScanDeps,
} from "./pipeline.ts";
import { correctField, overrideQualification } from "./prospect-ops.ts";
import { createGooglePlacesClient, type FetchLike } from "./places.ts";
import { effectiveQualification } from "./qualify.ts";
import { MemoryRepository } from "./repository.ts";
import { transitionStage } from "./stages.ts";
import {
  fakeEgress,
  NOW,
  STRONG_SALON_HTML,
  WEAK_CONTRACTOR_HTML,
} from "./test-helpers.ts";
import type { ScanRequest } from "./types.ts";

let n = 0;
const deps = (o: Partial<ScanDeps> = {}): ScanDeps => ({
  places: null,
  egress: fakeEgress({
    "smithroofing.example": { body: WEAK_CONTRACTOR_HTML },
    "bella.example": { body: STRONG_SALON_HTML },
  }),
  now: () => NOW,
  newId: () => `id-${++n}`,
  existing: [],
  actor: "test",
  ...o,
});

const importReq = (text: string, o: Partial<ScanRequest> = {}): ScanRequest => ({
  market: "West Seneca and Orchard Park",
  zip: undefined,
  radiusMiles: 10,
  vertical: "contractor",
  maxResults: 20,
  searchTerms: undefined,
  source: "import",
  importText: text,
  ...o,
});

const SAMPLE = [
  "name,website,phone,address",
  "Smith Roofing,smithroofing.example,716-555-0101,12 Main St",
  "Jones Plumbing,none,716-555-0102,9 Union Rd",
  "Seneca Paving,https://www.facebook.com/senecapaving,716-555-0103,50 Center Rd",
  "Smith Roofing LLC,http://www.smithroofing.example/contact,,", // duplicate by domain
  "Ridge Electric,ridge-electric-lapsed.example,716-555-0104,",
  "SERVPRO of West Seneca,servpro.example,716-555-0105,",
].join("\n");

describe("request validation", () => {
  it("names each problem in plain English", () => {
    expect(validateRequest(importReq("x", { maxResults: 0 }))[0]).toContain(
      "between 1 and 60",
    );
    expect(validateRequest(importReq("x", { radiusMiles: 80 }))[0]).toContain(
      "between 1 and 50",
    );
    expect(validateRequest(importReq("x", { zip: "142" }))[0]).toContain("5 digits");
    expect(validateRequest(importReq("   "))[0]).toContain("Paste at least one");
    expect(
      validateRequest(
        importReq("", { source: "google_places", market: "", zip: undefined }),
      )[0],
    ).toContain("market");
  });
});

describe("pasted-list mode (no Google key)", () => {
  it("runs end to end: dedupe, inspect, qualify, score, rank", async () => {
    const { run, prospects } = await runMarketScan(importReq(SAMPLE), deps());
    expect(run.error).toBeUndefined();
    expect(run.apiUsage).toBeUndefined();
    expect(run.counts).toMatchObject({ discovered: 6, duplicates: 1, unique: 5 });
    const by = (name: string) => prospects.find((p) => p.name.startsWith(name))!;

    expect(by("Jones").websiteStatus).toBe("none");
    expect(by("Seneca Paving").websiteStatus).toBe("social_only");
    expect(by("Smith").websiteStatus).toBe("ok");
    expect(by("Ridge").websiteStatus).toBe("unreachable");
    expect(effectiveQualification(by("SERVPRO").qualification)).toBe("excluded");
    expect(run.counts.excluded).toBe(1);
    expect(run.counts.inspected).toBe(3); // Smith (ok), Ridge (unreachable), SERVPRO (unreachable)

    // Ranked: qualified first, highest score first; the excluded chain last.
    expect(prospects.at(-1)!.name).toBe("SERVPRO of West Seneca");
    const scores = prospects.slice(0, -1).map((p) => p.score.total);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    // Imported leads have no Google data: those components are not checked, not zero.
    expect(
      by("Jones").score.components.find((c) => c.component === "profile")!.status,
    ).toBe("not_checked");
    expect(by("Jones").score.checkedMax).toBeLessThan(100);
    // Every finding carries a source and a date.
    for (const p of prospects)
      for (const f of p.findings) expect(f.observedAt).toBe(NOW.toISOString());
    // Suggested services, never prices.
    expect(by("Jones").services.length).toBeGreaterThan(0);
  });

  it("caps the import at the maximum-results setting and says so", async () => {
    const { run } = await runMarketScan(importReq(SAMPLE, { maxResults: 2 }), deps());
    expect(run.counts.discovered).toBe(2);
    expect(run.warnings.join(" ")).toContain("first 2 of 6");
  });

  it("reports unknown markets without failing the scan", async () => {
    const { run } = await runMarketScan(
      importReq("A | a.example", { market: "Atlantis" }),
      deps(),
    );
    expect(run.warnings.join(" ")).toContain("Market centre unknown");
    expect(run.error).toBeUndefined();
  });
});

describe("Google Places mode", () => {
  const placesFetch: FetchLike = (_u, init) => {
    const body = JSON.parse(init.body) as { textQuery: string };
    expect(body.textQuery).toBe("home improvement contractor in West Seneca 14224");
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          places: [
            {
              id: "P1",
              displayName: { text: "Smith Roofing" },
              primaryType: "roofing_contractor",
              businessStatus: "OPERATIONAL",
              nationalPhoneNumber: "(716) 555-0101",
              websiteUri: "http://smithroofing.example/",
              rating: 4.0,
              userRatingCount: 7,
              location: { latitude: 42.84, longitude: -78.75 },
              googleMapsUri: "https://maps.google.com/?cid=1",
            },
            {
              id: "P2",
              displayName: { text: "Quiet Masonry" },
              primaryType: "general_contractor",
              businessStatus: "OPERATIONAL",
              nationalPhoneNumber: "(716) 555-0111",
              location: { latitude: 42.83, longitude: -78.76 },
            },
            {
              id: "P3",
              displayName: { text: "Far Away Roofing" },
              primaryType: "roofing_contractor",
              businessStatus: "OPERATIONAL",
              nationalPhoneNumber: "(716) 555-0112",
              location: { latitude: 43.16, longitude: -77.61 }, // Rochester
            },
          ],
        }),
    });
  };
  const places = createGooglePlacesClient({ apiKey: "k", fetchImpl: placesFetch });
  const req: ScanRequest = {
    market: "West Seneca",
    zip: "14224",
    radiusMiles: 10,
    vertical: "contractor",
    maxResults: 10,
    searchTerms: undefined,
    source: "google_places",
    importText: undefined,
  };

  it("scores Google listings with evidence, records cost, applies the radius", async () => {
    const { run, prospects } = await runMarketScan(req, deps({ places }));
    expect(run.apiUsage).toMatchObject({
      requests: 1,
      sku: "Places API Text Search Enterprise",
    });
    expect(run.apiUsage!.estimatedCostUsd).toBeCloseTo(0.035, 6);
    const quiet = prospects.find((p) => p.name === "Quiet Masonry")!;
    expect(quiet.websiteStatus).toBe("none");
    expect(quiet.findings.find((f) => f.key === "website.exists")!.source).toBe(
      "google_places",
    );
    expect(
      quiet.score.components
        .find((c) => c.component === "profile")!
        .contributions.map((c) => c.ruleId),
    ).toEqual(["P.no_website", "P.no_hours", "P.no_photos"]);
    expect(
      quiet.score.components.find((c) => c.component === "reviews")!.contributions[0]!
        .ruleId,
    ).toBe("R.no_reviews");
    expect(quiet.places?.expiresAt).toBe(
      new Date(NOW.getTime() + 30 * 86_400_000).toISOString(),
    );
    expect(prospects[0]!.name).toBe("Quiet Masonry"); // no website ranks first
    const far = prospects.find((p) => p.name === "Far Away Roofing")!;
    expect(effectiveQualification(far.qualification)).toBe("excluded");
    expect(far.distanceMiles).toBeGreaterThan(50);
  });

  it("missing key: a clear message and nothing else happens", async () => {
    const { run, prospects } = await runMarketScan(req, deps({ places: null }));
    expect(run.error).toContain("Google Places is not connected");
    expect(run.error).toContain("paste a list");
    expect(prospects).toEqual([]);
  });

  it("a rescan updates the same leads, keeping stage, notes and overrides", async () => {
    const repo = new MemoryRepository(() => NOW);
    const first = await runMarketScan(req, deps({ places }));
    await repo.saveProspects(first.prospects);
    const smith = first.prospects.find((p) => p.name === "Smith Roofing")!;
    const moved = overrideQualification(
      transitionStage(smith, "reviewed", "Keith", "", NOW),
      "excluded",
      "Owner retiring",
      "Keith",
      NOW,
    );
    await repo.saveProspects([moved]);

    const second = await runMarketScan(
      req,
      deps({ places, existing: await repo.listProspects() }),
    );
    const again = second.prospects.find((p) => p.name === "Smith Roofing")!;
    expect(again.id).toBe(smith.id);
    expect(again.stage).toBe("reviewed");
    expect(effectiveQualification(again.qualification)).toBe("excluded");
    expect(again.scanIds).toHaveLength(2);
    expect(again.audit.map((a) => a.action)).toEqual([
      "created",
      "stage",
      "qualification_override",
      "rescanned",
    ]);
  });
});

describe("reviewer correction and rescan", () => {
  it("a corrected website is inspected on rescan and changes the score", async () => {
    const { prospects } = await runMarketScan(
      importReq("Bella Hair | none | 716-555-0102", { vertical: "salon_barber" }),
      deps(),
    );
    const before = prospects[0]!;
    expect(before.websiteStatus).toBe("none");
    const { prospect, needsRescan } = correctField(
      before,
      "website",
      "bella.example",
      "Keith",
      NOW,
    );
    expect(needsRescan).toBe(true);
    const after = await rescanProspect(prospect, deps());
    expect(after.websiteStatus).toBe("ok");
    expect(after.findings.find((f) => f.key === "website.exists")!.source).toBe(
      "reviewer",
    );
    expect(after.score.total).toBeLessThan(before.score.total);
    expect(after.id).toBe(before.id);
  });
});
