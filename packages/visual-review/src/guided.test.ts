// "View it yourself" in a real Chromium against local synthetic sites. The test
// plays the person: it clicks links in the window the way someone would, then
// closes the window. With a display (DISPLAY set, e.g. under xvfb-run) the
// window is a real visible one; without, it runs headless. Skipped where no
// browser is installed.

import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ipBlockedReason } from "../../../supabase/functions/_shared/discovery/url.ts";

import { visualFindings } from "./findings.ts";
import { startFixtureSites, type FixtureServer } from "./fixture-sites.test-helpers.ts";
import { guidedCoverage, startGuidedSession, type GuidedOptions } from "./guided.ts";

async function browserInstalled(): Promise<boolean> {
  try {
    const { chromium } = await import("playwright");
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}
const HAVE_BROWSER = await browserInstalled();
const HEADED = Boolean(process.env["DISPLAY"]);

describe.skipIf(!HAVE_BROWSER)(
  `view it yourself (${HEADED ? "visible window" : "headless"})`,
  { timeout: 120_000 },
  () => {
    let site: FixtureServer;
    let out: string;
    const opts = (): GuidedOptions => ({
      outDir: out,
      headless: !HEADED,
      settleMs: 300,
      extraPorts: [String(site.port)],
      resolve: (h) =>
        h === "private.test"
          ? Promise.resolve(["10.0.0.5"])
          : h.endsWith(".test")
            ? Promise.resolve(["127.0.0.1"])
            : Promise.reject(new Error(`unknown ${h}`)),
      ipBlocked: (ip) => (ip === "127.0.0.1" ? null : ipBlockedReason(ip)),
      launchArgs: ["--host-resolver-rules=MAP *.test 127.0.0.1"],
    });
    const settle = (ms = 1500) => new Promise((r) => setTimeout(r, ms));

    beforeAll(async () => {
      site = await startFixtureSites();
      out = await mkdtemp(path.join(tmpdir(), "guided-review-"));
    });
    afterAll(async () => {
      await site.close();
    });

    it("records every page the person lands on, in order, with screen and phone captures; closing the window ends it", async () => {
      const s = await startGuidedSession(site.url("rinks.test"), opts());
      const p = s.page!;
      await settle();
      await p.click("nav >> text=Programs");
      await settle();
      await p.click("text=Register now"); // the third-party registration page
      await settle();
      expect(s.captured()).toBe(3);
      await p.close(); // the person closes the window
      const r = await s.done;
      expect(r.method).toBe("guided");
      expect(r.coverage).toBe("complete");
      expect(r.pages.map((x) => [new URL(x.url).pathname, x.role])).toEqual([
        ["/", "home"],
        ["/programs", "navigation"],
        ["/register", "third_party"],
      ]);
      for (const x of r.pages) {
        expect(existsSync(path.join(out, r.id, x.desktop!.file))).toBe(true);
        expect(existsSync(path.join(out, r.id, x.mobile!.file))).toBe(true);
      }
      expect(r.pages[0]!.mobileMenuOpened).toBeUndefined(); // the software opened nothing itself
      expect(existsSync(path.join(out, r.id, "review.json"))).toBe(true);
      const f = new Map(visualFindings(r).map((x) => [x.key, x]));
      expect(f.get("visual.coverage")?.label).toContain("viewed by you");
      expect(f.get("visual.booking_path")?.evidence).toContain("booking.test");
    });

    it("the software itself sent nothing: only the pages the person opened (and their resources) were requested", async () => {
      const before = site.hits.length;
      const s = await startGuidedSession(site.url("rinks.test", "/contact"), opts());
      await settle();
      await s.stop();
      const docs = site.hits
        .slice(before)
        .filter((h) => h.host === "rinks.test" && !h.path.startsWith("/track"));
      expect(docs.map((h) => h.path)).toEqual(["/contact"]);
    });

    it("a block page is recorded as a block, asked once, and the review says the site could not be viewed", async () => {
      const before = site.hits.filter((h) => h.host === "cf.test").length;
      const s = await startGuidedSession(site.url("cf.test"), opts());
      await settle();
      const r = await s.stop();
      expect(r.coverage).toBe("blocked");
      expect(r.pages[0]!.access).toBe("challenge");
      expect(site.hits.filter((h) => h.host === "cf.test").length - before).toBe(1);
      expect(visualFindings(r).map((x) => x.key)).toEqual(["visual.coverage"]);
    });

    it("a check the PERSON gets past: the check page is recorded, the site behind it is viewed, coverage is complete", async () => {
      const s = await startGuidedSession(site.url("gate.test"), opts());
      const p = s.page!;
      await settle();
      await p.click("#human"); // the person, not the software
      await settle();
      const r = await s.stop();
      expect(r.pages.map((x) => x.access)).toEqual(["challenge", "ok"]);
      expect(r.coverage).toBe("complete");
      expect(r.coverageReason).toContain(
        "security check page(s) you got past are recorded but not counted",
      );
    });

    it("a private-network address opens no window", async () => {
      const s = await startGuidedSession(site.url("private.test"), opts());
      const r = await s.done;
      expect(s.page).toBeUndefined();
      expect(r.coverage).toBe("blocked");
      expect(site.hits.filter((h) => h.host === "private.test")).toEqual([]);
    });

    it("an address that cannot be found opens no window and is 'failed', not 'blocked'", async () => {
      const s = await startGuidedSession("http://missing.example:80/", {
        ...opts(),
        resolve: () =>
          Promise.reject(new Error("getaddrinfo ENOTFOUND missing.example")),
      });
      const r = await s.done;
      expect(s.page).toBeUndefined();
      expect(r.coverage).toBe("failed");
      expect(r.coverageReason).toContain("could not be found");
      expect(r.coverageReason).not.toContain("You opened the site");
    });

    it("closing the window before any page loaded is a plain 'nothing was viewed'", () => {
      expect(guidedCoverage([]).coverage).toBe("failed");
    });
  },
);
