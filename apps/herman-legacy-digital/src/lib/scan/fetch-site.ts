// Live website fetcher for the free Business Scan (Node runtime only).
//
// This is the ONE place the platform makes an outbound request to a
// customer-supplied address, so every safety control lives here:
//   • normalizeUrl() gates scheme/host up front (ssrf.ts)
//   • DNS is resolved and EVERY returned address is checked against isBlockedIp
//   • redirects are followed MANUALLY, re-validating each hop (a public URL can
//     302 to an internal one)
//   • the response is size-capped and time-bounded
// Nothing here fabricates content: on any failure it returns a plain reason and
// the caller shows an honest "we could not read that site" state.

import { lookup } from "node:dns/promises";
import { isBlockedIp, normalizeUrl } from "./ssrf";

export interface FetchResult {
  ok: boolean;
  html?: string;
  finalUrl?: string;
  status?: number;
  error?: string;
}

export interface SitePagesResult {
  ok: boolean;
  pages: { url: string; html: string }[];
  homepageUrl?: string;
  error?: string;
}

const TIMEOUT_MS = 9_000;
const MAX_BYTES = 2_000_000; // 2 MB of HTML is far more than a homepage needs
const MAX_REDIRECTS = 4;
const USER_AGENT =
  "HermanLegacyBot/1.0 (+https://hermanlegacydigital.com; business transformation scan)";

/** Refuse any address DNS returns that falls in a non-public range. */
async function resolvesToPublicOnly(hostname: string): Promise<boolean> {
  try {
    const addrs = await lookup(hostname, { all: true });
    if (addrs.length === 0) return false;
    return addrs.every((a) => !isBlockedIp(a.address));
  } catch {
    return false;
  }
}

async function readCapped(res: Response): Promise<string> {
  const body = res.body;
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(concat(chunks));
}

function concat(chunks: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const c of chunks) len += c.byteLength;
  const out = new Uint8Array(len);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/**
 * Fetch the HTML at a customer-supplied URL, safely. Returns honest failure
 * states rather than throwing. `html` is only present when ok is true.
 */
export async function fetchSiteHtml(rawUrl: string): Promise<FetchResult> {
  const first = normalizeUrl(rawUrl);
  if (!first.ok || !first.url) {
    return { ok: false, error: first.reason ?? "Invalid address." };
  }

  let current = first.url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await resolvesToPublicOnly(current.hostname))) {
      return { ok: false, error: "That address points to a private network." };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml",
        },
      });
    } catch {
      clearTimeout(timer);
      return { ok: false, error: "We could not reach that website." };
    }
    clearTimeout(timer);

    // Manual redirect handling: re-validate the next hop.
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        return { ok: false, error: "That website returned an incomplete redirect." };
      }
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        return { ok: false, error: "That website redirected to an invalid address." };
      }
      const verdict = normalizeUrl(next.toString());
      if (!verdict.ok || !verdict.url) {
        return { ok: false, error: verdict.reason ?? "Unsafe redirect target." };
      }
      current = verdict.url;
      continue;
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: `That website responded with an error (${res.status}).`,
      };
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !/text\/html|application\/xhtml/i.test(contentType)) {
      return {
        ok: false,
        error: "That address did not return a web page we can analyze.",
      };
    }

    const html = await readCapped(res);
    if (!html.trim()) {
      return { ok: false, error: "That website returned an empty page." };
    }
    return { ok: true, html, finalUrl: current.toString(), status: res.status };
  }

  return { ok: false, error: "That website redirected too many times." };
}

// Pages a real analyst reads first, in priority order. A same-domain link whose
// path contains one of these keywords is fetched ahead of generic pages.
const PRIORITY_KEYWORDS = [
  "service",
  "solution",
  "product",
  "about",
  "contact",
  "pricing",
  "price",
  "plan",
  "work",
  "portfolio",
  "case",
  "team",
];
const ASSET_RE = /\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4|mov|css|js|xml|ico|woff2?)$/i;

function sameSite(a: URL, b: URL): boolean {
  const strip = (h: string) => h.replace(/^www\./, "");
  return strip(a.hostname) === strip(b.hostname);
}

/**
 * Extract up to `max` same-domain internal page URLs from a homepage's HTML,
 * prioritizing the pages a consultant would read first (services, about,
 * contact…). Fragments, query strings, and asset links are dropped; paths are
 * de-duplicated. Pure and unit-tested.
 */
export function extractInternalLinks(
  html: string,
  base: string,
  max: number,
): string[] {
  let baseUrl: URL;
  try {
    baseUrl = new URL(base);
  } catch {
    return [];
  }
  const hrefs = html.match(/<a[^>]+href=["']([^"']+)["']/gi) ?? [];
  const seen = new Set<string>([baseUrl.pathname.replace(/\/$/, "") || "/"]);
  const scored: { url: string; score: number }[] = [];
  for (const tag of hrefs) {
    const raw = tag.match(/href=["']([^"']+)["']/i)?.[1] ?? "";
    if (!raw || raw.startsWith("#") || /^(mailto:|tel:|javascript:)/i.test(raw))
      continue;
    let u: URL;
    try {
      u = new URL(raw, baseUrl);
    } catch {
      continue;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") continue;
    if (!sameSite(u, baseUrl)) continue;
    if (ASSET_RE.test(u.pathname)) continue;
    const path = u.pathname.replace(/\/$/, "") || "/";
    if (seen.has(path)) continue;
    seen.add(path);
    const lower = path.toLowerCase();
    const idx = PRIORITY_KEYWORDS.findIndex((k) => lower.includes(k));
    const score = idx === -1 ? PRIORITY_KEYWORDS.length : idx;
    u.hash = "";
    u.search = "";
    scored.push({ url: u.toString(), score });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, max).map((s) => s.url);
}

/**
 * Read the site, not just the homepage: fetch the homepage, then fetch up to
 * `maxPages - 1` priority internal pages, each through the same SSRF-safe path.
 * Returns the pages actually read (always at least the homepage on success).
 */
export async function fetchSitePages(
  rawUrl: string,
  maxPages = 5,
): Promise<SitePagesResult> {
  const home = await fetchSiteHtml(rawUrl);
  if (!home.ok || !home.html || !home.finalUrl) {
    return {
      ok: false,
      pages: [],
      error: home.error ?? "We could not read that website.",
    };
  }
  const pages: { url: string; html: string }[] = [
    { url: home.finalUrl, html: home.html },
  ];
  const links = extractInternalLinks(home.html, home.finalUrl, maxPages - 1);
  for (const link of links) {
    if (pages.length >= maxPages) break;
    const res = await fetchSiteHtml(link);
    if (res.ok && res.html && res.finalUrl) {
      // Guard against a redirect collapsing two links to the same page.
      if (!pages.some((p) => p.url === res.finalUrl)) {
        pages.push({ url: res.finalUrl, html: res.html });
      }
    }
  }
  return { ok: true, pages, homepageUrl: home.finalUrl };
}
