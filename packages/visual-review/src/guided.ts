// "View it yourself": a person browses the website in a VISIBLE browser
// window, and every page they land on is recorded -- a screenshot as they see
// it, a phone-width screenshot, the menu, headings, booking/registration links
// and forms. They close the window when they are done.
//
// The person drives; the software never clicks, types, scrolls, submits or
// opens anything itself (no mobile-menu toggle either). It is a person
// visiting a public website, so:
//   * the browser keeps its own ordinary identity (nothing to announce: the
//     visitor is a person);
//   * robots.txt, which is addressed to automated crawlers, does not decide
//     which pages a person may look at -- they choose;
//   * if the site shows a "verify you are human" check, the person may answer
//     it, as any visitor would; the software never does, and records the
//     check page as what it was;
//   * forms are not blocked (the person might need one to pass such a check),
//     but every non-GET request is counted in the record, and the console asks
//     them to look, not to book or submit.
// What stays enforced: the start address and every request must pass the
// scanner's private-network rules, and a fresh profile is used (no saved
// cookies or logins, nothing kept afterwards).

import dns from "node:dns";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  ipBlockedReason,
  validateUrl,
} from "../../../supabase/functions/_shared/discovery/url.ts";

import { blankCapture, capturePage, DESKTOP, startFailure } from "./browser.ts";
import { sameSite } from "./classify.ts";
import type { PageCapture, VisualReview } from "./types.ts";
import { VISUAL_REVIEW_VERSION } from "./types.ts";

export interface GuidedOptions {
  outDir: string;
  id?: string;
  now?: () => Date;
  /** Tests only: run without a window. The console always opens a visible one. */
  headless?: boolean;
  /** The window closes itself after this long. */
  maxMinutes?: number;
  /** Recording stops after this many pages (browsing can continue). */
  maxPages?: number;
  /** Wait after a page loads before recording it. */
  settleMs?: number;
  maxShotHeight?: number;
  // --- safety policy: tests substitute these; the application never does ---
  resolve?: (host: string) => Promise<string[]>;
  ipBlocked?: (ip: string) => string | null;
  extraPorts?: string[];
  launchArgs?: string[];
}

export interface GuidedSession {
  id: string;
  /** Pages recorded so far. */
  captured: () => number;
  /** The open tab (tests drive it as a person would). Undefined if nothing was launched. */
  page: import("playwright").Page | undefined;
  /** Resolves when the window is closed (by the person, stop(), or the time limit). */
  done: Promise<VisualReview>;
  /** End the session now (the console's "Done" button). */
  stop: () => Promise<VisualReview>;
}

const defaultResolve = (host: string) =>
  new Promise<string[]>((ok, fail) =>
    dns.lookup(host, { all: true }, (err, list) =>
      err ? fail(err) : ok(list.map((a) => a.address)),
    ),
  );

const norm = (u: string) => {
  try {
    const x = new URL(u);
    x.hash = "";
    return x.toString().replace(/\/$/, "");
  } catch {
    return u;
  }
};

/** Coverage of a person's session: a check they got past does not count against it. */
export function guidedCoverage(pages: readonly PageCapture[]): {
  coverage: VisualReview["coverage"];
  reason: string;
} {
  const okUrls = new Set(
    pages.filter((p) => p.access === "ok").map((p) => norm(p.finalUrl ?? p.url)),
  );
  const okHosts = new Set(
    [...okUrls].map((u) => {
      try {
        return new URL(u).host;
      } catch {
        return u;
      }
    }),
  );
  // A challenge or block followed by a rendered page on the same site: the person got through.
  const passed = (p: PageCapture) =>
    p.access !== "ok" &&
    (okUrls.has(norm(p.url)) ||
      (p.access === "challenge" &&
        (() => {
          try {
            return okHosts.has(new URL(p.url).host);
          } catch {
            return false;
          }
        })()));
  const counted = pages.filter((p) => !passed(p));
  const ok = counted.filter((p) => p.access === "ok");
  const notOk = counted.filter((p) => p.access !== "ok");
  if (pages.length === 0)
    return {
      coverage: "failed",
      reason: "No page was opened before the window was closed.",
    };
  if (ok.length === 0) {
    const first = counted[0] ?? pages[0]!;
    const blocked = [
      "challenge",
      "http_blocked",
      "rate_limited",
      "unsafe_address",
    ].includes(first.access);
    const opened = pages.some((p) => p.httpStatus !== undefined || p.desktop);
    return {
      coverage: blocked ? "blocked" : "failed",
      reason: opened
        ? `You opened the site, but no page of it could be viewed: ${first.detail}`
        : first.detail,
    };
  }
  const first = ok[0]!;
  const missing = [!first.desktop && "screen", !first.mobile && "phone-width"].filter(
    Boolean,
  );
  const passedCount = pages.length - counted.length;
  const note = passedCount
    ? ` (${passedCount} security check page(s) you got past are recorded but not counted)`
    : "";
  if (notOk.length || missing.length)
    return {
      coverage: "partial",
      reason: `You viewed ${ok.length} page(s) in a browser window${note}, but ${[
        notOk.length
          ? `${notOk.length} page(s) you opened could not be viewed (${notOk
              .slice(0, 3)
              .map((p) => `${p.url}: ${p.access.replace("_", " ")}`)
              .join("; ")})`
          : "",
        missing.length ? `no ${missing.join(" or ")} capture of the first page` : "",
      ]
        .filter(Boolean)
        .join(", and ")}. Only what was viewed may be described.`,
    };
  return {
    coverage: "complete",
    reason: `You viewed ${ok.length} page(s) in a browser window${note}; each was recorded with screen and phone-width captures. Pages you did not open were not seen.`,
  };
}

export async function startGuidedSession(
  startUrl: string,
  opts: GuidedOptions,
): Promise<GuidedSession> {
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
  const maxPages = opts.maxPages ?? 30;
  const settle = opts.settleMs ?? 1200;
  const maxShot = opts.maxShotHeight ?? 6000;
  const blocked = opts.ipBlocked ?? ipBlockedReason;
  const resolveRaw = opts.resolve ?? defaultResolve;
  const urlOpts = opts.extraPorts?.length
    ? { allowedPorts: new Set(["", "80", "443", ...opts.extraPorts]) }
    : {};
  const checkHost = async (host: string) => {
    const ips = await resolveRaw(host);
    if (!ips.length) throw new Error("dns_no_records");
    for (const ip of ips) {
      const why = blocked(ip);
      if (why) throw new Error(`dns_${why}`);
    }
  };
  const pages: PageCapture[] = [];
  let browserName = "chromium (not started)";
  let userAgent = "";
  let nonGet = 0;

  const finish = async (): Promise<VisualReview> => {
    const cov = guidedCoverage(pages);
    const review: VisualReview = {
      id,
      method: "guided",
      startUrl,
      startedAt: started.toISOString(),
      finishedAt: now().toISOString(),
      coverage: cov.coverage,
      coverageReason: `${cov.reason}${nonGet ? ` The window sent ${nonGet} form or data submission(s) while you browsed.` : ""}`,
      pages,
      notVisited: [],
      environment: {
        browser: browserName,
        userAgent,
        desktopViewport: `${DESKTOP.width}x${DESKTOP.height} (the window you browsed in)`,
        mobileViewport:
          "390x844 (each page resized briefly while recorded; phone user agents are not imitated)",
        maxPages,
      },
      version: VISUAL_REVIEW_VERSION,
    };
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "review.json"), JSON.stringify(review, null, 2));
    return review;
  };
  const ended = (r: Promise<VisualReview>): GuidedSession => ({
    id,
    captured: () => pages.length,
    page: undefined,
    done: r,
    stop: () => r,
  });

  let start: URL;
  try {
    start = validateUrl(startUrl, urlOpts);
    await checkHost(start.hostname);
  } catch (e) {
    const why = startFailure(e);
    pages.push(
      blankCapture(
        startUrl,
        "home",
        "the website you asked to open",
        why.access,
        `${why.detail} No window was opened.`,
        now(),
      ),
    );
    return ended(finish());
  }

  let pw: typeof import("playwright");
  let browser: import("playwright").Browser;
  try {
    pw = await import("playwright");
    browser = await pw.chromium.launch({
      headless: opts.headless ?? false,
      args: [
        `--window-size=${DESKTOP.width + 40},${DESKTOP.height + 140}`,
        ...(opts.launchArgs ?? []),
      ],
    });
  } catch (e) {
    return ended(
      finish().then(async (r) => {
        r.coverage = "not_available";
        r.coverageReason = `No browser window could be opened on this computer (${String(
          e instanceof Error ? e.message : e,
        )
          .split("\n")[0]
          ?.slice(0, 160)}). Install the browser from the console.`;
        await writeFile(path.join(dir, "review.json"), JSON.stringify(r, null, 2));
        return r;
      }),
    );
  }
  browserName = `chromium ${browser.version()}`;
  const context = await browser.newContext({
    viewport: DESKTOP,
    acceptDownloads: false,
    locale: "en-US",
  });

  const hostOk = new Map<string, Promise<boolean>>();
  await context.route("**/*", async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return route.continue();
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method())) nonGet++;
    let u: URL;
    try {
      u = validateUrl(url, urlOpts);
    } catch {
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
    if (!(await ok)) return route.abort("blockedbyclient");
    return route.continue();
  });

  // Record each page the person lands on, one at a time, in order.
  let chain = Promise.resolve();
  const lastDoc = new WeakMap<
    import("playwright").Page,
    {
      url: string;
      status: number;
      headers: Record<string, string>;
      raw: Promise<string>;
    }
  >();
  let lastRecorded = "";
  const watch = (p: import("playwright").Page) => {
    if (!userAgent)
      void p
        .evaluate(() => navigator.userAgent)
        .then((ua) => (userAgent = ua))
        .catch(() => undefined);
    p.on("response", (res) => {
      if (res.request().isNavigationRequest() && res.frame() === p.mainFrame())
        lastDoc.set(p, {
          url: res.url(),
          status: res.status(),
          headers: res.headers(),
          raw: res.text().catch(() => ""),
        });
    });
    p.on("framenavigated", (frame) => {
      if (frame !== p.mainFrame()) return;
      const at = p.url();
      chain = chain.then(async () => {
        if (pages.length >= maxPages || p.isClosed()) return;
        await p.waitForLoadState("load", { timeout: 15_000 }).catch(() => undefined);
        await p.waitForTimeout(settle);
        if (p.isClosed() || p.url() !== at) return; // they moved on; the next page is recorded instead
        if (norm(at) === lastRecorded) return;
        if (at === "about:blank") return;
        const doc = lastDoc.get(p);
        const n = pages.length + 1;
        const first = !pages.some(
          (x) => x.access === "ok" && sameSite(x.url, start.toString()),
        );
        const own = sameSite(at, start.toString());
        try {
          const cap = await capturePage(p, {
            url: at,
            role: own ? (first ? "home" : "navigation") : "third_party",
            reason: own
              ? first
                ? "the page you opened first"
                : "a page you opened"
              : `a page you opened on ${new URL(at).hostname}`,
            at: now(),
            tag: `p${String(n).padStart(2, "0")}`,
            dir,
            maxShot,
            status: doc?.url === at ? doc.status : undefined,
            headers: doc?.url === at ? doc.headers : {},
            raw: doc?.url === at ? await doc.raw : "",
            loadMs: undefined,
            counters: { refused: 0, unsafe: 0 },
            openMenu: false,
          });
          if (p.url() !== at) return; // navigated during the capture: discard, it may mix two pages
          pages.push(cap);
          lastRecorded = norm(at);
        } catch {
          /* the page closed or navigated mid-capture */
        }
      });
    });
  };
  context.on("page", watch);
  const page = await context.newPage();

  let finishing: Promise<VisualReview> | undefined;
  let settleDone: (r: VisualReview) => void = () => undefined;
  const done = new Promise<VisualReview>((ok) => (settleDone = ok));
  const end = () =>
    (finishing ??= (async () => {
      clearTimeout(timer);
      await chain.catch(() => undefined);
      await browser.close().catch(() => undefined);
      const r = await finish();
      settleDone(r);
      return r;
    })());
  const timer = setTimeout(() => void end(), (opts.maxMinutes ?? 30) * 60_000);
  browser.on("disconnected", () => void end());
  // Closing the last tab is closing the window.
  context.on("close", () => void end());
  page.on("close", () => {
    if (context.pages().length === 0) void end();
  });

  await page
    .goto(start.toString(), { waitUntil: "domcontentloaded", timeout: 30_000 })
    .catch(() => undefined);
  return { id, captured: () => pages.length, page, done, stop: end };
}
