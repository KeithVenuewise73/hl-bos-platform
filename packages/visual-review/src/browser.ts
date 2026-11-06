// The browser half of the visual review: a real Chromium (Playwright) renders
// each page, and this file reads back what a visitor would see.
//
// READ-ONLY BY CONSTRUCTION. These are enforced in code, not by convention:
//   * every request the page makes that is not GET / HEAD / OPTIONS is refused
//     at the network layer, so no form can be submitted, no booking made, no
//     account created -- whatever a script on the page tries to do;
//   * every request is checked against the scanner's address rules (scheme,
//     port, credentials, and every resolved IP against the private / loopback /
//     metadata block list) before it is allowed out;
//   * the only thing ever clicked is a mobile menu toggle, and only to open it;
//   * robots.txt is read first for every host and obeyed, under the Presence
//     Scanner's own name, which the browser announces in its user agent;
//   * a 401/403/429 or a security / CAPTCHA page from a host ends all requests
//     to that host for the rest of the review -- no retry, no reload, no
//     different identity, no attempt to solve anything;
//   * downloads, permission prompts and service workers are refused.
//
// The mobile capture resizes the same page to 390px instead of loading it
// again, so each page costs the site one visit. That shows the responsive
// layout; a site that sniffs phone user agents is not imitated, and the
// review's environment record says so.

import dns from "node:dns";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  detectAccessBlock,
  robotsAllows,
  SCANNER_USER_AGENT,
  visibleText,
} from "@hl-bos/presence-scanner";
import { createNodeEgress } from "@hl-bos/presence-scanner/node";

import {
  ipBlockedReason,
  validateUrl,
} from "../../../supabase/functions/_shared/discovery/url.ts";

import {
  accessFromStatus,
  bareHost,
  coverageOf,
  intentOf,
  planPages,
  providerOf,
  STOP_HOST,
} from "./classify.ts";
import type {
  CallToAction,
  FormSeen,
  LinkSeen,
  PageAccess,
  PageCapture,
  PageRole,
  Screenshot,
  VisualReview,
} from "./types.ts";
import { VISUAL_REVIEW_VERSION } from "./types.ts";

export interface VisualReviewOptions {
  /** Evidence root. The review is written to <outDir>/<id>/. */
  outDir: string;
  id?: string;
  now?: () => Date;
  /** Pages besides the homepage. */
  maxPages?: number;
  /** Booking / registration providers on other sites (landing page each). */
  maxThirdParty?: number;
  pageTimeoutMs?: number;
  totalTimeoutMs?: number;
  /** Tallest screenshot, in CSS pixels; taller pages are captured to this height. */
  maxShotHeight?: number;
  // --- safety policy: tests substitute these; the application never does ---
  resolve?: (host: string) => Promise<string[]>;
  ipBlocked?: (ip: string) => string | null;
  extraPorts?: string[];
  /** Extra Chromium arguments (tests map *.test host names to a local server). */
  launchArgs?: string[];
  /** robots.txt reader; defaults to the scanner's guarded Node client. */
  fetchRobots?: (
    origin: string,
  ) => Promise<{ status: number; body: string } | undefined>;
}

const DESKTOP = { width: 1366, height: 900 };
const MOBILE = { width: 390, height: 844 };
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Browser not installed (or not launchable) on this computer. */
export class BrowserUnavailable extends Error {}

type Pw = typeof import("playwright");

async function loadPlaywright(): Promise<Pw> {
  try {
    return await import("playwright");
  } catch (e) {
    throw new BrowserUnavailable(
      `the browser library is not installed (${String(e).slice(0, 120)})`,
    );
  }
}

const defaultResolve = (host: string) =>
  new Promise<string[]>((ok, fail) =>
    dns.lookup(host, { all: true }, (err, list) =>
      err ? fail(err) : ok(list.map((a) => a.address)),
    ),
  );

/** Run one visual review. Never throws for a site's behaviour; only for our own misuse. */
export async function runVisualReview(
  startUrl: string,
  opts: VisualReviewOptions,
): Promise<VisualReview> {
  const now = opts.now ?? (() => new Date());
  const started = now();
  const id =
    opts.id ??
    `vr-${started
      .toISOString()
      .replace(/[-:.TZ]/g, "")
      .slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`;
  if (!/^[a-z0-9-]{4,64}$/.test(id)) throw new Error("invalid review id");
  const dir = path.join(opts.outDir, id);
  const maxPages = opts.maxPages ?? 6;
  const maxThirdParty = opts.maxThirdParty ?? 2;
  const pageTimeout = opts.pageTimeoutMs ?? 20_000;
  const deadline = started.getTime() + (opts.totalTimeoutMs ?? 180_000);
  const maxShot = opts.maxShotHeight ?? 6000;
  const blocked = opts.ipBlocked ?? ipBlockedReason;
  const resolveRaw = opts.resolve ?? defaultResolve;
  const allowedPorts = opts.extraPorts?.length
    ? new Set(["", "80", "443", ...opts.extraPorts])
    : undefined;
  const urlOpts = allowedPorts ? { allowedPorts } : {};
  /** Resolve a host and refuse it if ANY address is blocked -- one policy for every check. */
  const checkHost = async (host: string): Promise<void> => {
    const ips = await resolveRaw(host);
    if (!ips.length) throw new Error("dns_no_records");
    for (const ip of ips) {
      const why = blocked(ip);
      if (why) throw new Error(`dns_${why}`);
    }
  };
  const fetchRobots =
    opts.fetchRobots ??
    createNodeEgress({
      ipBlocked: blocked,
      ...(opts.extraPorts ? { extraPorts: opts.extraPorts } : {}),
    }).fetchRobots;

  const pages: PageCapture[] = [];
  const notVisited: VisualReview["notVisited"] = [];
  const stoppedHosts = new Map<string, string>();
  const robotsCache = new Map<string, string | null>();
  let userAgent = `${SCANNER_USER_AGENT} (+visual review)`;
  let browserName = "chromium (not started)";

  const finish = async (): Promise<VisualReview> => {
    const skippedSelected = notVisited.filter((n) =>
      n.reason.startsWith("not requested"),
    ).length;
    const cov = coverageOf(pages, skippedSelected);
    const review: VisualReview = {
      id,
      startUrl,
      startedAt: started.toISOString(),
      finishedAt: now().toISOString(),
      coverage: cov.coverage,
      coverageReason: cov.reason,
      pages,
      notVisited,
      environment: {
        browser: browserName,
        userAgent,
        desktopViewport: `${DESKTOP.width}x${DESKTOP.height}`,
        mobileViewport: `${MOBILE.width}x${MOBILE.height} (same page resized; phone user agents are not imitated)`,
        maxPages,
      },
      version: VISUAL_REVIEW_VERSION,
    };
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "review.json"), JSON.stringify(review, null, 2));
    return review;
  };

  // The start address must pass the scanner's rules before anything is launched.
  let start: URL;
  try {
    start = validateUrl(startUrl, urlOpts);
    await checkHost(start.hostname);
  } catch (e) {
    pages.push(
      blankCapture(
        startUrl,
        "home",
        "homepage",
        "unsafe_address",
        `The address failed the scanner's safety checks (${e instanceof Error ? e.message : String(e)}); nothing was requested.`,
        now(),
      ),
    );
    return finish();
  }

  let pw: Pw;
  try {
    pw = await loadPlaywright();
  } catch (e) {
    return notAvailable(e);
  }
  let browser: import("playwright").Browser;
  try {
    browser = await pw.chromium.launch({ args: opts.launchArgs ?? [] });
  } catch (e) {
    return notAvailable(e);
  }

  async function notAvailable(e: unknown): Promise<VisualReview> {
    const r = await finish();
    r.coverage = "not_available";
    r.coverageReason = `No browser is available on this computer, so nothing was viewed (${String(
      e instanceof Error ? e.message : e,
    )
      .split("\n")[0]
      ?.slice(0, 160)}). Install it from the console.`;
    await writeFile(path.join(dir, "review.json"), JSON.stringify(r, null, 2));
    return r;
  }

  try {
    browserName = `chromium ${browser.version()}`;
    userAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browser.version()} Safari/537.36 ${SCANNER_USER_AGENT} (+visual review; read-only)`;
    const context = await browser.newContext({
      viewport: DESKTOP,
      userAgent,
      acceptDownloads: false,
      serviceWorkers: "block",
      permissions: [],
      locale: "en-US",
    });
    const counters = { refused: 0, unsafe: 0 };
    const hostOk = new Map<string, Promise<boolean>>();
    await context.route("**/*", async (route) => {
      const req = route.request();
      const url = req.url();
      if (url.startsWith("data:") || url.startsWith("blob:")) return route.continue();
      if (!SAFE_METHODS.has(req.method())) {
        counters.refused++;
        return route.abort("blockedbyclient");
      }
      let u: URL;
      try {
        u = validateUrl(url, urlOpts);
      } catch {
        counters.unsafe++;
        return route.abort("blockedbyclient");
      }
      let ok = hostOk.get(u.hostname);
      if (!ok) {
        ok = checkHost(u.hostname).then(
          () => true,
          () => false,
        );
        hostOk.set(u.hostname, ok);
      }
      if (!(await ok)) {
        counters.unsafe++;
        return route.abort("blockedbyclient");
      }
      return route.continue();
    });
    context.on("page", (p) => p.on("dialog", (d) => void d.dismiss()));
    const page = await context.newPage();

    const robotsAllowed = async (u: URL): Promise<{ ok: boolean; rule?: string }> => {
      if (!robotsCache.has(u.origin)) {
        const r = await fetchRobots(u.origin).catch(() => undefined);
        robotsCache.set(u.origin, r && r.status === 200 ? r.body : null);
      }
      const body = robotsCache.get(u.origin);
      if (!body) return { ok: true };
      const v = robotsAllows(body, `${u.pathname}${u.search}`);
      return v.rule === undefined ? { ok: v.allowed } : { ok: v.allowed, rule: v.rule };
    };

    let n = 0;
    const visit = async (
      url: string,
      role: PageRole,
      reason: string,
    ): Promise<PageCapture> => {
      n++;
      const tag = `p${String(n).padStart(2, "0")}`;
      const at = now();
      let u: URL;
      try {
        u = validateUrl(url, urlOpts);
        await checkHost(u.hostname);
      } catch (e) {
        return blankCapture(
          url,
          role,
          reason,
          "unsafe_address",
          `The address failed the scanner's safety checks (${e instanceof Error ? e.message : String(e)}); it was not requested.`,
          at,
        );
      }
      const r = await robotsAllowed(u);
      if (!r.ok)
        return blankCapture(
          url,
          role,
          reason,
          "robots_disallowed",
          `The site's robots.txt asks automated tools not to read this page (${r.rule ?? "disallow"}); it was not requested.`,
          at,
        );

      counters.refused = 0;
      counters.unsafe = 0;
      await page.setViewportSize(DESKTOP);
      const t0 = Date.now();
      let resp: import("playwright").Response | null;
      try {
        resp = await page.goto(u.toString(), {
          waitUntil: "domcontentloaded",
          timeout: pageTimeout,
        });
      } catch (e) {
        const msg = String(e instanceof Error ? e.message : e).split("\n")[0] ?? "";
        const timeout = /timeout/i.test(msg);
        return {
          ...blankCapture(
            url,
            role,
            reason,
            timeout ? "timeout" : "error",
            timeout
              ? `The page did not load within ${Math.round(pageTimeout / 1000)} seconds.`
              : `The page could not be loaded (${msg.slice(0, 160)}).`,
            at,
          ),
          refusedRequests: counters.refused,
          unsafeRequests: counters.unsafe,
        };
      }
      await page
        .waitForLoadState("networkidle", { timeout: 6000 })
        .catch(() => undefined);
      const loadMs = Date.now() - t0;
      const status = resp?.status();
      const headers = resp?.headers() ?? {};
      const raw = (await resp?.text().catch(() => "")) ?? "";
      const dom = await readPage(page);
      const block = detectAccessBlock({
        status: status ?? 0,
        headers,
        title: dom.title,
        text: dom.text,
        sources: dom.sources,
        otherFields: dom.forms.reduce((s, f) => s + f.fields, 0),
      });
      let access: PageAccess = block ? "challenge" : accessFromStatus(status);
      if (access === "ok" && dom.text.trim().length === 0 && dom.links.length === 0)
        access = "error";
      const base: PageCapture = {
        ...blankCapture(url, role, reason, access, "", at),
        finalUrl: page.url(),
        httpStatus: status,
        title: dom.title || undefined,
        loadMs,
        refusedRequests: counters.refused,
        unsafeRequests: counters.unsafe,
      };
      if (access !== "ok") {
        base.detail = block
          ? `A ${block.provider ? `${block.provider} ` : ""}${block.kind.replace("_", " ")} page answered instead of the site (${block.evidence}). Nothing on it was read as the site, and nothing was done to get past it.`
          : describeStatus(access, status);
        // Evidence of the block itself (the page that answered), never of the site.
        base.desktop = await shot(
          page,
          path.join(dir, `${tag}-blocked.png`),
          maxShot,
        ).catch(() => undefined);
        return base;
      }
      const rawText = visibleText(raw).length;
      base.headings = dom.headings;
      base.navigation = dom.navigation;
      base.callsToAction = dom.links
        .map((l): CallToAction => ({
          ...l,
          intent: intentOf(l.text, l.href),
          provider: providerOf(l.href),
        }))
        .filter((c) => c.intent !== "other" || c.provider)
        .slice(0, 60);
      base.forms = dom.forms;
      base.renderedTextLength = dom.text.length;
      base.rawTextLength = rawText;
      base.scriptRendered = rawText < 250 && dom.text.length > rawText + 400;
      base.desktop = await shot(
        page,
        path.join(dir, `${tag}-desktop.png`),
        maxShot,
      ).catch(() => undefined);
      await page.setViewportSize(MOBILE);
      await page.waitForTimeout(400);
      base.mobileHorizontalScroll = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 2,
      );
      base.mobileMenuOpened = role === "home" ? await openMobileMenu(page) : undefined;
      base.mobile = await shot(
        page,
        path.join(dir, `${tag}-mobile.png`),
        maxShot,
      ).catch(() => undefined);
      base.detail = `Rendered (HTTP ${status ?? "?"}) in ${Math.round(loadMs / 100) / 10}s${base.refusedRequests ? `; ${base.refusedRequests} non-GET request(s) refused` : ""}.`;
      return base;
    };

    // 1. The homepage.
    const home = await visit(start.toString(), "home", "homepage");
    pages.push(home);
    if (home.access !== "ok") {
      if (STOP_HOST.has(home.access)) stoppedHosts.set(bareHost(start), home.access);
      return await finish();
    }
    // 2. The pages it points to.
    const { planned, leftOut } = planPages(
      home.finalUrl ?? start.toString(),
      home.navigation,
      home.callsToAction,
      { maxPages, maxThirdParty },
    );
    notVisited.push(...leftOut);
    for (const p of planned) {
      const host = bareHost(p.url);
      const stop = stoppedHosts.get(host);
      if (stop) {
        notVisited.push({
          url: p.url,
          reason: `not requested: ${host} refused an earlier page (${stop.replace("_", " ")}), so no further requests were made to it`,
        });
        continue;
      }
      if (Date.now() > deadline) {
        notVisited.push({
          url: p.url,
          reason: "not requested: the review's time limit was reached",
        });
        continue;
      }
      const cap = await visit(p.url, p.role, p.reason);
      pages.push(cap);
      if (STOP_HOST.has(cap.access)) stoppedHosts.set(host, cap.access);
    }
    return await finish();
  } finally {
    await browser.close().catch(() => undefined);
  }
}

function describeStatus(access: PageAccess, status: number | undefined): string {
  switch (access) {
    case "http_blocked":
      return `The site refused the request (HTTP ${status}). No further requests were made to it.`;
    case "rate_limited":
      return "The site is rate-limiting automated requests (HTTP 429). No further requests were made to it.";
    case "not_found":
      return `The page does not exist (HTTP ${status}).`;
    case "server_error":
      return `The site's server is failing (HTTP ${status}).`;
    case "error":
      return status === undefined
        ? "No response was received."
        : `The page answered with an error or nothing at all (HTTP ${status}).`;
    default:
      return access;
  }
}

export function blankCapture(
  url: string,
  role: PageRole,
  reason: string,
  access: PageAccess,
  detail: string,
  at: Date,
): PageCapture {
  return {
    url,
    finalUrl: undefined,
    role,
    reason,
    access,
    detail,
    httpStatus: undefined,
    title: undefined,
    headings: [],
    navigation: [],
    callsToAction: [],
    forms: [],
    renderedTextLength: undefined,
    rawTextLength: undefined,
    scriptRendered: undefined,
    mobileHorizontalScroll: undefined,
    mobileMenuOpened: undefined,
    desktop: undefined,
    mobile: undefined,
    refusedRequests: 0,
    unsafeRequests: 0,
    loadMs: undefined,
    observedAt: at.toISOString(),
  };
}

interface DomRead {
  title: string;
  text: string;
  headings: string[];
  navigation: LinkSeen[];
  links: LinkSeen[];
  forms: FormSeen[];
  sources: string[];
}

/** Read what is on the page. Runs inside the page; changes nothing there. */
async function readPage(page: import("playwright").Page): Promise<DomRead> {
  return page.evaluate(() => {
    const clean = (s: string | null | undefined) =>
      (s ?? "").replace(/\s+/g, " ").trim();
    const linkOf = (a: HTMLAnchorElement) => ({
      text: clean(a.innerText || a.getAttribute("aria-label") || a.title).slice(0, 80),
      href: a.href,
    });
    const uniq = <T extends { href: string }>(xs: T[]) => {
      const s = new Set<string>();
      return xs.filter((x) => x.href && !s.has(x.href) && (s.add(x.href), true));
    };
    const navRoots = Array.from(
      document.querySelectorAll(
        "nav, header, [role=navigation], [role=menubar], [role=menu], .menu, #menu, .navbar, .nav",
      ),
    );
    const navigation = uniq(
      navRoots.flatMap((r) =>
        Array.from(r.querySelectorAll("a[href]")).map((a) =>
          linkOf(a as HTMLAnchorElement),
        ),
      ),
    )
      .filter((l) => l.text)
      .slice(0, 60);
    const links = uniq(
      Array.from(document.querySelectorAll("a[href]")).map((a) =>
        linkOf(a as HTMLAnchorElement),
      ),
    ).slice(0, 400);
    const forms = Array.from(document.querySelectorAll("form"))
      .slice(0, 10)
      .map((f) => {
        const fields = Array.from(f.querySelectorAll("input, select, textarea")).filter(
          (el) => (el as HTMLInputElement).type !== "hidden",
        );
        return {
          action: f.action,
          method: (f.method || "get").toUpperCase(),
          fields: fields.length,
          labels: fields
            .map((el) => {
              const id = el.getAttribute("id");
              const label = id
                ? document.querySelector(`label[for="${CSS.escape(id)}"]`)
                : null;
              return clean(
                label?.textContent ||
                  el.getAttribute("placeholder") ||
                  el.getAttribute("aria-label") ||
                  el.getAttribute("name"),
              ).slice(0, 40);
            })
            .filter(Boolean)
            .slice(0, 8),
        };
      });
    return {
      title: clean(document.title),
      text: clean(document.body?.innerText).slice(0, 20000),
      headings: Array.from(document.querySelectorAll("h1, h2"))
        .map((h) => clean(h.textContent).slice(0, 100))
        .filter(Boolean)
        .slice(0, 12),
      navigation,
      links,
      forms,
      sources: Array.from(document.querySelectorAll("script[src], iframe[src]"))
        .map((e) => (e as HTMLScriptElement).src)
        .slice(0, 100),
    };
  });
}

/** Open a mobile menu toggle if there is one. Only a click on the toggle; a navigation is undone. */
async function openMobileMenu(page: import("playwright").Page): Promise<boolean> {
  const before = page.url();
  const toggle = page
    .locator(
      'button[aria-expanded="false"], [role=button][aria-expanded="false"], button[aria-label*="menu" i], [aria-label*="navigation" i][role=button], .navbar-toggle, .menu-toggle, .hamburger',
    )
    .filter({ visible: true })
    .first();
  if ((await toggle.count()) === 0) return false;
  try {
    await toggle.click({ timeout: 2000, noWaitAfter: true });
    await page.waitForTimeout(600);
  } catch {
    return false;
  }
  if (page.url() !== before) {
    await page.goBack({ timeout: 5000 }).catch(() => undefined);
    return false;
  }
  return true;
}

async function shot(
  page: import("playwright").Page,
  file: string,
  maxHeight: number,
): Promise<Screenshot> {
  await mkdir(path.dirname(file), { recursive: true });
  const size = page.viewportSize() ?? DESKTOP;
  const full = await page.evaluate(() => document.documentElement.scrollHeight);
  const height = Math.max(size.height, Math.min(full, maxHeight));
  await page.screenshot({
    path: file,
    fullPage: true,
    clip: { x: 0, y: 0, width: size.width, height },
  });
  return {
    file: path.basename(file),
    width: size.width,
    height,
    truncated: full > maxHeight,
  };
}
