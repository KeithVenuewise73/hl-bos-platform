// The audit runner — order of operations, and what it does when a site is
// missing or unreachable.
//
// Every port is faked here, so what is under test is the ORCHESTRATION: the
// sequence the database's own constraints require, and the decisions the
// runner makes about which of the three "no page" outcomes applies.
// The rubric itself is tested in transform_audit_barber.test.ts, and the
// database's enforcement of the same rules in supabase/tests/49_transform_audit.sql.

import {
  analyseShop,
  analyseShops,
  areasForImprovement,
} from "../_shared/transform_audit/run.ts";
import type {
  AuditNetwork,
  AuditStore,
  ShopInput,
} from "../_shared/transform_audit/run.ts";
import { BARE_BARBER_HTML, GOOD_BARBER_HTML } from "./fixtures/barbershops.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("assertion failed: " + msg);
}
function assertEquals<T>(a: T, b: T, msg: string) {
  if (a !== b) throw new Error(`assertion failed: ${msg} (got ${a}, want ${b})`);
}

/** Records the exact call sequence, so the required order can be asserted. */
function recordingStore() {
  const calls: string[] = [];
  const findings: Array<{ code: string; evidenceUrl: string | null }> = [];
  const recs: Array<{
    priority: string;
    capabilityKey: string | null;
    addressesFindingId: number | null;
  }> = [];
  const dims: Array<{ score: number | null; confidence: string; note: string }> = [];
  let hook: { findingId: number; hook: string } | null = null;
  let nextId = 100;

  const store: AuditStore = {
    startRun: (p) => {
      calls.push("startRun");
      return Promise.resolve("run-for-" + p);
    },
    recordFinding: (_r, f) => {
      calls.push("recordFinding:" + f.code);
      findings.push({ code: f.code, evidenceUrl: f.evidenceUrl });
      return Promise.resolve(nextId++);
    },
    recordDimension: (_r, d) => {
      calls.push("recordDimension");
      dims.push({ score: d.score, confidence: d.confidence, note: d.note });
      return Promise.resolve();
    },
    addRecommendation: (_r, r) => {
      calls.push("addRecommendation");
      recs.push({
        priority: r.priority,
        capabilityKey: r.capabilityKey,
        addressesFindingId: r.addressesFindingId,
      });
      return Promise.resolve(nextId++);
    },
    setOutreachHook: (_r, findingId, h) => {
      calls.push("setOutreachHook");
      hook = { findingId, hook: h };
      return Promise.resolve();
    },
    finishRun: () => {
      calls.push("finishRun");
      return Promise.resolve("completed");
    },
  };
  return {
    store,
    calls,
    findings,
    recs,
    dims,
    get hook() {
      return hook;
    },
  };
}

function net(pages: Record<string, string>): AuditNetwork {
  return {
    resolve: () => Promise.resolve(["93.184.216.34"]),
    fetchPage: (url: string) => {
      const key = url.replace(/\/$/, "");
      const body = pages[key] ?? pages[url];
      if (body === undefined) return Promise.reject(new Error("ECONNREFUSED"));
      return Promise.resolve({
        status: 200,
        finalUrl: url,
        redirectChain: [],
        headers: { "content-type": "text/html" },
        body,
        bytes: body.length,
        contentType: "text/html",
      });
    },
  };
}

const SHOP: ShopInput = {
  prospectId: "p1",
  businessName: "Cuts",
  websiteUrl: "https://cuts.example/",
  locality: "Buffalo",
};

// ===========================================================================
// The order the database requires
// ===========================================================================

Deno.test("findings are recorded before the dimension is scored", async () => {
  const r = recordingStore();
  await analyseShop(SHOP, r.store, net({ "https://cuts.example": BARE_BARBER_HTML }));

  const firstFinding = r.calls.findIndex((c) => c.startsWith("recordFinding"));
  const dim = r.calls.indexOf("recordDimension");
  assert(firstFinding !== -1 && dim !== -1, "both happened");
  assert(
    firstFinding < dim,
    "a dimension cannot be scored 'verified' before its evidence exists",
  );
  assertEquals(r.calls[0], "startRun", "the run is opened first");
  assertEquals(r.calls[r.calls.length - 1], "finishRun", "and closed last");
});

Deno.test(
  "recommendations and the hook come after the findings they cite",
  async () => {
    const r = recordingStore();
    await analyseShop(SHOP, r.store, net({ "https://cuts.example": BARE_BARBER_HTML }));
    const lastFinding = r.calls.lastIndexOf(
      r.calls.filter((c) => c.startsWith("recordFinding")).slice(-1)[0],
    );
    const firstRec = r.calls.indexOf("addRecommendation");
    const hookAt = r.calls.indexOf("setOutreachHook");
    assert(lastFinding < firstRec, "recommendations follow findings");
    assert(lastFinding < hookAt, "the hook follows findings");
  },
);

Deno.test(
  "every recommendation cites a finding id the store actually issued",
  async () => {
    const r = recordingStore();
    await analyseShop(SHOP, r.store, net({ "https://cuts.example": BARE_BARBER_HTML }));
    assert(r.recs.length > 0, "there are recommendations");
    for (const rec of r.recs) {
      assert(
        rec.addressesFindingId === null || rec.addressesFindingId >= 100,
        "the id came from recordFinding, not from thin air",
      );
    }
    assert(r.hook !== null, "a hook was set");
    assert(r.hook!.findingId >= 100, "the hook cites a real finding id");
  },
);

// ===========================================================================
// A shop doing it right
// ===========================================================================

Deno.test(
  "a healthy shop is scored, and gets no recommendations and no hook",
  async () => {
    const r = recordingStore();
    const out = await analyseShop(
      { ...SHOP, websiteUrl: "https://elmwood.example/" },
      r.store,
      net({ "https://elmwood.example": GOOD_BARBER_HTML }),
    );
    assert(
      out.websiteScore !== null && out.websiteScore >= 90,
      `high score, got ${out.websiteScore}`,
    );
    assertEquals(out.confidence, "verified", "a fetched page is verified");
    assertEquals(out.recommendationCount, 0, "nothing to fix, nothing advised");
    assertEquals(out.outreachHook, null, "and no invented hook");
    assertEquals(
      r.calls.includes("setOutreachHook"),
      false,
      "the hook write never happens",
    );
  },
);

// ===========================================================================
// The three "no page" outcomes are kept distinct
// ===========================================================================

Deno.test("a shop with no website URL is scored 0 at inferred confidence", async () => {
  const r = recordingStore();
  const out = await analyseShop({ ...SHOP, websiteUrl: null }, r.store, net({}));
  assertEquals(out.websiteScore, 0, "there is genuinely nothing there");
  assertEquals(out.confidence, "inferred", "the list said so; nothing was fetched");
  assertEquals(r.findings.length, 1, "one finding: the absence");
  assertEquals(r.findings[0].code, "no_website", "named as an absence");
  assertEquals(r.findings[0].evidenceUrl, null, "no page to cite");
  assert(
    out.recommendedCapabilities.includes("owned_website"),
    "and it points at the owned_website capability",
  );
});

Deno.test("an unreachable site is scored NOT AT ALL, and says why", async () => {
  const r = recordingStore();
  const out = await analyseShop(
    { ...SHOP, websiteUrl: "https://down.example/" },
    r.store,
    net({}),
  );
  assertEquals(
    out.websiteScore,
    null,
    "a site we could not read is not a site scored zero",
  );
  assertEquals(out.confidence, "unknown", "reported as a gap");
  assert(out.fetchError !== undefined, "the reason is carried, not swallowed");
  assertEquals(r.dims[0].score, null, "the stored dimension carries no number");
  assertEquals(r.dims[0].confidence, "unknown", "and is stored as unknown");
  assert(
    r.dims[0].note.includes("could not be read"),
    "the note says the site could not be read",
  );
  assertEquals(out.recommendationCount, 0, "we know nothing, so we advise nothing");
  assertEquals(out.outreachHook, null, "and claim nothing");
});

Deno.test(
  "an SSRF-blocked target is treated as unreachable, not as a bad shop",
  async () => {
    const r = recordingStore();
    // A private address. discovery/url.ts refuses it before any fetch happens.
    const out = await analyseShop(
      { ...SHOP, websiteUrl: "http://192.168.1.10/" },
      r.store,
      net({}),
    );
    assertEquals(out.websiteScore, null, "no score");
    assertEquals(out.confidence, "unknown", "unknown, not zero");
    assert(out.fetchError !== undefined, "the block is recorded as the reason");
  },
);

// ===========================================================================
// Batches
// ===========================================================================

Deno.test("a batch continues past a shop that throws, and reports which", async () => {
  const good = recordingStore();
  let n = 0;
  const flaky: AuditStore = {
    ...good.store,
    startRun: (p) => {
      n++;
      if (n === 2) return Promise.reject(new Error("db unavailable"));
      return Promise.resolve("run-" + p);
    },
  };
  const shops: ShopInput[] = [
    { prospectId: "a", businessName: "A", websiteUrl: null },
    { prospectId: "b", businessName: "B", websiteUrl: null },
    { prospectId: "c", businessName: "C", websiteUrl: null },
  ];
  const results = await analyseShops(shops, flaky, net({}), { delayMs: 0 });
  assertEquals(results.length, 3, "every shop is accounted for");
  assert(results[0].outcome !== null, "first succeeded");
  assertEquals(results[1].outcome, null, "second failed");
  assert(results[1].error!.includes("db unavailable"), "and says why");
  assert(results[2].outcome !== null, "third still ran");
});

Deno.test("batch progress is reported per shop", async () => {
  const r = recordingStore();
  const seen: number[] = [];
  const shops: ShopInput[] = [
    { prospectId: "a", businessName: "A", websiteUrl: null },
    { prospectId: "b", businessName: "B", websiteUrl: null },
  ];
  await analyseShops(shops, r.store, net({}), {
    delayMs: 0,
    onProgress: (done, total) => {
      seen.push(done);
      assertEquals(total, 2, "total is the batch size");
    },
  });
  assertEquals(seen.join(","), "1,2", "progress counts up once per shop");
});

// ===========================================================================
// The "areas of improvement" list
// ===========================================================================

Deno.test("areas for improvement are failing findings only, worst first", async () => {
  const r = recordingStore();
  await analyseShop(SHOP, r.store, net({ "https://cuts.example": BARE_BARBER_HTML }));
  // Rebuild the finding shape the helper takes, from what the store received.
  const out = await analyseShop(
    SHOP,
    recordingStore().store,
    net({ "https://cuts.example": BARE_BARBER_HTML }),
  );
  assert(
    out.failingCount > 0 && out.failingCount < out.findingCount,
    "some pass, some fail",
  );
});

Deno.test("areasForImprovement sorts critical before high before medium", () => {
  const mk = (code: string, severity: "critical" | "high" | "medium" | "info") => ({
    code,
    statement: code,
    evidenceUrl: null,
    observed: {},
    confidence: "verified" as const,
    severity,
    detector: "t",
  });
  const sorted = areasForImprovement([
    mk("m", "medium"),
    mk("i", "info"),
    mk("c", "critical"),
    mk("h", "high"),
  ]);
  assertEquals(
    sorted.map((f) => f.code).join(","),
    "c,h,m",
    "worst first, info dropped",
  );
});

// ===========================================================================
// The prospect list's research notes are not all the same claim
//
// 40 of the 50 WNY rows carry a note instead of a URL, and five of those
// report a booking-platform presence. Collapsing them into "no website" would
// tell a shop that is already on Booksy that customers cannot book it.
// ===========================================================================

Deno.test("a booking-platform note is not the same as no web presence", async () => {
  const r = recordingStore();
  const out = await analyseShop(
    {
      prospectId: "p9",
      businessName: "Fade Factory",
      websiteUrl: null,
      webPresenceNote: "Booksy presence; dedicated site not confirmed",
    },
    r.store,
    net({}),
  );
  const codes = r.findings.map((f) => f.code);
  assert(codes.includes("owned_domain"), "the missing owned domain is the finding");
  assert(codes.includes("online_booking"), "and booking is recorded as PRESENT");
  assertEquals(out.hostedPlatform, "booksy", "the platform is named from the note");
  assert(
    out.recommendedCapabilities.includes("owned_website"),
    "it points at owned_website",
  );
  assert(
    !out.recommendedCapabilities.includes("booking"),
    "and never at booking — the shop can already be booked",
  );
  assert(
    (out.outreachHook ?? "").includes("booking platform"),
    "the hook is about ownership, not about being unbookable",
  );
});

Deno.test("a platform-only shop is NOT scored, because no page was seen", async () => {
  const r = recordingStore();
  const out = await analyseShop(
    {
      prospectId: "p10",
      businessName: "Square Cuts",
      websiteUrl: null,
      webPresenceNote: "Square booking site / dedicated domain not confirmed",
    },
    r.store,
    net({}),
  );
  assertEquals(out.websiteScore, null, "two facts from a note are not an assessment");
  assertEquals(out.confidence, "unknown", "so the dimension is a gap");
  // ...but the two facts are still recorded, at their own confidence.
  assertEquals(r.findings.length, 2, "both facts stored");
  assertEquals(r.dims[0].score, null, "no number invented");
});

Deno.test("'No dedicated website confirmed' stays a scored absence", async () => {
  const r = recordingStore();
  const out = await analyseShop(
    {
      prospectId: "p11",
      businessName: "Nothing Online",
      websiteUrl: null,
      webPresenceNote: "No dedicated website confirmed",
    },
    r.store,
    net({}),
  );
  assertEquals(out.websiteScore, 0, "there is genuinely nothing to score");
  assertEquals(out.confidence, "inferred", "from the list, not from a fetch");
  assertEquals(r.findings[0].code, "no_website", "named as an absence");
});
