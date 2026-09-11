/**
 * Are the shop pages actually being served as WEB PAGES?
 *
 * This exists because "deployed and answering" and "a customer can read it"
 * turned out to be different things, and only a live request tells them apart.
 *
 * Supabase's own documentation is explicit: "HTML content is not supported.
 * GET requests that return text/html will be rewritten to text/plain."
 * (https://supabase.com/docs/guides/functions/http-methods). Serving HTML from
 * an Edge Function requires a custom domain. Until the pages have one, the
 * `site` function answers correctly and a browser still shows the page's source
 * code instead of the page.
 *
 * So the console does not report "deployed" and leave it there. It asks the
 * live URL and reports what a customer would actually get.
 *
 * THE PROBE. It requests a slug that cannot exist, which returns the function's
 * own 404 page -- real HTML, from the real deployment, needing no shop to have
 * published anything. That matters: today no shop has a page, and a check that
 * could only run once one did would tell us nothing for weeks.
 */

/** A slug the constraint permits but nothing will ever be published at. */
export const PROBE_SLUG = "hlbos-serving-probe-not-a-shop";

export interface ProbeResult {
  /** Absent when the request itself failed. */
  status?: number;
  contentType?: string | null;
  error?: string;
}

export interface ServingVerdict {
  /** True only when a browser would render the page rather than show its source. */
  servedAsWebPage: boolean;
  headline: string;
  detail: string;
  /** What would change it, when it is not yet true. Empty when it is. */
  remedy: string;
}

export function probeUrl(base: string): string {
  return `${base.replace(/\/+$/, "")}/${PROBE_SLUG}`;
}

/**
 * Where shop pages live. Decided 2026-09-11 (ADR-0003): a subdomain of the
 * agency's own domain, served by `apps/shop-pages` on the existing Coolify
 * server -- NOT the Supabase function URL, which cannot serve HTML.
 *
 * Hardcoded deliberately. This is a fact about the business, not a setting: if
 * it ever changes, the change belongs in a reviewed commit next to the ADR that
 * explains it, rather than in a file on one machine.
 */
export const SHOP_PAGES_BASE = "https://shops.hermanlegacydigital.com";

export interface ResolvedBase {
  base: string;
  /** True when a machine-local override is in force rather than the real one. */
  overridden: boolean;
}

/**
 * The address to check. An override exists for pointing the console at a
 * staging deployment; without one it checks the real address, including before
 * that address exists -- which is the honest thing to report, not a reason to
 * check something easier.
 */
export function resolveSiteBase(override: string | null | undefined): ResolvedBase {
  const t = (override ?? "").trim();
  return t === ""
    ? { base: SHOP_PAGES_BASE, overridden: false }
    : { base: t, overridden: true };
}

function isHtml(contentType: string | null | undefined): boolean {
  return (contentType ?? "").toLowerCase().includes("text/html");
}

/**
 * What a customer would get, in plain English.
 *
 * Deliberately says nothing about whether a SHOP has a page -- that is a
 * separate fact, shown separately. This answers only: if there were a page
 * here, would a browser render it?
 */
export function describeServing(r: ProbeResult): ServingVerdict {
  if (r.error !== undefined || r.status === undefined) {
    return {
      servedAsWebPage: false,
      headline: "The page server could not be reached",
      detail:
        r.error && r.error.trim() !== ""
          ? `The request failed: ${r.error}`
          : "The request failed, with no reason given.",
      remedy:
        "Nothing is answering at that address yet. Either it has not been deployed, the " +
        "subdomain does not point at it, or this machine cannot reach it -- a firewall " +
        "here causes this as readily as a server that is down.",
    };
  }

  // The probe asks for a slug nothing is published at, so 404 is the CORRECT
  // answer. Anything else means the request did not reach the function.
  if (r.status !== 404) {
    return {
      servedAsWebPage: false,
      headline: "Something else is answering at this address",
      detail:
        `A page that cannot exist returned ${r.status}, and the page server always ` +
        "answers 404 for one of those. The address is pointing somewhere else.",
      remedy: "Check where the domain points before reading anything else here.",
    };
  }

  if (isHtml(r.contentType)) {
    return {
      servedAsWebPage: true,
      headline: "Shop pages are served as real web pages",
      detail:
        "A browser opening a published page renders it. This was checked by asking " +
        "the live address, not by assuming.",
      remedy: "",
    };
  }

  return {
    servedAsWebPage: false,
    headline: "Pages would show as source code, not as pages",
    detail:
      `The server answered correctly, but sent it as "${r.contentType ?? "no content type"}" ` +
      'rather than "text/html". Supabase rewrites HTML to plain text on its shared ' +
      "supabase.co address, so a customer opening a shop's page would see the page's " +
      "code instead of the page.",
    remedy:
      "The pages need their own address. Nothing else about them has to change -- " +
      "the server, the content and the safety checks are already right.",
  };
}
