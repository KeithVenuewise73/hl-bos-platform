// Barber-vertical website rubric for the Business Transformation Analysis Tool.
//
// REUSE, NOT A SECOND SCANNER. The fetching, SSRF validation, redirect-hop
// checking and deterministic HTML extraction already exist in
// `_shared/discovery` (Checkpoint 5, migration 0022) and are used unchanged.
// This module is only the part that is genuinely new: what those same facts
// MEAN for a barbershop. The generic rubric scores "digital maturity"; a shop
// owner does not have a digital-maturity problem, they have a "nobody can book
// me at 9pm" problem.
//
// Pure and deterministic: HTML in, findings and a score out. No network, no
// AI, no clock. Every finding carries the evidence URL it came from, because
// the schema (migration 0049) refuses to call a dimension `verified` without
// one.
//
// SCORING DISCIPLINE — the same rule the composite uses, one level down: a
// check that could not be evaluated is dropped from the DENOMINATOR rather
// than scored zero. A shop is not penalised for something we failed to look at.

import type { WebsiteFindings } from "../discovery/extract.ts";

export const BARBER_WEB_RUBRIC_VERSION = "barber-web-0.1.0";

export type Confidence = "verified" | "inferred" | "unknown";
export type Severity = "critical" | "high" | "medium" | "info";
export type Priority = "quick_win" | "structural";

export interface AuditFinding {
  code: string;
  statement: string;
  evidenceUrl: string | null;
  observed: Record<string, unknown>;
  confidence: Confidence;
  severity: Severity;
  detector: string;
}

export interface Recommendation {
  priority: Priority;
  rank: number;
  title: string;
  detail: string;
  /** A key in barberos.capabilities, or null for advice that is not software. */
  capabilityKey: string | null;
  /** The finding code this answers, so the DB can link the two rows. */
  addressesCode: string | null;
}

export interface BarberWebAudit {
  rubricVersion: string;
  /** null when nothing could be evaluated — never a consolation zero. */
  score: number | null;
  confidence: Confidence;
  checksEvaluated: number;
  checksPossible: number;
  /**
   * One line for the stored dimension note. Each no-page case has its own,
   * because "0 of 0 checks were evaluable on this page" is nonsense for a shop
   * that has no page -- and a note is what a reader sees next to a blank score.
   */
  summary: string;
  findings: AuditFinding[];
}

const DETECTOR = "barber_web_rubric";

// Booking platforms that HOST a shop's page outright. A shop whose only web
// presence is one of these does not have a website; it has someone else's
// funnel. Several of the WNY prospects are known to be in exactly this state,
// and it is the direct hook for the `owned_website` capability.
const BOOKING_PLATFORMS: ReadonlyArray<readonly [string, RegExp]> = [
  ["glossgenius", /glossgenius\.com/i],
  ["booksy", /booksy\.com/i],
  ["squire", /getsquire\.com|squire\.com/i],
  ["styleseat", /styleseat\.com/i],
  ["vagaro", /vagaro\.com/i],
  ["fresha", /fresha\.com/i],
  ["schedulicity", /schedulicity\.com/i],
  ["setmore", /setmore\.com/i],
  [
    "square_appointments",
    /squareup\.com\/appointments|square\.site|book\.squareup\.com/i,
  ],
  ["acuity", /acuityscheduling\.com|app\.squarespacescheduling\.com/i],
  ["calendly", /calendly\.com/i],
  ["mindbody", /mindbodyonline\.com/i],
  ["booker", /booker\.com/i],
];

const BOOK_CTA =
  /\b(book\s+(now|online|an?\s+appointment|appointment)|schedule\s+(now|an?\s+appointment|appointment)|reserve\s+(a\s+)?(chair|seat|spot)|make\s+an?\s+appointment)\b/i;

// The CTA is only evidence of ONLINE booking when it is attached to something
// clickable. Found by a test: "Call 716-555-0142 to make an appointment" in a
// paragraph matched the CTA and scored the shop as having online booking --
// when that sentence is the exact opposite, a shop whose only booking path is
// the telephone. A tel:/mailto: link is excluded for the same reason.
const CLICKABLE = /<(a|button)\b([^>]*)>([\s\S]{0,200}?)<\/\1>/gi;

function hasClickableBookingCta(html: string): boolean {
  for (const m of html.matchAll(CLICKABLE)) {
    const attrs = m[2] ?? "";
    const href = /href\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] ?? "";
    if (/^(tel:|mailto:|sms:)/i.test(href)) continue;
    const label = m[3].replace(/<[^>]*>/g, " ");
    if (BOOK_CTA.test(label)) return true;
  }
  return false;
}

// A time range, a weekday, or a plain "Hours" heading. Any of the three is
// enough to say hours are published; none of them is enough to say they are
// correct, which is why the finding says "published", not "accurate".
const HOURS_SIGNAL =
  /(\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(day)?\b[^<]{0,40}\d{1,2}\s*(:\d{2})?\s*(am|pm))|(\bhours\b\s*(of\s+operation)?)|(\bopen\s+(today|daily|mon)\b)/i;

const PRICE_SIGNAL = /\$\s?\d{1,3}(\.\d{2})?\b/;
const SERVICE_WORD =
  /\b(haircut|hair\s?cut|fade|beard\s+trim|line\s?up|lineup|shave|taper|buzz|kids?\s+cut|senior\s+cut|hot\s+towel)\b/i;

const MAP_EMBED =
  /(google\.com\/maps\/embed|maps\.google\.[a-z.]+\/maps\?|<iframe[^>]+google\.[a-z.]+\/maps)/i;
const US_ADDRESS =
  /\d+\s+[A-Za-z0-9.'\- ]{2,40}\s+(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|hwy|highway|pkwy|parkway|ter|terrace|ct|court|pl|place)\b/i;

const REVIEW_SIGNAL =
  /\b(review|testimonial|what\s+(our\s+)?(clients?|customers?)\s+say|rated\s+\d(\.\d)?\s*(\/|out of)\s*5)\b/i;
const STAFF_SIGNAL =
  /\b(meet\s+(the\s+)?(team|our\s+barbers?|the\s+barbers?)|our\s+(team|barbers?|staff)|about\s+(the\s+)?barbers?)\b/i;

/** One weighted check. `evaluated: false` drops it from the denominator. */
interface Check {
  code: string;
  weight: number;
  evaluated: boolean;
  passed: boolean;
  severity: Severity;
  pass: string;
  fail: string;
  observed: Record<string, unknown>;
}

function stripTags(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ");
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "";
  }
}

/** Which booking platform, if any, this page IS (as opposed to links to). */
export function hostedPlatform(finalUrl: string): string | null {
  const host = hostOf(finalUrl);
  if (!host) return null;
  for (const [name, re] of BOOKING_PLATFORMS) if (re.test(host)) return name;
  return null;
}

/** Which booking platform, if any, this page LINKS OUT to. */
export function linkedBookingPlatform(html: string): string | null {
  for (const [name, re] of BOOKING_PLATFORMS) if (re.test(html)) return name;
  return null;
}

export interface ScoreInput {
  html: string;
  findings: WebsiteFindings;
  finalUrl: string;
  /** Town/city from the prospect list, for the local-SEO check. */
  locality?: string | null;
}

export function scoreBarberWebsite(input: ScoreInput): BarberWebAudit {
  const { html, findings: f, finalUrl } = input;
  const text = stripTags(html);
  const hosted = hostedPlatform(finalUrl);
  const linked = linkedBookingPlatform(html);
  const hasBookingCta = hasClickableBookingCta(html);
  // Hosted ON a booking platform means booking exists, whatever else is wrong.
  const hasBooking = hosted !== null || linked !== null || hasBookingCta;

  const hasPricing = PRICE_SIGNAL.test(text) && SERVICE_WORD.test(text);
  const hasServices = SERVICE_WORD.test(text);
  const hasHours = HOURS_SIGNAL.test(text);
  const hasMapOrAddress =
    MAP_EMBED.test(html) ||
    US_ADDRESS.test(text) ||
    f.structuredDataTypes.some((t) =>
      /LocalBusiness|BarberShop|HairSalon|PostalAddress/i.test(t),
    );

  const locality = (input.locality ?? "").trim().toLowerCase();
  const seoText = [f.title ?? "", f.metaDescription ?? "", ...f.h1]
    .join(" ")
    .toLowerCase();
  // Only a claim we can actually make: without a locality from the prospect
  // list there is nothing to look for, so the check is not evaluated at all.
  const localityEvaluated = locality.length > 0;
  const hasLocalKeyword = localityEvaluated && seoText.includes(locality);

  const checks: Check[] = [
    {
      code: "online_booking",
      weight: 25,
      evaluated: true,
      passed: hasBooking,
      severity: "critical",
      pass: "The site offers a way to book online.",
      fail: "No online booking found anywhere on the site.",
      observed: {
        hostedPlatform: hosted,
        linkedPlatform: linked,
        clickableBookingCta: hasBookingCta,
      },
    },
    {
      code: "owned_domain",
      weight: 10,
      evaluated: true,
      passed: hosted === null,
      severity: "high",
      pass: "The shop publishes on its own domain.",
      fail: `The shop's only web presence is a page hosted on ${hosted ?? "a booking platform"}, not a site it owns.`,
      observed: { host: hostOf(finalUrl), hostedPlatform: hosted },
    },
    {
      code: "mobile_viewport",
      weight: 12,
      evaluated: true,
      passed: f.hasViewport,
      severity: "high",
      pass: "The page declares a mobile viewport.",
      fail: "The page declares no mobile viewport, so it will render desktop-width on a phone.",
      observed: { viewport: f.hasViewport },
    },
    {
      code: "tap_to_call",
      weight: 10,
      evaluated: true,
      passed: f.contactSignals.tel,
      severity: "high",
      pass: "The phone number is a tap-to-call link.",
      fail: "The phone number is not a tap-to-call link, so a phone visitor has to copy it by hand.",
      observed: { tel: f.contactSignals.tel, mailto: f.contactSignals.mailto },
    },
    {
      code: "published_hours",
      weight: 8,
      evaluated: true,
      passed: hasHours,
      severity: "high",
      pass: "Opening hours are published on the page.",
      fail: "No opening hours are published on the page.",
      observed: {},
    },
    {
      code: "services_listed",
      weight: 6,
      evaluated: true,
      passed: hasServices,
      severity: "medium",
      pass: "Services are named on the page.",
      fail: "No services are named on the page.",
      observed: {},
    },
    {
      code: "pricing_published",
      weight: 6,
      evaluated: true,
      passed: hasPricing,
      severity: "medium",
      pass: "Prices are published next to services.",
      fail: "No prices are published, so a first-time customer cannot tell what a cut costs.",
      observed: {},
    },
    {
      code: "address_or_map",
      weight: 8,
      evaluated: true,
      passed: hasMapOrAddress,
      severity: "high",
      pass: "The shop's location is on the page as an address or a map.",
      fail: "No address or map is on the page.",
      observed: { structuredData: f.structuredDataTypes },
    },
    {
      code: "page_title",
      weight: 5,
      evaluated: true,
      passed: (f.title ?? "").trim().length > 0,
      severity: "medium",
      pass: "The page has a title.",
      fail: "The page has no title, which is what a search result shows as its headline.",
      observed: { title: f.title },
    },
    {
      code: "meta_description",
      weight: 3,
      evaluated: true,
      passed: (f.metaDescription ?? "").trim().length > 0,
      severity: "medium",
      pass: "The page has a meta description.",
      fail: "The page has no meta description, so search engines write the summary themselves.",
      observed: {},
    },
    {
      code: "local_keyword",
      weight: 5,
      evaluated: localityEvaluated,
      passed: hasLocalKeyword,
      severity: "medium",
      pass: "The shop's town appears in the page title, description or heading.",
      fail: "The shop's town appears nowhere in the title, description or heading.",
      observed: { locality: input.locality ?? null },
    },
    {
      code: "image_alt_text",
      weight: 2,
      // Nothing to judge on a page with no images.
      evaluated: f.imageCount > 0,
      passed: f.imagesMissingAlt === 0,
      severity: "info",
      pass: "Every image carries alt text.",
      fail: `${f.imagesMissingAlt} of ${f.imageCount} images have no alt text.`,
      observed: { imagesMissingAlt: f.imagesMissingAlt, imageCount: f.imageCount },
    },
    {
      code: "photos_present",
      weight: 4,
      evaluated: true,
      passed: f.imageCount >= 3,
      severity: "medium",
      pass: "The page shows photos of the shop or its work.",
      fail: "The page shows almost no photos; a barbershop sells a look.",
      observed: { imageCount: f.imageCount },
    },
    {
      code: "reviews_on_site",
      weight: 4,
      evaluated: true,
      passed: REVIEW_SIGNAL.test(text),
      severity: "medium",
      pass: "Reviews or testimonials appear on the page.",
      fail: "No reviews or testimonials appear on the page.",
      observed: {},
    },
    {
      code: "staff_bios",
      weight: 2,
      evaluated: true,
      passed: STAFF_SIGNAL.test(text),
      severity: "info",
      pass: "The barbers are introduced on the page.",
      fail: "The barbers are not introduced anywhere on the page.",
      observed: {},
    },
    {
      code: "https",
      weight: 5,
      evaluated: true,
      passed: f.https,
      severity: "high",
      pass: "The site is served over HTTPS.",
      fail: "The site is not served over HTTPS; browsers mark it as not secure.",
      observed: { https: f.https, mixedContent: f.mixedContent },
    },
    {
      code: "social_linked",
      weight: 3,
      evaluated: true,
      passed: Object.keys(f.socialLinks).length > 0,
      severity: "info",
      pass: "The site links to at least one social profile.",
      fail: "The site links to no social profile.",
      observed: { socialLinks: f.socialLinks },
    },
  ];

  const evaluated = checks.filter((c) => c.evaluated);
  const possibleWeight = evaluated.reduce((n, c) => n + c.weight, 0);
  const earnedWeight = evaluated.reduce((n, c) => n + (c.passed ? c.weight : 0), 0);
  const score =
    possibleWeight > 0 ? Math.round((earnedWeight / possibleWeight) * 100) : null;

  const findings: AuditFinding[] = evaluated.map((c) => ({
    code: c.code,
    statement: c.passed ? c.pass : c.fail,
    // Everything here was read off a page we actually fetched, so every
    // finding can cite it. That is what lets the dimension be `verified`.
    evidenceUrl: finalUrl,
    observed: c.observed,
    confidence: "verified" as const,
    severity: c.passed ? ("info" as const) : c.severity,
    detector: DETECTOR,
  }));

  return {
    rubricVersion: BARBER_WEB_RUBRIC_VERSION,
    score,
    confidence: "verified",
    checksEvaluated: evaluated.length,
    checksPossible: checks.length,
    summary: `${evaluated.length} of ${checks.length} checks were evaluable on this page.`,
    findings,
  };
}

/**
 * What a prospect list's "Website / Web Presence" cell actually says.
 *
 * The WNY list is 50 rows and only 10 carry a URL. The other 40 are research
 * notes, and they are NOT all the same claim:
 *
 *   "No dedicated website confirmed"                     -> nothing found
 *   "Booksy presence; dedicated site not confirmed"      -> bookable, unowned
 *   "Square booking site / dedicated domain not confirmed"
 *   "Vistaprint/booking presence reported; ..."
 *
 * Collapsing the second kind into the first would put "there is no way to book
 * you online" in front of a shop that is already on Booksy. That is the fastest
 * way to lose the call, and it would also be false.
 */
export type WebPresence =
  | { kind: "url"; url: string }
  | { kind: "absent"; note: string }
  | { kind: "platform_only"; platform: string | null; note: string };

const NOTE_PLATFORMS: ReadonlyArray<readonly [string, RegExp]> = [
  ["square_appointments", /\bsquare\b/i],
  ["booksy", /\bbooksy\b/i],
  ["glossgenius", /\bgloss\s?genius\b/i],
  ["styleseat", /\bstyle\s?seat\b/i],
  ["vagaro", /\bvagaro\b/i],
  ["squire", /\bsquire\b/i],
  ["fresha", /\bfresha\b/i],
  ["vistaprint", /\bvistaprint\b/i],
];

/** A note that reports SOME bookable/web presence while denying an owned one. */
const PRESENCE_CLAIM = /\b(booking|book\s+online|presence|listing|page)\b/i;

export function classifyWebPresence(raw: string | null | undefined): WebPresence {
  const note = (raw ?? "").trim();
  if (note === "") return { kind: "absent", note: "" };
  if (/^https?:\/\//i.test(note)) return { kind: "url", url: note };

  let platform: string | null = null;
  for (const [name, re] of NOTE_PLATFORMS) {
    if (re.test(note)) {
      platform = name;
      break;
    }
  }
  // A named platform, or a note that reports a presence at all, means the shop
  // is findable and probably bookable — just not on anything it owns.
  if (platform !== null || PRESENCE_CLAIM.test(note)) {
    return { kind: "platform_only", platform, note };
  }
  return { kind: "absent", note };
}

/**
 * The shop has no website we could fetch — either the prospect list records
 * none, or the fetch failed.
 *
 * These are two DIFFERENT truths and they are not collapsed:
 *   - `absent`: the list says there is no site. That is a finding, and it is
 *     `inferred` (from the list, not from a fetch) with a score of 0 — there
 *     is genuinely nothing there to score.
 *   - `unreachable`: there is a URL but we could not read it. We do not know
 *     what is on it, so the dimension is `unknown` and carries NO score. It
 *     surfaces in the report as a gap, which is the honest outcome.
 */
export function auditWithoutPage(
  reason: "absent" | "unreachable" | "platform_only",
  detail: {
    url?: string | null;
    error?: string | null;
    source?: string | null;
    platform?: string | null;
    note?: string | null;
  },
): BarberWebAudit {
  if (reason === "platform_only") {
    // Two things are known from the list and nothing else is. The DIMENSION is
    // therefore unknown and carries no score -- we have not seen a page -- but
    // the two facts are real findings at `inferred` confidence. The schema
    // allows exactly this: a finding's confidence is its own, independent of
    // the dimension's.
    const named = detail.platform ?? "a booking platform";
    return {
      rubricVersion: BARBER_WEB_RUBRIC_VERSION,
      score: null,
      confidence: "unknown",
      checksEvaluated: 0,
      checksPossible: 0,
      summary:
        `No page was fetched. Two facts are taken from the prospect list: a booking presence on ` +
        `${named}, and no owned domain. The site itself has not been assessed.`,
      findings: [
        {
          code: "owned_domain",
          statement: `The shop's web presence is a page on ${named}; no owned domain was found.`,
          evidenceUrl: null,
          observed: {
            platform: detail.platform ?? null,
            source: detail.source ?? null,
            note: detail.note ?? null,
          },
          confidence: "inferred",
          severity: "high",
          detector: DETECTOR,
        },
        {
          // A PASS. Recording it is what stops the outreach from telling a shop
          // that is already bookable that it cannot be booked.
          code: "online_booking",
          statement: `A booking presence was found on ${named}, so customers can book without calling.`,
          evidenceUrl: null,
          observed: { platform: detail.platform ?? null, note: detail.note ?? null },
          confidence: "inferred",
          severity: "info",
          detector: DETECTOR,
        },
      ],
    };
  }
  if (reason === "absent") {
    return {
      rubricVersion: BARBER_WEB_RUBRIC_VERSION,
      score: 0,
      confidence: "inferred",
      checksEvaluated: 0,
      checksPossible: 0,
      summary:
        "No website to assess: the prospect list records none. Scored 0 because there is " +
        "nothing there, not because something scored badly.",
      findings: [
        {
          code: "no_website",
          statement:
            "No dedicated website was found for this shop, so there is no page for a customer to land on.",
          evidenceUrl: null,
          observed: { source: detail.source ?? null },
          confidence: "inferred",
          severity: "critical",
          detector: DETECTOR,
        },
      ],
    };
  }
  return {
    rubricVersion: BARBER_WEB_RUBRIC_VERSION,
    score: null,
    confidence: "unknown",
    checksEvaluated: 0,
    checksPossible: 0,
    summary: `The site could not be read (${detail.error ?? "no reason recorded"}), so nothing about it was assessed.`,
    findings: [
      {
        code: "website_unreachable",
        statement: `The site could not be read (${detail.error ?? "no reason recorded"}), so nothing about it was assessed.`,
        // An 'unknown' finding cannot cite evidence -- there was nothing to
        // link to. Migration 0049 enforces this; keeping it here means the
        // enforcement never has to fire.
        evidenceUrl: null,
        observed: { url: detail.url ?? null, error: detail.error ?? null },
        confidence: "unknown",
        severity: "high",
        detector: DETECTOR,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Judgment, kept separate from evidence
//
// Everything above reports what is on the page. Everything below is advice.
// The database keeps them in different tables for the same reason.
// ---------------------------------------------------------------------------

/** Failing finding codes -> the recommendation each one justifies. */
const RECOMMENDATION_RULES: ReadonlyArray<{
  code: string;
  priority: Priority;
  rank: number;
  title: string;
  detail: string;
  capabilityKey: string | null;
}> = [
  {
    code: "no_website",
    priority: "structural",
    rank: 1,
    title: "Put up a real site the shop owns",
    detail:
      "There is nowhere for a search result or a social profile to send anyone. A single page with hours, services, prices and a booking button covers most of what is missing.",
    capabilityKey: "owned_website",
  },
  {
    code: "online_booking",
    priority: "structural",
    rank: 1,
    title: "Let customers book without calling",
    detail:
      "Every visitor who arrives outside opening hours currently has no way to act. Online booking is the single change with the largest effect on this shop's numbers.",
    capabilityKey: "booking",
  },
  {
    code: "owned_domain",
    priority: "structural",
    rank: 2,
    title: "Move off the booking platform's hosted page onto an owned site",
    detail:
      "The shop's presence, its reviews and its customer list currently belong to someone else's platform. An owned site keeps the booking flow and the audience.",
    capabilityKey: "owned_website",
  },
  {
    code: "tap_to_call",
    priority: "quick_win",
    rank: 1,
    title: "Make the phone number tappable",
    detail:
      "Most visitors are on a phone. Wrapping the number in a tel: link turns a two-step copy-paste into one tap.",
    capabilityKey: null,
  },
  {
    code: "published_hours",
    priority: "quick_win",
    rank: 2,
    title: "Publish opening hours on the page",
    detail:
      '"Are they open right now" is the most common question a local page is asked.',
    capabilityKey: null,
  },
  {
    code: "mobile_viewport",
    priority: "quick_win",
    rank: 3,
    title: "Add a mobile viewport tag",
    detail:
      "Without it the page renders at desktop width on a phone and the visitor pinches to read it. One line of HTML.",
    capabilityKey: null,
  },
  {
    code: "pricing_published",
    priority: "quick_win",
    rank: 4,
    title: "Publish prices next to services",
    detail:
      "A first-time customer who cannot tell what a cut costs books somewhere that says.",
    capabilityKey: null,
  },
  {
    code: "address_or_map",
    priority: "quick_win",
    rank: 5,
    title: "Put the address and a map on the page",
    detail: "It is also the strongest local-search signal a page can carry.",
    capabilityKey: null,
  },
  {
    code: "local_keyword",
    priority: "quick_win",
    rank: 6,
    title: "Name the town in the page title",
    detail:
      "Local searches are typed with a place in them. The page should contain the place.",
    capabilityKey: null,
  },
  {
    code: "reviews_on_site",
    priority: "structural",
    rank: 3,
    title: "Ask every customer for a review, and show them",
    detail:
      "Reviews are the deciding factor for a first-time local customer. Asking has to be systematic, not remembered.",
    capabilityKey: "review_engine",
  },
  {
    code: "https",
    priority: "quick_win",
    rank: 7,
    title: "Serve the site over HTTPS",
    detail: 'Browsers label an HTTP page "Not secure" in the address bar.',
    capabilityKey: null,
  },
];

/**
 * Recommendations for the findings that FAILED. A passing check produces no
 * advice, because there is nothing to fix — a report that recommends something
 * for every check is a template, not an audit.
 */
export function recommendFrom(findings: readonly AuditFinding[]): Recommendation[] {
  // A finding is "failing" when it was recorded at a severity above info.
  const failing = new Set(
    findings.filter((f) => f.severity !== "info").map((f) => f.code),
  );
  return RECOMMENDATION_RULES.filter((r) => failing.has(r.code))
    .map((r) => ({
      priority: r.priority,
      rank: r.rank,
      title: r.title,
      detail: r.detail,
      capabilityKey: r.capabilityKey,
      addressesCode: r.code,
    }))
    .sort((a, b) =>
      a.priority === b.priority
        ? a.rank - b.rank
        : a.priority === "structural"
          ? -1
          : 1,
    );
}

/** Failing codes, worst first. Drives the outreach hook. */
const HOOK_ORDER = [
  "no_website",
  "online_booking",
  "owned_domain",
  "published_hours",
  "tap_to_call",
  "mobile_viewport",
  "address_or_map",
  "pricing_published",
  "reviews_on_site",
  "https",
] as const;

const HOOKS: Readonly<Record<string, string>> = {
  no_website:
    "There is no website behind your name, so every search that finds you ends there.",
  online_booking:
    "There is no way to book you online — every visitor who lands outside opening hours leaves.",
  owned_domain:
    "Your only web presence is a page on someone else's booking platform, and so is your audience.",
  published_hours:
    "Your hours are not on your page, which is the first thing anyone checks.",
  tap_to_call:
    "Your phone number is not tappable, so a customer on a phone has to copy it by hand.",
  mobile_viewport:
    "Your page renders at desktop width on a phone, where most of your customers see it.",
  address_or_map:
    "There is no address or map on your page, which is the strongest local-search signal you have.",
  pricing_published:
    "Your prices are not published, and a first-time customer books where they can see the price.",
  reviews_on_site:
    "There are no reviews anywhere on your page, and reviews decide first-time local customers.",
  https: 'Your site is served over HTTP, so browsers label it "Not secure".',
};

/**
 * The single strongest failing observation, phrased for outreach. Returns null
 * when nothing failed — the tool has no hook for a shop that is doing fine, and
 * inventing one would be inventing a finding.
 */
export function outreachHook(
  findings: readonly AuditFinding[],
): { code: string; hook: string } | null {
  const failing = new Set(
    findings.filter((f) => f.severity !== "info").map((f) => f.code),
  );
  for (const code of HOOK_ORDER) {
    if (failing.has(code) && HOOKS[code]) return { code, hook: HOOKS[code] };
  }
  return null;
}
