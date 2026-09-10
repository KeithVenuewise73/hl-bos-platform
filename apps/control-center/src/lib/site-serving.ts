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
 * The default address, when nothing has been configured. Derived from the
 * project ref rather than hardcoded, because a second environment must not
 * silently probe production's.
 */
export function defaultSiteBase(projectRef: string | null): string | null {
  if (!projectRef) return null;
  return `https://${projectRef}.supabase.co/functions/v1/site`;
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
        "This is checked from this machine, so a firewall or a dropped connection here " +
        "can cause it as easily as the server being down.",
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
