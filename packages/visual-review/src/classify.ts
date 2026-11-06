// The decisions of a visual review, as pure functions: which pages to look at,
// what a link promises, how a response is classified, and what the review as a
// whole may claim. Nothing here touches a browser, so all of it is tested directly.

import { VENDORS } from "@hl-bos/presence-scanner";

import type {
  CallToAction,
  Coverage,
  LinkSeen,
  PageAccess,
  PageCapture,
} from "./types.ts";

/** Host without a leading "www.", lower-cased. */
export function bareHost(u: string | URL): string {
  const h = (typeof u === "string" ? new URL(u) : u).hostname.toLowerCase();
  return h.startsWith("www.") ? h.slice(4) : h;
}

/** Same website: same host (ignoring www.) or a subdomain of it. */
export function sameSite(a: string, base: string): boolean {
  try {
    const x = bareHost(a);
    const b = bareHost(base);
    return x === b || x.endsWith(`.${b}`);
  } catch {
    return false;
  }
}

/** The known booking / registration / ordering provider a link goes to. */
export function providerOf(href: string): string | undefined {
  let host: string;
  try {
    host = new URL(href).hostname.toLowerCase();
  } catch {
    return undefined;
  }
  const full = `${host}${(() => {
    try {
      return new URL(href).pathname;
    } catch {
      return "";
    }
  })()}`;
  return VENDORS.find((v) => v.pattern.test(host) || v.pattern.test(full))?.name;
}

const INTENTS: [CallToAction["intent"], RegExp][] = [
  [
    "register",
    /\b(register|registration|sign ?up|enrol+|join (the|our)|tryouts?|programs? sign)\b/i,
  ],
  [
    "book",
    /\b(book|reserve|reservation|rent (the )?ice|party|parties|birthday|appointment)\b/i,
  ],
  ["schedule", /\b(schedule|calendar|sessions?|times|hours|public skat)/i],
  ["buy", /\b(buy|shop|store|tickets?|order|purchase|pay|checkout|gift card)\b/i],
  ["directions", /\b(directions|map|find us|location)\b/i],
  ["contact", /\b(contact|get in touch|enquir|inquir|message us)\b/i],
];

/** What a link promises a visitor, from its words and address. */
export function intentOf(text: string, href: string): CallToAction["intent"] {
  if (/^tel:/i.test(href)) return "call";
  if (/^mailto:/i.test(href)) return "email";
  const words = `${text} ${(() => {
    try {
      return new URL(href).pathname.replace(/[-_/]+/g, " ");
    } catch {
      return "";
    }
  })()}`;
  for (const [intent, re] of INTENTS) if (re.test(words)) return intent;
  if (providerOf(href)) return "book";
  return "other";
}

/** Words that make a page worth looking at for a business-website review. */
const RELEVANT =
  /\b(programs?|lessons?|classes|camps?|leagues?|hockey|skat\w*|figure|learn|rentals?|ice|book\w*|regist\w*|schedule|calendar|sessions?|events?|parties|birthday|pricing|prices?|rates?|fees?|menu|services?|about|contact|hours|location|faq|tickets?|memberships?|teams?)\b/i;

const SKIP_PATH =
  /\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|pptx?|mp4|mov|mp3|ics)$|\/(wp-admin|wp-login|login|logout|signin|sign-in|account|cart|checkout|admin|user)\b/i;

function normalized(href: string): string | undefined {
  try {
    const u = new URL(href);
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    u.hash = "";
    for (const k of [...u.searchParams.keys()])
      if (/^(utm_|fbclid|gclid|mc_)/i.test(k)) u.searchParams.delete(k);
    return u.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

export interface PlannedPage {
  url: string;
  role: "navigation" | "linked" | "third_party";
  reason: string;
}

/**
 * Which pages to look at after the homepage, most useful first.
 *
 *  1. Menu items on the same site, relevant words first, in menu order.
 *  2. Same-site booking/registration/schedule links that were not in the menu.
 *  3. Up to `maxThirdParty` booking/registration destinations on other sites
 *     (each provider's landing page only -- nothing inside it is touched).
 */
export function planPages(
  home: string,
  navigation: readonly LinkSeen[],
  callsToAction: readonly CallToAction[],
  opts: { maxPages: number; maxThirdParty: number },
): { planned: PlannedPage[]; leftOut: { url: string; reason: string }[] } {
  const seen = new Set([normalized(home)]);
  const planned: PlannedPage[] = [];
  const leftOut: { url: string; reason: string }[] = [];
  const consider = (p: PlannedPage) => {
    const n = normalized(p.url);
    if (!n || seen.has(n)) return;
    seen.add(n);
    planned.push({ ...p, url: n });
  };
  const nav = navigation
    .filter((l) => sameSite(l.href, home) && !SKIP_PATH.test(l.href))
    .map((l, i) => ({ l, i, score: RELEVANT.test(`${l.text} ${l.href}`) ? 0 : 1 }))
    .sort((a, b) => a.score - b.score || a.i - b.i);
  for (const { l } of nav)
    consider({
      url: l.href,
      role: "navigation",
      reason: `menu item “${l.text.slice(0, 60)}”`,
    });
  for (const c of callsToAction)
    if (
      ["book", "register", "schedule", "buy"].includes(c.intent) &&
      sameSite(c.href, home) &&
      !SKIP_PATH.test(c.href)
    )
      consider({
        url: c.href,
        role: "linked",
        reason: `${c.intent} link “${c.text.slice(0, 60)}”`,
      });

  const sameSitePages = planned.splice(0);
  for (const p of sameSitePages.slice(0, opts.maxPages)) planned.push(p);
  for (const p of sameSitePages.slice(opts.maxPages))
    leftOut.push({
      url: p.url,
      reason: `page limit (${opts.maxPages} pages besides the homepage)`,
    });

  const hosts = new Set<string>();
  for (const c of callsToAction) {
    if (!["book", "register", "buy"].includes(c.intent)) continue;
    if (sameSite(c.href, home)) continue;
    const n = normalized(c.href);
    if (!n) continue;
    const host = bareHost(n);
    if (hosts.has(host)) continue;
    if (hosts.size >= opts.maxThirdParty) {
      leftOut.push({
        url: n,
        reason: `third-party limit (${opts.maxThirdParty} providers)`,
      });
      continue;
    }
    hosts.add(host);
    planned.push({
      url: n,
      role: "third_party",
      reason: `${c.intent} link “${c.text.slice(0, 60)}” to ${c.provider ?? host} (landing page only)`,
    });
  }
  return { planned, leftOut };
}

/** Classify an HTTP status (when no block page was detected on a 2xx). */
export function accessFromStatus(status: number | undefined): PageAccess {
  if (status === undefined) return "error";
  if (status === 401 || status === 403 || status === 451) return "http_blocked";
  if (status === 429) return "rate_limited";
  if (status === 404 || status === 410) return "not_found";
  if (status >= 500) return "server_error";
  if (status >= 400) return "error";
  return "ok";
}

/** After one of these, nothing more is requested from that host. */
export const STOP_HOST: ReadonlySet<PageAccess> = new Set([
  "http_blocked",
  "rate_limited",
  "challenge",
]);

const BLOCKED_HOME: ReadonlySet<PageAccess> = new Set([
  "http_blocked",
  "rate_limited",
  "challenge",
  "robots_disallowed",
  "unsafe_address",
]);

/**
 * What the review as a whole may claim. "complete" only when the homepage and
 * EVERY selected page rendered, with desktop and mobile captures of the homepage.
 */
export function coverageOf(
  pages: readonly PageCapture[],
  /** Selected pages deliberately not requested (the host had refused an earlier page). */
  notRequested = 0,
): { coverage: Coverage; reason: string } {
  const home = pages.find((p) => p.role === "home");
  if (!home) return { coverage: "failed", reason: "The homepage was never requested." };
  if (BLOCKED_HOME.has(home.access))
    return {
      coverage: "blocked",
      reason: `The homepage could not be viewed: ${home.detail}`,
    };
  if (home.access !== "ok")
    return { coverage: "failed", reason: `The homepage did not load: ${home.detail}` };
  const missingShots = [!home.desktop && "desktop", !home.mobile && "mobile"].filter(
    Boolean,
  );
  const others = pages.filter((p) => p.role !== "home");
  const bad = others.filter((p) => p.access !== "ok");
  if (missingShots.length || bad.length || notRequested) {
    const parts = [
      missingShots.length
        ? `no ${missingShots.join(" or ")} capture of the homepage`
        : "",
      bad.length
        ? `${bad.length} of ${others.length} other page(s) could not be viewed (${bad
            .slice(0, 3)
            .map((p) => `${p.url}: ${p.access.replace("_", " ")}`)
            .join("; ")}${bad.length > 3 ? "; …" : ""})`
        : "",
      notRequested
        ? `${notRequested} selected page(s) were not requested because the site had refused an earlier one`
        : "",
    ].filter(Boolean);
    return {
      coverage: "partial",
      reason: `The homepage rendered, but ${parts.join(", and ")}. Only what was viewed may be described.`,
    };
  }
  return {
    coverage: "complete",
    reason: `The homepage and ${others.length} other page(s) rendered in a real browser, with desktop and mobile captures.`,
  };
}
