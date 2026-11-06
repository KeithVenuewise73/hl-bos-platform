// The Revenue Center may judge an existing website's design only on what a real
// browser showed (packages/visual-review). Leads are built through the real
// Presence Scanner pipeline from synthetic pages; nothing touches the network.

import { runMarketScan, type Finding, type Prospect } from "@hl-bos/presence-scanner";
import { describe, expect, it } from "vitest";

import {
  fakeEgress,
  NOW,
  WEAK_CONTRACTOR_HTML,
} from "../../presence-scanner/src/test-helpers.ts";
import { reviewPayload } from "./revenue-center.ts";
import { buildReview, validateReview } from "./review.ts";

let n = 0;
async function lead(
  site: Record<string, { status?: number; body?: string }>,
  row: string,
): Promise<Prospect> {
  const { prospects } = await runMarketScan(
    {
      market: "West Seneca",
      zip: undefined,
      radiusMiles: 10,
      vertical: "contractor",
      maxResults: 5,
      searchTerms: undefined,
      source: "import",
      importText: `name,website,phone,address\n${row}`,
    },
    {
      places: null,
      egress: fakeEgress(site),
      now: () => NOW,
      newId: () => `vc-${++n}`,
      existing: [],
      actor: "test",
    },
  );
  return prospects[0]!;
}
const weak = () =>
  lead(
    { "smithroofing.example": { body: WEAK_CONTRACTOR_HTML } },
    "Smith Roofing,smithroofing.example,716-555-0101,12 Main St",
  );

const visualFinding = (
  key: string,
  status: Finding["status"],
  evidence: string,
): Finding => ({
  key,
  label: key,
  status,
  source: "website",
  observedAt: NOW.toISOString(),
  evidence,
  confidence: "high",
});
const seen = (p: Prospect, coverage: "complete" | "partial" | "blocked"): Prospect => ({
  ...p,
  findings: [
    ...p.findings,
    visualFinding(
      "visual.coverage",
      coverage === "blocked" ? "blocked" : "present",
      `coverage ${coverage}`,
    ),
    ...(coverage === "blocked"
      ? []
      : [
          visualFinding(
            "visual.mobile_layout",
            "missing",
            "At 390px the homepage scrolls sideways [screenshots: p01-desktop.png, p01-mobile.png]",
          ),
        ]),
  ],
  visual: {
    reviewId: "vr-x",
    coverage,
    coverageReason: `test ${coverage}`,
    pagesViewed: coverage === "blocked" ? 0 : 3,
    finishedAt: NOW.toISOString(),
    version: "visual-review-0.1.0",
  },
});

describe("design claims need a browser", () => {
  it("a working site not viewed in a browser: no redesign offer; the review says why; still valid", async () => {
    const r = buildReview(await weak(), { line: "hld", now: NOW });
    expect(r.visualCoverage).toBe("not_run");
    expect(r.opportunities.map((o) => o.offerKey)).not.toContain("hld.website");
    expect(r.notChecked.join(" ")).toContain("not viewed in a browser");
    expect(r.assumptions.map((a) => a.statement).join(" ")).toContain(
      "were not seen in a browser",
    );
    expect(validateReview(r)).toEqual([]);
  });

  it("the same site after a complete visual review: the redesign offer cites the browser evidence", async () => {
    const r = buildReview(seen(await weak(), "complete"), { line: "hld", now: NOW });
    const web = r.opportunities.find((o) => o.offerKey === "hld.website");
    expect(web?.basedOn).toEqual(
      expect.arrayContaining(["visual.coverage", "visual.mobile_layout"]),
    );
    expect(validateReview(r)).toEqual([]);
  });

  it("a blocked visual review allows no design statement", async () => {
    const r = buildReview(seen(await weak(), "blocked"), { line: "hld", now: NOW });
    expect(r.visualCoverage).toBe("blocked");
    expect(r.opportunities.map((o) => o.offerKey)).not.toContain("hld.website");
    expect(r.assumptions.map((a) => a.statement).join(" ")).toContain(
      "visual review blocked",
    );
  });

  it("a review that judges a site's design without browser evidence is refused, however it was produced", async () => {
    const r = buildReview(await weak(), { line: "hld", now: NOW });
    const forged = {
      ...r,
      opportunities: [
        ...r.opportunities,
        {
          offerKey: "hld.website",
          offerName: "Website development and redesign",
          priority: "high" as const,
          rationale: "The site scored low.",
          basedOn: ["site.title"],
        },
        {
          offerKey: "hld.booking",
          offerName: "Online booking",
          priority: "medium" as const,
          rationale: "The booking flow is confusing.",
          basedOn: ["site.title"],
        },
      ],
    };
    const problems = validateReview(forged).join(" ");
    expect(problems).toContain(
      "judges an existing website without having seen it in a browser",
    );
    expect(problems).toContain(
      "describes design or functionality without a visual-review fact",
    );
  });

  it("no working site of its own: a rebuild may be proposed without a visual review", async () => {
    const r = buildReview(
      await lead({}, "Jones Plumbing,none,716-555-0102,9 Union Rd"),
      { line: "hld", now: NOW },
    );
    expect(r.opportunities.map((o) => o.offerKey)).toContain("hld.website");
    expect(validateReview(r)).toEqual([]);
  });
});

describe("blocked and script-drawn sites, end to end", () => {
  const CF =
    "<!doctype html><html><head><title>Attention Required! | Cloudflare</title></head><body><h1>Sorry, you have been blocked</h1></body></html>";
  const SPA =
    '<!doctype html><html><head><title>Example Rinks of Buffalo</title><meta name="viewport" content="width=device-width"></head><body><div id="root"></div><script src="/app.js"></script></body></html>';

  it("a Cloudflare page served with HTTP 200 scores nothing, so Send to Review has nothing to submit (the database refuses)", async () => {
    const p = await lead(
      { "rink.example": { body: CF } },
      "Rink Example,rink.example,716-555-0199,1 Ice Rd",
    );
    expect(p.websiteStatus).toBe("blocked");
    const r = buildReview(p, { line: "hld", now: NOW });
    expect(reviewPayload(p, r).scores).toEqual([]);
    expect(r.opportunities).toEqual([]);
  });

  it("a JavaScript-drawn homepage claims no missing booking, phone or form", async () => {
    const p = await lead(
      { "rink.example": { body: SPA } },
      "Rink Example,rink.example,716-555-0199,1 Ice Rd",
    );
    const r = buildReview(p, { line: "hld", now: NOW });
    const absent = r.observed.filter((f) => f.status !== "present").map((f) => f.key);
    for (const k of ["site.call", "site.booking", "site.form", "site.registration"])
      expect(absent).not.toContain(k);
    expect(r.opportunities.map((o) => o.offerKey)).not.toContain("hld.website");
  });
});
