// The visual review in a REAL Chromium against local synthetic sites. Skipped
// (not failed) on a computer without the browser installed; everything else in
// this package is tested without one.

import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { ipBlockedReason } from "../../../supabase/functions/_shared/discovery/url.ts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runVisualReview, type VisualReviewOptions } from "./browser.ts";
import {
  fixtureRobots,
  startFixtureSites,
  type FixtureServer,
} from "./fixture-sites.test-helpers.ts";
import { visualFindings } from "./findings.ts";

async function browserInstalled(): Promise<boolean> {
  try {
    const { chromium } = await import("playwright");
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}
const HAVE_BROWSER = await browserInstalled();

describe.skipIf(!HAVE_BROWSER)(
  "visual review in a real browser (synthetic local sites)",
  { timeout: 120_000 },
  () => {
    let site: FixtureServer;
    let out: string;
    const opts = (): VisualReviewOptions => ({
      outDir: out,
      extraPorts: [String(site.port)],
      // *.test names point at the local fixture; everything else keeps the real rules.
      resolve: (h) =>
        Promise.resolve(
          h === "private.test"
            ? ["10.0.0.5"]
            : h.endsWith(".test")
              ? ["127.0.0.1"]
              : Promise.reject(new Error(`unknown ${h}`)),
        ),
      ipBlocked: (ip) => (ip === "127.0.0.1" ? null : ipBlockedReason(ip)),
      launchArgs: ["--host-resolver-rules=MAP *.test 127.0.0.1"],
      fetchRobots: fixtureRobots(site.port),
      pageTimeoutMs: 10_000,
    });
    const hitsFor = (host: string) => site.hits.filter((h) => h.host === host);

    beforeAll(async () => {
      site = await startFixtureSites();
      out = await mkdtemp(path.join(tmpdir(), "visual-review-"));
    });
    afterAll(async () => {
      await site.close();
    });

    it("a normal site: homepage + menu pages + the third-party registration landing page; complete; desktop and mobile captured", async () => {
      const r = await runVisualReview(site.url("rinks.test"), opts());
      expect(r.coverage).toBe("complete");
      const home = r.pages.find((p) => p.role === "home")!;
      expect(home.access).toBe("ok");
      expect(home.navigation.map((l) => l.text)).toEqual(
        expect.arrayContaining(["Programs", "Public Skating", "Contact", "Register"]),
      );
      expect(home.desktop?.file).toMatch(/desktop\.png$/);
      expect(home.mobile?.file).toMatch(/mobile\.png$/);
      expect(existsSync(path.join(out, r.id, home.desktop!.file))).toBe(true);
      expect(existsSync(path.join(out, r.id, "review.json"))).toBe(true);
      expect(home.mobileMenuOpened).toBe(true);
      expect(home.mobileHorizontalScroll).toBe(false);
      const urls = r.pages.map((p) => new URL(p.url).pathname);
      expect(urls).toEqual(
        expect.arrayContaining([
          "/programs",
          "/public-skating",
          "/contact",
          "/register",
        ]),
      );
      const third = r.pages.find((p) => p.role === "third_party")!;
      expect(new URL(third.url).hostname).toBe("booking.test");
      expect(third.access).toBe("ok");
      expect(home.forms[0]?.labels).toContain("Name");
    });

    it("read-only by construction: the page's POST and every form were refused; nothing was submitted anywhere", async () => {
      const posts = site.hits.filter((h) => h.method !== "GET" && h.method !== "HEAD");
      expect(posts).toEqual([]);
      const r = await runVisualReview(site.url("rinks.test"), opts());
      expect(r.pages.find((p) => p.role === "home")!.refusedRequests).toBeGreaterThan(
        0,
      );
      expect(
        site.hits.filter((h) => h.method !== "GET" && h.method !== "HEAD"),
      ).toEqual([]);
      expect(hitsFor("booking.test").map((h) => h.path)).not.toContain("/pay");
    });

    it("evidence: findings name the page and screenshots, and describe only what was viewed", async () => {
      const r = await runVisualReview(site.url("rinks.test"), opts());
      const f = new Map(visualFindings(r).map((x) => [x.key, x]));
      expect(f.get("visual.coverage")?.status).toBe("present");
      expect(f.get("visual.navigation")?.evidence).toContain("Programs");
      expect(f.get("visual.navigation")?.evidence).toMatch(
        /screenshots: p\d+-desktop\.png/,
      );
      expect(f.get("visual.booking_path")?.status).toBe("present");
      expect(f.get("visual.booking_path")?.evidence).toContain("booking.test");
      expect(f.get("visual.mobile_layout")?.status).toBe("present");
      expect(f.get("visual.programs")?.status).toBe("present");
      expect(f.get("visual.contact")?.evidence).toContain("not submitted");
      expect(f.get("visual.third_party.booking.test")?.status).toBe("present");
    });

    it("a JavaScript-drawn site is seen as a visitor sees it, and recorded as script-rendered", async () => {
      const r = await runVisualReview(site.url("spa.test"), opts());
      const home = r.pages[0]!;
      expect(home.access).toBe("ok");
      expect(home.scriptRendered).toBe(true);
      expect(home.navigation.map((l) => l.text)).toEqual(
        expect.arrayContaining(["Programs", "Contact"]),
      );
      expect(
        visualFindings(r).find((x) => x.key === "visual.script_rendered")?.status,
      ).toBe("present");
    });

    it("a Cloudflare 403 block: coverage 'blocked', asked exactly once, no findings about the site", async () => {
      const before = hitsFor("cf.test").filter((h) => h.path !== "/robots.txt").length;
      const r = await runVisualReview(site.url("cf.test"), opts());
      expect(r.coverage).toBe("blocked");
      expect(r.pages).toHaveLength(1);
      expect(r.pages[0]!.access).toBe("challenge");
      expect(r.pages[0]!.detail).toContain("Cloudflare");
      expect(r.pages[0]!.detail).toContain("nothing was done to get past it");
      expect(
        hitsFor("cf.test").filter((h) => h.path !== "/robots.txt").length - before,
      ).toBe(1);
      const f = visualFindings(r);
      expect(f.map((x) => x.key)).toEqual(["visual.coverage"]);
      expect(f[0]!.status).toBe("blocked");
    });

    it("a challenge page served with HTTP 200 is a block, not the site", async () => {
      const r = await runVisualReview(site.url("challenge.test"), opts());
      expect(r.coverage).toBe("blocked");
      expect(r.pages[0]!.access).toBe("challenge");
    });

    it("partial access: robots.txt is obeyed, a 429 stops all further requests to the host, coverage 'partial'", async () => {
      const r = await runVisualReview(site.url("partial.test"), opts());
      expect(r.coverage).toBe("partial");
      const byPath = new Map(r.pages.map((p) => [new URL(p.url).pathname, p.access]));
      expect(byPath.get("/programs")).toBe("robots_disallowed");
      expect(hitsFor("partial.test").map((h) => h.path)).not.toContain("/programs");
      expect(hitsFor("partial.test").map((h) => h.path)).not.toContain("/members");
      const after429 = r.pages.findIndex((p) => p.access === "rate_limited");
      expect(after429).toBeGreaterThan(0);
      const later = r.pages
        .slice(after429 + 1)
        .filter((p) => new URL(p.url).hostname === "partial.test");
      expect(later).toEqual([]);
      expect(r.notVisited.some((n) => n.reason.startsWith("not requested"))).toBe(true);
      expect(r.coverageReason).toContain("Only what was viewed may be described");
    });

    it("a page that does not fit a phone is recorded as such, from the 390px capture", async () => {
      const r = await runVisualReview(site.url("wide.test"), opts());
      expect(r.pages[0]!.mobileHorizontalScroll).toBe(true);
      expect(
        visualFindings(r).find((x) => x.key === "visual.mobile_layout")?.status,
      ).toBe("missing");
    });

    it("an address on a private network is refused before the browser starts", async () => {
      const r = await runVisualReview(site.url("private.test"), opts());
      expect(r.coverage).toBe("blocked");
      expect(r.pages[0]!.access).toBe("unsafe_address");
      expect(hitsFor("private.test")).toEqual([]);
    });
  },
);
