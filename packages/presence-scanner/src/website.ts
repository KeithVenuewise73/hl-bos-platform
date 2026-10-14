// Website inspection: the EXISTING HL-BOS website scanner, pointed at live
// prospect websites.
//
// runScan (supabase/functions/_shared/discovery/scan.ts) does the safety work
// and is used unchanged: SSRF validation of the target and of every redirect
// hop, DNS-rebinding checks, the size cap, the content-type check, then the
// deterministic extractor and the versioned rubric. AI analysis is NOT used --
// nothing here may influence the score except deterministic evidence.
//
// This file adds only what the presence question needs on top:
//   * recognising Facebook / link-in-bio "websites" from the address, so they
//     are never fetched;
//   * asking robots.txt first;
//   * the conversion detectors (detectors.ts);
//   * turning it all into evidence-carrying findings with honest statuses.

import {
  runScan,
  type FetchResult,
} from "../../../supabase/functions/_shared/discovery/scan.ts";
import { extractFindings } from "../../../supabase/functions/_shared/discovery/extract.ts";
import type { DimensionScore } from "../../../supabase/functions/_shared/discovery/rubric.ts";
import { detectConversion, type Detection } from "./detectors.ts";
import { classifyUrl } from "./normalize.ts";
import { robotsAllows } from "./robots.ts";
import type { Confidence, Finding, FindingStatus, WebsiteStatus } from "./types.ts";

export interface WebEgress {
  resolve: (host: string) => Promise<string[]>;
  fetchPage: (url: string) => Promise<FetchResult>;
  /** Fetch an origin's robots.txt through the same safe client. undefined = none / unreachable. */
  fetchRobots: (
    origin: string,
  ) => Promise<{ status: number; body: string } | undefined>;
}

export interface WebsiteInspection {
  status: WebsiteStatus;
  url: string | undefined;
  finalUrl: string | undefined;
  /** One plain-English sentence about what happened. */
  summary: string;
  findings: Finding[];
  rubric: { version: string; dimensions: DimensionScore[] } | undefined;
}

const HOMEPAGE_ONLY =
  "Only the homepage is inspected, so it may exist on another page of the site.";

function f(
  key: string,
  label: string,
  status: FindingStatus,
  evidence: string,
  at: string,
  confidence: Confidence = "high",
): Finding {
  return {
    key,
    label,
    status,
    source: "website",
    observedAt: at,
    evidence,
    confidence,
  };
}

/**
 * Inspect a website address that is already known (from Google, an import, or
 * a reviewer). `url` undefined means no address was available to us.
 */
export async function inspectWebsite(
  url: string | undefined,
  egress: WebEgress,
  now: Date,
): Promise<WebsiteInspection> {
  const at = now.toISOString();
  const base = { url, finalUrl: undefined, rubric: undefined };
  if (!url) {
    return {
      ...base,
      status: "not_checked",
      summary: "No website address was available, so no website was inspected.",
      findings: [],
    };
  }

  const kind = classifyUrl(url);
  if (kind.kind === "social") {
    return {
      ...base,
      status: "social_only",
      summary: `The listed website is a ${kind.platform} page, not a website of their own.`,
      findings: [
        f(
          "website.social_only",
          `Uses a ${kind.platform} page as its website`,
          "present",
          `Website address is ${url}. ${kind.platform} pages are recognised from the address and never fetched.`,
          at,
        ),
      ],
    };
  }
  if (kind.kind === "link_in_bio") {
    return {
      ...base,
      status: "link_in_bio",
      summary: "The listed website is a link-in-bio page, not a website of their own.",
      findings: [
        f(
          "website.link_in_bio",
          "Uses a link-in-bio page as its website",
          "present",
          `Website address is ${url} (a link-in-bio service).`,
          at,
        ),
      ],
    };
  }
  if (kind.kind === "retired_google_site") {
    return {
      ...base,
      status: "retired_google_site",
      summary:
        "The listed website is a Google business.site page; Google retired those in 2024.",
      findings: [
        f(
          "website.retired_google_site",
          "Website is a retired Google business.site page",
          "present",
          `Website address is ${url}. Google shut down business.site websites in 2024, so this address no longer works as a website.`,
          at,
        ),
      ],
    };
  }

  // Ask robots.txt first. If it cannot be read, the site is treated as allowing
  // the homepage -- the standard reading of a missing robots.txt.
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return {
      ...base,
      status: "unreachable",
      summary: "The website address is not a valid web address.",
      findings: [
        f(
          "website.reachable",
          "Website address is invalid",
          "missing",
          `"${url}" is not a valid web address.`,
          at,
        ),
      ],
    };
  }
  const robots = await egress.fetchRobots(origin).catch(() => undefined);
  if (robots && robots.status === 200) {
    const verdict = robotsAllows(robots.body, "/");
    if (!verdict.allowed) {
      return {
        ...base,
        status: "blocked",
        summary:
          "The site's robots.txt asks automated tools not to read its homepage, so it was not inspected.",
        findings: [
          f(
            "website.reachable",
            "Website not inspected (robots.txt)",
            "blocked",
            `${origin}/robots.txt says "${verdict.rule}" for this scanner. The homepage was not fetched.`,
            at,
          ),
        ],
      };
    }
  }

  // Capture the page the existing scanner fetched, so the conversion detectors
  // read exactly the bytes that passed its safety checks -- no second fetch.
  let captured: FetchResult | undefined;
  const scan = await runScan({
    rawUrl: url,
    resolve: egress.resolve,
    fetchPage: async (u) => {
      captured = await egress.fetchPage(u);
      return captured;
    },
  });

  if (scan.status === "failed" || !captured) {
    const err = scan.error ?? "unknown_error";
    // A lapsed domain or a redirect loop is a broken site; a refusal or an
    // address the safety checks will not contact is "could not inspect".
    const brokenNotBlocked =
      err === "ssrf_blocked:dns_no_records" ||
      err === "ssrf_blocked:too_many_redirects";
    const blocked =
      (err.startsWith("ssrf_blocked") && !brokenNotBlocked) ||
      /^http_(401|403|429|451)$/.test(err);
    const reason = explainScanError(err);
    return {
      ...base,
      url: scan.normalizedUrl,
      status: blocked ? "blocked" : "unreachable",
      summary: blocked
        ? `The website could not be inspected: ${reason}.`
        : `The website did not load: ${reason}.`,
      findings: [
        f(
          "website.reachable",
          blocked
            ? "Website could not be inspected"
            : "Website is broken or unreachable",
          blocked ? "blocked" : "missing",
          `${scan.normalizedUrl}: ${reason} (scanner code: ${err}).`,
          at,
        ),
      ],
    };
  }

  const page = captured;
  const w = extractFindings(page.body, page.headers, page.finalUrl);
  const det = detectConversion(page.body, now);
  const home = page.finalUrl;
  const out: Finding[] = [];
  const notFound = (what: string) =>
    `Not found on the homepage ${home}. ${HOMEPAGE_ONLY} (Looked for ${what}.)`;
  const fromDetection = (
    key: string,
    okLabel: string,
    missLabel: string,
    d: Detection | undefined,
    what: string,
  ) => {
    out.push(
      d?.found
        ? f(key, okLabel, "present", d.evidence ?? "seen on the homepage", at)
        : f(key, missLabel, "not_found", notFound(what), at, "medium"),
    );
  };

  out.push(
    f(
      "website.reachable",
      "Website loads",
      "present",
      `${home} returned HTTP ${page.status} (${page.bytes.toLocaleString("en-US")} bytes${page.redirectChain.length ? `, after ${page.redirectChain.length} redirect(s)` : ""}).`,
      at,
    ),
  );
  out.push(
    w.https
      ? f("site.https", "Uses HTTPS", "present", `Final address ${home} is HTTPS.`, at)
      : f(
          "site.https",
          "No HTTPS (not secure)",
          "missing",
          `Final address ${home} is plain HTTP; browsers mark it "Not secure".`,
          at,
        ),
  );
  const title = w.title?.trim() ?? "";
  const weakTitle =
    title.length > 0 &&
    (title.length < 10 || /^(home|homepage|welcome|untitled|index)$/i.test(title));
  out.push(
    title === ""
      ? f("site.title", "No page title", "missing", `The homepage has no <title>.`, at)
      : weakTitle
        ? f(
            "site.title",
            "Weak page title",
            "missing",
            `Title is just "${title}" -- too short or generic to rank for local searches.`,
            at,
            "medium",
          )
        : f(
            "site.title",
            "Has a page title",
            "present",
            `Title: "${title.slice(0, 90)}"`,
            at,
          ),
  );
  out.push(
    w.metaDescription
      ? f(
          "site.meta_description",
          "Has a meta description",
          "present",
          `"${w.metaDescription.slice(0, 120)}"`,
          at,
        )
      : f(
          "site.meta_description",
          "No meta description",
          "missing",
          'The homepage has no <meta name="description">, so Google writes its own snippet.',
          at,
        ),
  );
  out.push(
    w.hasViewport
      ? f(
          "site.viewport",
          "Mobile-ready (viewport set)",
          "present",
          "The homepage sets a mobile viewport.",
          at,
        )
      : f(
          "site.viewport",
          "Not mobile-ready",
          "missing",
          'No <meta name="viewport">: on a phone the page renders as a shrunken desktop page.',
          at,
        ),
  );
  out.push(
    w.structuredDataTypes.length
      ? f(
          "site.structured_data",
          "Has structured data",
          "present",
          `Schema types: ${w.structuredDataTypes.slice(0, 5).join(", ")}`,
          at,
        )
      : f(
          "site.structured_data",
          "No structured data",
          "missing",
          "No JSON-LD structured data (e.g. LocalBusiness) on the homepage.",
          at,
          "medium",
        ),
  );
  out.push(
    w.analyticsTags.length
      ? f(
          "site.analytics",
          "Has analytics",
          "present",
          `Detected: ${w.analyticsTags.join(", ")}`,
          at,
        )
      : f(
          "site.analytics",
          "No analytics detected",
          "not_found",
          "No Google Analytics, Tag Manager or Meta Pixel code found on the homepage.",
          at,
          "medium",
        ),
  );
  const social = Object.keys(w.socialLinks).filter((k) => k !== "google_business");
  out.push(
    social.length
      ? f(
          "site.social_links",
          "Links to social profiles",
          "present",
          `Links to: ${social.join(", ")}`,
          at,
        )
      : f(
          "site.social_links",
          "No social links",
          "not_found",
          notFound(
            "links to Facebook, Instagram, TikTok, YouTube, LinkedIn, X or Yelp",
          ),
          at,
          "medium",
        ),
  );

  // Conversion paths.
  out.push(
    w.contactSignals.tel
      ? f(
          "site.call",
          "Click-to-call",
          "present",
          "A tel: link is on the homepage.",
          at,
        )
      : f(
          "site.call",
          "No click-to-call",
          "not_found",
          notFound("a tel: phone link"),
          at,
          "medium",
        ),
  );
  out.push(
    w.contactSignals.mailto
      ? f(
          "site.email",
          "Email link",
          "present",
          "A mailto: link is on the homepage.",
          at,
        )
      : f(
          "site.email",
          "No email link",
          "not_found",
          notFound("a mailto: link"),
          at,
          "medium",
        ),
  );
  const quote = det.capabilities.form;
  out.push(
    w.forms > 0
      ? f(
          "site.form",
          "Contact or quote form",
          "present",
          `${w.forms} form(s) on the homepage${quote?.found ? `; also ${quote.evidence}` : ""}.`,
          at,
        )
      : quote?.found
        ? f(
            "site.form",
            "Contact or quote request path",
            "present",
            quote.evidence ?? "quote link",
            at,
          )
        : f(
            "site.form",
            "No contact or quote form",
            "not_found",
            notFound("a <form> or a quote/estimate link"),
            at,
            "medium",
          ),
  );
  fromDetection(
    "site.booking",
    "Online booking",
    "No online booking",
    det.capabilities.booking,
    "a booking or reservation tool or link",
  );
  fromDetection(
    "site.ordering",
    "Online ordering",
    "No online ordering",
    det.capabilities.ordering,
    "an online ordering tool or link",
  );
  fromDetection(
    "site.menu",
    "Menu",
    "No menu",
    det.capabilities.menu,
    "a menu link, menu page or menu heading",
  );
  fromDetection(
    "site.pricing",
    "Prices shown",
    "No pricing",
    det.capabilities.pricing,
    "a pricing link or at least three prices",
  );
  fromDetection(
    "site.services",
    "Services described",
    "No services information",
    det.capabilities.services,
    "a services or programs link or heading",
  );
  fromDetection(
    "site.directions",
    "Map or directions",
    "No map or directions",
    det.capabilities.directions,
    "a map embed or directions link",
  );
  fromDetection(
    "site.registration",
    "Online registration",
    "No online registration",
    det.capabilities.registration,
    "a registration tool or sign-up link",
  );

  out.push(
    det.vendors.length
      ? f(
          "site.vendors",
          "Conversion tools detected",
          "present",
          det.vendors.map((v) => `${v.name} (${v.category})`).join(", "),
          at,
        )
      : f(
          "site.vendors",
          "No conversion tools detected",
          "not_found",
          notFound(
            "links or embeds from booking, ordering, reservation or registration services",
          ),
          at,
          "medium",
        ),
  );
  const thisYear = now.getUTCFullYear();
  out.push(
    det.copyrightYear === undefined
      ? f(
          "site.copyright",
          "Copyright year not shown",
          "not_checked",
          "No static copyright year on the homepage (it may be written by script), so freshness was not judged.",
          at,
          "low",
        )
      : f(
          "site.copyright",
          det.copyrightYear < thisYear - 2
            ? `Copyright year ${det.copyrightYear} (possibly stale)`
            : `Copyright year ${det.copyrightYear}`,
          det.copyrightYear < thisYear - 2 ? "missing" : "present",
          `Footer says © ${det.copyrightYear}; it is now ${thisYear}. An old year often means the site is not maintained.`,
          at,
          "medium",
        ),
  );

  if (scan.dimensions.length) {
    out.push(
      f(
        "site.rubric",
        "HL-BOS website rubric",
        "present",
        `${scan.rubricVersion}: ${scan.dimensions.map((d) => `${d.dimension.replace(/_/g, " ")} ${d.score}/5`).join(", ")}.`,
        at,
      ),
    );
  }

  return {
    status: "ok",
    url: scan.normalizedUrl,
    finalUrl: home,
    summary: `The homepage loaded and was inspected (${w.https ? "HTTPS" : "not HTTPS"}).`,
    findings: out,
    rubric: { version: scan.rubricVersion, dimensions: scan.dimensions },
  };
}

/** The scanner's error codes, in plain English. */
export function explainScanError(code: string): string {
  if (
    code === "ssrf_blocked:dns_no_records" ||
    /ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(code)
  )
    return "the domain name does not resolve (the address may have lapsed)";
  if (code.startsWith("ssrf_blocked:dns_") || code.startsWith("ssrf_blocked:ip_"))
    return "the address points at a private or reserved network, which the scanner refuses to contact";
  if (code === "ssrf_blocked:too_many_redirects") return "it redirects too many times";
  if (code === "ssrf_blocked:response_too_large")
    return "the page is larger than the scanner's 5 MB limit";
  if (code.startsWith("ssrf_blocked:"))
    return "the address failed the scanner's safety checks";
  if (code.startsWith("unsupported_content_type:"))
    return "the address does not return a web page";
  const http = code.match(/^http_(\d{3})$/);
  if (http) {
    const s = Number(http[1]);
    if (s === 401 || s === 403) return `the site refused the request (HTTP ${s})`;
    if (s === 429) return "the site is rate-limiting automated requests (HTTP 429)";
    if (s === 404) return "the homepage returns Page Not Found (HTTP 404)";
    if (s >= 500) return `the site's server is failing (HTTP ${s})`;
    return `the site answered with an error (HTTP ${s})`;
  }
  if (/timeout|timed out/i.test(code)) return "the site did not respond in time";
  if (/certificate|SSL|TLS|CERT/i.test(code))
    return "the site's security certificate is invalid";
  if (/ECONNREFUSED|ECONNRESET|socket hang up/i.test(code))
    return "the server refused or dropped the connection";
  return "the page could not be fetched";
}
