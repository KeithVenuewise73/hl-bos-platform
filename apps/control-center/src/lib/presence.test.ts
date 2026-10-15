import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createGooglePlacesClient,
  MemoryRepository,
  type FetchLike,
  type WebEgress,
} from "@hl-bos/presence-scanner";

import {
  filterLeads,
  filtersFromParams,
  filtersToParams,
  nextSort,
  sortLeads,
} from "./lead-board";
import {
  parseScanForm,
  reviewLead,
  startScan,
  toLeadRow,
  type PresenceDeps,
} from "./presence";

vi.mock("server-only", () => ({}));

const NOW = new Date("2026-10-14T15:00:00Z");

const PAGE = `<!doctype html><html><head><title>Home</title></head><body>
<h1>Smith Roofing</h1><p>Call 716-555-0101</p><footer>© 2019</footer></body></html>`;

/** Offline egress: smithroofing.example serves PAGE; nothing else resolves. */
const egress: WebEgress = {
  resolve: (h) =>
    h === "smithroofing.example" || h === "bella.example"
      ? Promise.resolve(["93.184.216.34"])
      : Promise.reject(new Error(`getaddrinfo ENOTFOUND ${h}`)),
  fetchPage: (u) =>
    Promise.resolve({
      status: 200,
      finalUrl: u,
      redirectChain: [],
      headers: { "content-type": "text/html" },
      body: PAGE,
      bytes: PAGE.length,
      contentType: "text/html",
    }),
  fetchRobots: () => Promise.resolve(undefined),
};

let n = 0;
const deps = (o: Partial<PresenceDeps> = {}): PresenceDeps => ({
  repo: new MemoryRepository(() => NOW),
  places: null,
  egress,
  now: () => NOW,
  newId: () => `id-${++n}`,
  actor: "operator",
  ...o,
});

const form = (o: Record<string, string>) => {
  const fd = new FormData();
  const base: Record<string, string> = {
    source: "import",
    market: "West Seneca and Orchard Park",
    zip: "14224",
    radius: "10",
    vertical: "contractor",
    maxResults: "20",
    ...o,
  };
  for (const [k, v] of Object.entries(base)) fd.set(k, v);
  return fd;
};

const SAMPLE = [
  "Smith Roofing | smithroofing.example | 716-555-0101",
  "Jones Plumbing | none | 716-555-0102",
  "Seneca Paving | https://facebook.com/senecapaving | 716-555-0103",
].join("\n");

describe("scan form", () => {
  it("reads a valid form", () => {
    const { request, errors } = parseScanForm(form({ importText: SAMPLE }));
    expect(errors).toEqual([]);
    expect(request).toMatchObject({
      source: "import",
      vertical: "contractor",
      radiusMiles: 10,
      maxResults: 20,
      zip: "14224",
    });
  });

  it("refuses an unknown vertical and bad numbers in plain English", () => {
    expect(parseScanForm(form({ vertical: "casino", importText: "x" })).errors).toEqual(
      ["Choose a business vertical."],
    );
    expect(
      parseScanForm(form({ maxResults: "900", importText: "x" })).errors[0],
    ).toContain("between 1 and 60");
  });
});

describe("startScan (the Run scan button)", () => {
  it("pasted-list mode works with no Google key and stores the leads", async () => {
    const d = deps();
    const r = await startScan(form({ importText: SAMPLE }), d);
    expect(r.ok).toBe(true);
    expect(r.headline).toBe("Scan finished: 3 businesses scored.");
    expect(r.meaning).not.toContain("Google:");
    expect(await d.repo.listProspects()).toHaveLength(3);
    expect(await d.repo.listScans()).toHaveLength(1);
  });

  it("Google mode without a key says so clearly and stores nothing but the attempt", async () => {
    const d = deps();
    const r = await startScan(form({ source: "google_places" }), d);
    expect(r.ok).toBe(false);
    expect(r.meaning).toContain("Google Places is not connected");
    expect(await d.repo.listProspects()).toEqual([]);
  });

  it("Google mode with a key reports requests and cost", async () => {
    const fetchImpl: FetchLike = () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            places: [
              {
                id: "P1",
                displayName: { text: "Quiet Masonry" },
                primaryType: "general_contractor",
                businessStatus: "OPERATIONAL",
                nationalPhoneNumber: "(716) 555-0111",
              },
            ],
          }),
      });
    const r = await startScan(
      form({ source: "google_places" }),
      deps({ places: createGooglePlacesClient({ apiKey: "k", fetchImpl }) }),
    );
    expect(r.ok).toBe(true);
    expect(r.meaning).toContain("Google: 1 request, about US$0.04 at list price.");
  });

  it("a validation problem never runs a scan", async () => {
    const d = deps();
    const r = await startScan(form({ importText: "" }), d);
    expect(r.ok).toBe(false);
    expect(await d.repo.listScans()).toEqual([]);
  });
});

describe("reviewLead (the Lead Card controls)", () => {
  async function seeded() {
    const d = deps();
    await startScan(form({ importText: SAMPLE }), d);
    const jones = (await d.repo.listProspects()).find(
      (p) => p.name === "Jones Plumbing",
    )!;
    return { d, id: jones.id };
  }

  it("moves stages along allowed paths and refuses the rest", async () => {
    const { d, id } = await seeded();
    expect(
      (await reviewLead(id, { kind: "stage", to: "qualified", note: "" }, d)).headline,
    ).toBe("Moved to Qualified.");
    const back = await reviewLead(id, { kind: "stage", to: "new", note: "" }, d);
    expect(back.ok).toBe(false);
    expect(back.meaning).toContain("cannot move from Qualified to New");
    expect(
      (await reviewLead(id, { kind: "stage", to: "nonsense", note: "" }, d)).ok,
    ).toBe(false);
  });

  it("saves notes and overrides with an audit trail", async () => {
    const { d, id } = await seeded();
    expect((await reviewLead(id, { kind: "note", text: "Owner: Bob" }, d)).ok).toBe(
      true,
    );
    expect(
      (await reviewLead(id, { kind: "override", status: "excluded", note: "" }, d)).ok,
    ).toBe(false);
    expect(
      (
        await reviewLead(
          id,
          { kind: "override", status: "excluded", note: "Retiring" },
          d,
        )
      ).ok,
    ).toBe(true);
    expect((await reviewLead(id, { kind: "clear_override" }, d)).ok).toBe(true);
    const p = (await d.repo.getProspect(id))!;
    expect(p.audit.map((a) => a.action)).toEqual([
      "created",
      "note",
      "qualification_override",
      "qualification_override_cleared",
    ]);
  });

  it("a website correction re-inspects the site and re-scores", async () => {
    const { d, id } = await seeded();
    const before = (await d.repo.getProspect(id))!;
    const r = await reviewLead(
      id,
      { kind: "correct", field: "website", value: "bella.example" },
      d,
    );
    expect(r.ok).toBe(true);
    expect(r.headline).toBe("Corrected and re-inspected.");
    const after = (await d.repo.getProspect(id))!;
    expect(after.websiteStatus).toBe("ok");
    expect(after.score.total).not.toBe(before.score.total);
    expect(r.meaning).toContain(`was ${before.score.total}`);
  });

  it("refuses bad input and unknown leads without throwing", async () => {
    const { d, id } = await seeded();
    expect(
      (await reviewLead(id, { kind: "correct", field: "phone", value: "abc" }, d)).ok,
    ).toBe(false);
    expect(
      (await reviewLead(id, { kind: "correct", field: "address", value: "x" }, d)).ok,
    ).toBe(false);
    expect((await reviewLead("missing", { kind: "rescan" }, d)).headline).toBe(
      "That lead was not found.",
    );
  });
});

describe("Lead Board filtering and sorting", () => {
  async function rows() {
    const d = deps();
    await startScan(form({ importText: SAMPLE }), d);
    return (await d.repo.listProspects()).map(toLeadRow);
  }

  it("builds rows with the board's fields", async () => {
    const r = (await rows()).find((x) => x.name === "Jones Plumbing")!;
    expect(r).toMatchObject({
      websiteStatus: "none",
      qualification: "qualified",
      stage: "new",
      rating: undefined,
      ratingSource: undefined,
    });
    expect(r.topFindings.length).toBeGreaterThan(0);
  });

  it("filters by website status, score range, stage and scan date", async () => {
    const all = await rows();
    expect(
      filterLeads(all, { websiteStatus: "social_only" }).map((r) => r.name),
    ).toEqual(["Seneca Paving"]);
    const top = Math.max(...all.map((r) => r.score));
    expect(filterLeads(all, { minScore: top }).every((r) => r.score === top)).toBe(
      true,
    );
    expect(filterLeads(all, { stage: "client" })).toEqual([]);
    expect(filterLeads(all, { scannedSince: "2026-10-15" })).toEqual([]);
    expect(filterLeads(all, { scannedSince: "2026-10-14" })).toHaveLength(3);
    expect(filterLeads(all, { vertical: "salon_barber" })).toEqual([]);
  });

  it("sorts both ways on any column", async () => {
    const all = await rows();
    const desc = sortLeads(all, "score", "desc").map((r) => r.score);
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
    expect(sortLeads(all, "name", "asc").map((r) => r.name)).toEqual([
      "Jones Plumbing",
      "Seneca Paving",
      "Smith Roofing",
    ]);
  });

  it("a new column sorts in its natural order; a second click reverses it", () => {
    const start = { key: "score" as const, dir: "desc" as const };
    expect(nextSort(start, "name")).toEqual({ key: "name", dir: "asc" });
    expect(nextSort({ key: "name", dir: "asc" }, "name")).toEqual({
      key: "name",
      dir: "desc",
    });
    expect(nextSort(start, "reviews")).toEqual({ key: "reviews", dir: "desc" });
    expect(nextSort(start, "score")).toEqual({ key: "score", dir: "asc" });
  });

  it("filters round-trip through the export link's query string", () => {
    const f = {
      market: "West Seneca",
      minScore: 50,
      websiteStatus: "none",
      scannedSince: "2026-10-01",
    };
    expect(filtersFromParams(new URLSearchParams(filtersToParams(f)))).toEqual(f);
    expect(
      filtersFromParams(new URLSearchParams("minScore=abc&scannedSince=yesterday")),
    ).toEqual({});
  });
});

describe("file store", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("persists leads and scans, leaves no temp files, and purges expired Google data from disk", async () => {
    const { FilePresenceRepository } = await import("./presence-store");
    dir = await mkdtemp(path.join(tmpdir(), "presence-"));
    let clock = NOW;
    const repo = new FilePresenceRepository(dir, () => clock);
    const fetchImpl: FetchLike = () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            places: [
              {
                id: "P1",
                displayName: { text: "Quiet Masonry" },
                rating: 4.4,
                userRatingCount: 3,
              },
            ],
          }),
      });
    await startScan(
      form({ source: "google_places" }),
      deps({ repo, places: createGooglePlacesClient({ apiKey: "k", fetchImpl }) }),
    );
    expect((await repo.listProspects())[0]!.places?.record.rating).toBe(4.4);
    expect(await repo.listScans()).toHaveLength(1);
    expect((await readdir(dir)).sort()).toEqual(["prospects.json", "scans.json"]);

    clock = new Date(NOW.getTime() + 31 * 86_400_000);
    await repo.saveProspects([]); // any write re-applies retention to the file
    const onDisk = await readFile(path.join(dir, "prospects.json"), "utf8");
    expect(onDisk).not.toContain("4.4");
    expect(onDisk).toContain("P1"); // the place ID may be kept
  });
});
