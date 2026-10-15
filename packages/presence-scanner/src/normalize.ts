// Normalization: URLs, domains, phone numbers and names, so two sources that
// describe the same business produce the same key -- and so a Facebook page is
// recognised as a Facebook page before anything tries to fetch it.

import { normalizeUrl } from "../../../supabase/functions/_shared/discovery/url.ts";

/**
 * Turn whatever a person or Google typed into an absolute http(s) URL, or
 * undefined. "acme.com", "www.acme.com/", "HTTPS://Acme.com" all work.
 */
export function toUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim();
  if (t === "" || /^none$/i.test(t)) return undefined;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    if (!u.hostname.includes(".")) return undefined;
    // Reuse the scanner's canonical form (lowercase host, tracking params gone).
    return normalizeUrl(u.toString());
  } catch {
    return undefined;
  }
}

/** "https://www.Acme.com/about" -> "acme.com". */
export function domainOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

/** US phone numbers to 10 digits; anything else to its digits. */
export function normalizePhone(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let d = raw.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.length >= 7 ? d : undefined;
}

/** Display form for a 10-digit US number. */
export function formatPhone(digits: string | undefined): string | undefined {
  if (!digits) return undefined;
  return digits.length === 10
    ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    : digits;
}

const NAME_NOISE =
  /\b(llc|inc|incorporated|co|company|corp|corporation|ltd|the|and)\b/g;

/** Lowercase, punctuation and corporate suffixes removed, spaces collapsed. */
export function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(NAME_NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STREET_ABBR: [RegExp, string][] = [
  [/\bstreet\b/g, "st"],
  [/\bavenue\b/g, "ave"],
  [/\broad\b/g, "rd"],
  [/\bdrive\b/g, "dr"],
  [/\bboulevard\b/g, "blvd"],
  [/\blane\b/g, "ln"],
  [/\bparkway\b/g, "pkwy"],
  [/\bplace\b/g, "pl"],
  [/\bcourt\b/g, "ct"],
  [/\bsuite\b/g, "ste"],
];

/** Street address reduced to the part that identifies it: "123 main st". */
export function normalizeAddress(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let a = raw.toLowerCase().split(",")[0] ?? "";
  a = a.replace(/[^a-z0-9 ]+/g, " ");
  for (const [re, s] of STREET_ABBR) a = a.replace(re, s);
  a = a.replace(/\s+/g, " ").trim();
  return a === "" ? undefined : a;
}

// --- What kind of "website" is this? ---------------------------------------

const SOCIAL_HOSTS: [RegExp, string][] = [
  [/(^|\.)facebook\.com$|(^|\.)fb\.com$|(^|\.)fb\.me$/, "Facebook"],
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)twitter\.com$|(^|\.)x\.com$/, "X (Twitter)"],
  [/(^|\.)nextdoor\.com$/, "Nextdoor"],
  [/(^|\.)yelp\.com$/, "Yelp"],
  [/(^|\.)linkedin\.com$/, "LinkedIn"],
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, "YouTube"],
];

const LINK_IN_BIO_HOSTS =
  /(^|\.)(linktr\.ee|linktree\.com|beacons\.ai|lnk\.bio|linkin\.bio|taplink\.cc|msha\.ke|bio\.link|campsite\.bio|solo\.to|hoo\.be|direct\.me|carrd\.co)$/;

export type UrlKind =
  | { kind: "site" }
  | { kind: "social"; platform: string }
  | { kind: "link_in_bio" }
  | { kind: "retired_google_site" };

/**
 * Classify a website address WITHOUT fetching it. Social and link-in-bio pages
 * are recognised from the address alone -- the scanner never fetches Facebook,
 * Instagram, Yelp or similar pages.
 */
export function classifyUrl(url: string): UrlKind {
  const host = domainOf(url) ?? "";
  for (const [re, platform] of SOCIAL_HOSTS)
    if (re.test(host)) return { kind: "social", platform };
  if (LINK_IN_BIO_HOSTS.test(host)) return { kind: "link_in_bio" };
  if (/(^|\.)business\.site$/.test(host)) return { kind: "retired_google_site" };
  return { kind: "site" };
}
