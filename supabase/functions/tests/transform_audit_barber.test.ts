// Business Transformation Analysis Tool — the barber website rubric (Phase 1).
//
// The deterministic, offline half: HTML in, findings and a score out. The
// fetching and SSRF half is NOT retested here, because it is not new code —
// it is `_shared/discovery`, already covered by discovery_website.test.ts.
// That reuse is the point, so this file demonstrates it by composing the two.
//
// What is tested is the discipline the spec asks for and migration 0049
// enforces, proved on the way IN rather than only at the database boundary:
//
//   * a check that could not be evaluated is dropped from the denominator,
//     never scored zero
//   * "no site" and "site unreachable" are different outcomes with different
//     confidences, and the unreachable one carries no score at all
//   * every finding from a fetched page cites that page, which is what lets
//     the dimension be scored 'verified'
//   * a finding of absence never cites evidence
//   * recommendations follow only from FAILING findings
//   * the outreach hook is derived from a real finding, or is absent

import { extractFindings } from "../_shared/discovery/extract.ts";
import {
  auditWithoutPage,
  BARBER_WEB_RUBRIC_VERSION,
  hostedPlatform,
  linkedBookingPlatform,
  outreachHook,
  recommendFrom,
  scoreBarberWebsite,
} from "../_shared/transform_audit/barber_web.ts";
import {
  BARE_BARBER_HTML,
  GLOSSGENIUS_HOSTED_HTML,
  GOOD_BARBER_HTML,
  NO_BOOKING_HTTP_HTML,
} from "./fixtures/barbershops.ts";

// --- tiny inline assertions (no std import, so no network needed) -----------
function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("assertion failed: " + msg);
}
function assertEquals<T>(a: T, b: T, msg: string) {
  if (a !== b) throw new Error(`assertion failed: ${msg} (got ${a}, want ${b})`);
}

/** Compose the two modules exactly as the worker will: extract, then score. */
function audit(html: string, url: string, locality?: string) {
  const findings = extractFindings(html, { "content-type": "text/html" }, url);
  return scoreBarberWebsite({ html, findings, finalUrl: url, locality });
}

const codes = (r: ReturnType<typeof audit>) => r.findings.map((f) => f.code);
const failing = (r: ReturnType<typeof audit>) =>
  r.findings.filter((f) => f.severity !== "info").map((f) => f.code);
const has = (r: ReturnType<typeof audit>, code: string) =>
  r.findings.find((f) => f.code === code);

// ===========================================================================
// A shop doing it right
// ===========================================================================

Deno.test("a complete barbershop site scores high and produces no advice", () => {
  const r = audit(GOOD_BARBER_HTML, "https://elmwoodbarber.example/", "Buffalo");
  assertEquals(r.rubricVersion, BARBER_WEB_RUBRIC_VERSION, "rubric version reported");
  assertEquals(r.confidence, "verified", "a fetched page is verified");
  assert(r.score !== null && r.score >= 90, `expected >= 90, got ${r.score}`);
  assertEquals(failing(r).length, 0, "nothing failed, so nothing is flagged");
  assertEquals(
    recommendFrom(r.findings).length,
    0,
    "a healthy shop gets no recommendations",
  );
  assertEquals(
    outreachHook(r.findings),
    null,
    "no invented hook for a shop doing fine",
  );
});

Deno.test("passing checks are still recorded as findings, at info severity", () => {
  const r = audit(GOOD_BARBER_HTML, "https://elmwoodbarber.example/", "Buffalo");
  assert(
    codes(r).includes("online_booking"),
    "the booking check is reported either way",
  );
  assertEquals(
    has(r, "online_booking")!.severity,
    "info",
    "a pass is info, not a problem",
  );
  assert(
    has(r, "online_booking")!.statement.includes("offers a way to book"),
    "a passing finding states what IS true, not what is missing",
  );
});

// ===========================================================================
// The evidence rule
// ===========================================================================

Deno.test("every finding from a fetched page cites that page", () => {
  const r = audit(BARE_BARBER_HTML, "https://cuts.example/");
  assert(r.findings.length > 0, "there are findings");
  for (const f of r.findings) {
    assertEquals(f.evidenceUrl, "https://cuts.example/", `${f.code} cites the page`);
    assertEquals(f.confidence, "verified", `${f.code} is verified`);
  }
});

Deno.test("a bare page fails the things a customer actually needs", () => {
  const r = audit(BARE_BARBER_HTML, "https://cuts.example/");
  const f = failing(r);
  assert(f.includes("online_booking"), "no booking path");
  assert(f.includes("published_hours"), "no hours");
  assert(f.includes("tap_to_call"), "phone is not tappable");
  assert(f.includes("mobile_viewport"), "no viewport");
  assert(f.includes("address_or_map"), "no address");
  assert(r.score !== null && r.score < 35, `expected a low score, got ${r.score}`);
});

// ===========================================================================
// The unevaluable check is dropped, not failed
// ===========================================================================

Deno.test("a check with nothing to judge is excluded from the denominator", () => {
  // No locality supplied -> the local-keyword check cannot be run at all.
  const withOut = audit(GOOD_BARBER_HTML, "https://elmwoodbarber.example/");
  const withIn = audit(GOOD_BARBER_HTML, "https://elmwoodbarber.example/", "Buffalo");
  assert(
    withOut.checksEvaluated < withOut.checksPossible,
    "an unevaluable check is visibly not evaluated",
  );
  assertEquals(
    withIn.checksEvaluated,
    withOut.checksEvaluated + 1,
    "supplying the town adds exactly one evaluated check",
  );
  assert(
    !codes(withOut).includes("local_keyword"),
    "an unevaluated check produces no finding at all",
  );
  // The decisive property: NOT knowing the town must not cost the shop points.
  assert(
    withOut.score !== null && withIn.score !== null && withOut.score >= withIn.score,
    `dropping a check must not lower the score (${withOut.score} vs ${withIn.score})`,
  );
});

Deno.test("a page with no images is not marked down for missing alt text", () => {
  const noImages = `<!doctype html><html><head><title>T</title></head><body><h1>T</h1></body></html>`;
  const r = audit(noImages, "https://x.example/");
  assert(!codes(r).includes("image_alt_text"), "nothing to judge, so no finding");
});

// ===========================================================================
// The booking-platform-hosted page — a shop that has booking but owns nothing
// ===========================================================================

Deno.test("a booking-platform-hosted page passes booking and fails ownership", () => {
  const r = audit(
    GLOSSGENIUS_HOSTED_HTML,
    "https://northtownfades.glossgenius.com/",
    "Tonawanda",
  );
  assertEquals(has(r, "online_booking")!.severity, "info", "booking works — say so");
  assert(failing(r).includes("owned_domain"), "the shop owns none of it");
  assert(
    has(r, "owned_domain")!.statement.includes("glossgenius"),
    "the finding names the platform it is hosted on",
  );
  const recs = recommendFrom(r.findings);
  assert(
    recs.some((x) => x.capabilityKey === "owned_website"),
    "the gap points at the owned_website capability",
  );
  assert(
    !recs.some((x) => x.capabilityKey === "booking"),
    "booking already works, so it is not recommended",
  );
});

Deno.test("platform detection distinguishes hosted-on from linked-to", () => {
  assertEquals(
    hostedPlatform("https://northtownfades.glossgenius.com/"),
    "glossgenius",
    "hosted on the platform",
  );
  assertEquals(
    hostedPlatform("https://elmwoodbarber.example/"),
    null,
    "an owned domain is not a platform",
  );
  assertEquals(
    linkedBookingPlatform(GOOD_BARBER_HTML),
    "booksy",
    "an owned site linking out to a booking platform",
  );
  assertEquals(linkedBookingPlatform(BARE_BARBER_HTML), null, "no booking link at all");
});

// ===========================================================================
// No page to read: two different truths, kept apart
// ===========================================================================

Deno.test("no website is a scored finding of absence, inferred not verified", () => {
  const r = auditWithoutPage("absent", { source: "WNY prospect list" });
  assertEquals(
    r.score,
    0,
    "there is genuinely nothing there, and 0 is the honest score",
  );
  assertEquals(r.confidence, "inferred", "the list said so; nothing was fetched");
  assertEquals(r.findings.length, 1, "one finding: the absence itself");
  assertEquals(r.findings[0].code, "no_website", "named as an absence");
  assertEquals(r.findings[0].evidenceUrl, null, "there is no page to cite");
});

Deno.test("an unreachable site carries NO score and is reported as a gap", () => {
  const r = auditWithoutPage("unreachable", {
    url: "https://down.example/",
    error: "http_503",
  });
  assertEquals(r.score, null, "a site we could not read is not a site scored zero");
  assertEquals(r.confidence, "unknown", "unknown, so the report shows it as a gap");
  assertEquals(r.findings[0].confidence, "unknown", "the finding is unknown too");
  assertEquals(
    r.findings[0].evidenceUrl,
    null,
    "an unknown finding cannot cite evidence — migration 0049 refuses it outright",
  );
  assert(
    r.findings[0].statement.includes("http_503"),
    "the reason is stated, not hidden",
  );
});

// ===========================================================================
// Judgment, separate from evidence
// ===========================================================================

Deno.test("recommendations follow only from failing findings", () => {
  const r = audit(NO_BOOKING_HTTP_HTML, "http://southside.example/", "Buffalo");
  const recs = recommendFrom(r.findings);
  assert(recs.length > 0, "a shop with real gaps gets real advice");
  const failedCodes = new Set(failing(r));
  for (const rec of recs) {
    assert(
      rec.addressesCode === null || failedCodes.has(rec.addressesCode),
      `recommendation "${rec.title}" answers a finding that actually failed`,
    );
  }
  assert(
    recs.some((x) => x.capabilityKey === "booking"),
    "no booking anywhere -> the booking capability",
  );
  assert(
    recs.some((x) => x.priority === "structural") &&
      recs.some((x) => x.priority === "quick_win"),
    "advice is split into quick wins and structural work, as the spec requires",
  );
  assertEquals(recs[0].priority, "structural", "structural work is ranked first");
});

Deno.test("every recommended capability key exists in the BarberOS catalog", () => {
  // The nine keys seeded by migration 0048. If a rule here names something
  // else, the database foreign key would reject the row at run time; this
  // catches it at build time instead.
  const CATALOG = new Set([
    "client_crm",
    "booking",
    "walkin_queue",
    "review_engine",
    "missed_call_capture",
    "owned_website",
    "reporting_dashboard",
    "staff_management",
    "payments",
  ]);
  for (const html of [
    BARE_BARBER_HTML,
    NO_BOOKING_HTTP_HTML,
    GLOSSGENIUS_HOSTED_HTML,
  ]) {
    for (const rec of recommendFrom(audit(html, "https://x.example/").findings)) {
      assert(
        rec.capabilityKey === null || CATALOG.has(rec.capabilityKey),
        `unknown capability key ${rec.capabilityKey}`,
      );
    }
  }
  // ...and the deferred module is never recommended as a fix.
  for (const rec of recommendFrom(
    audit(BARE_BARBER_HTML, "https://x.example/").findings,
  )) {
    assert(
      rec.capabilityKey !== "payments",
      "payments is deferred and is never advised",
    );
  }
});

// ===========================================================================
// The outreach hook
// ===========================================================================

Deno.test("the outreach hook comes from the worst real failing finding", () => {
  const r = audit(BARE_BARBER_HTML, "https://cuts.example/");
  const hook = outreachHook(r.findings);
  assert(hook !== null, "there are failures, so there is a hook");
  assertEquals(hook!.code, "online_booking", "booking outranks the cosmetic failures");
  assert(
    failing(r).includes(hook!.code),
    "the hook cites a finding that is actually in this audit",
  );
});

Deno.test("no website produces the no-website hook, not the booking one", () => {
  const r = auditWithoutPage("absent", { source: "WNY prospect list" });
  const hook = outreachHook(r.findings);
  assertEquals(hook!.code, "no_website", "the absence is the story");
});

Deno.test("an unreachable site produces no hook at all", () => {
  // We know nothing about the shop. A hook here would be a claim we cannot make.
  const r = auditWithoutPage("unreachable", {
    url: "https://down.example/",
    error: "timeout",
  });
  assertEquals(outreachHook(r.findings), null, "no observation, no claim");
});
