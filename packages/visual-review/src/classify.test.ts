import { describe, expect, it } from "vitest";

import { blankCapture } from "./browser.ts";
import {
  accessFromStatus,
  coverageOf,
  intentOf,
  planPages,
  providerOf,
  sameSite,
} from "./classify.ts";
import { visualFindings, withVisualReview } from "./findings.ts";
import type { PageCapture, VisualReview } from "./types.ts";

const AT = new Date("2026-11-06T12:00:00Z");
const ok = (
  url: string,
  role: PageCapture["role"],
  extra: Partial<PageCapture> = {},
): PageCapture => ({
  ...blankCapture(url, role, role, "ok", "Rendered.", AT),
  desktop: { file: "p01-desktop.png", width: 1366, height: 900, truncated: false },
  mobile: { file: "p01-mobile.png", width: 390, height: 844, truncated: false },
  ...extra,
});
const review = (pages: PageCapture[], notRequested = 0): VisualReview => {
  const c = coverageOf(pages, notRequested);
  return {
    id: "vr-test-0001",
    startUrl: pages[0]?.url ?? "",
    startedAt: AT.toISOString(),
    finishedAt: AT.toISOString(),
    coverage: c.coverage,
    coverageReason: c.reason,
    pages,
    notVisited: [],
    environment: {
      browser: "chromium test",
      userAgent: "x",
      desktopViewport: "1366x900",
      mobileViewport: "390x844",
      maxPages: 6,
    },
    version: "visual-review-0.1.0",
  };
};

describe("which pages to look at", () => {
  it("menu items on the same site, relevant first; off-site booking/registration as landing pages only; limits recorded", () => {
    const home = "https://www.rink.example/";
    const { planned, leftOut } = planPages(
      home,
      [
        { text: "Home", href: "https://www.rink.example/" },
        { text: "News", href: "https://www.rink.example/news" },
        { text: "Programs", href: "https://rink.example/programs" },
        { text: "Login", href: "https://www.rink.example/login" },
        { text: "Brochure", href: "https://www.rink.example/brochure.pdf" },
        { text: "Facebook", href: "https://facebook.com/rink" },
      ],
      [
        {
          text: "Register",
          href: "https://rink.sportngin.com/register",
          intent: "register",
          provider: "SportsEngine",
        },
        {
          text: "Book a party",
          href: "https://www.rink.example/parties",
          intent: "book",
          provider: undefined,
        },
        {
          text: "Tickets",
          href: "https://tix.example/a",
          intent: "buy",
          provider: undefined,
        },
        {
          text: "Tickets 2",
          href: "https://other.example/b",
          intent: "buy",
          provider: undefined,
        },
      ],
      { maxPages: 2, maxThirdParty: 2 },
    );
    expect(planned.map((p) => p.url)).toEqual([
      "https://rink.example/programs",
      "https://www.rink.example/news",
      "https://rink.sportngin.com/register",
      "https://tix.example/a",
    ]);
    expect(planned.find((p) => p.role === "third_party")!.reason).toContain(
      "landing page only",
    );
    expect(leftOut.map((l) => l.reason)).toEqual([
      "page limit (2 pages besides the homepage)",
      "third-party limit (2 providers)",
    ]);
  });

  it("same site ignores www. and includes subdomains; providers come from the Presence Scanner list", () => {
    expect(sameSite("https://shop.rink.example/x", "https://www.rink.example")).toBe(
      true,
    );
    expect(sameSite("https://rink-example.com", "https://rink.example")).toBe(false);
    expect(providerOf("https://rink.sportngin.com/register")).toBe("SportsEngine");
    expect(intentOf("Register now", "https://x.example/a")).toBe("register");
    expect(intentOf("", "tel:+17165550100")).toBe("call");
    expect(intentOf("Public skating times", "https://x.example/p")).toBe("schedule");
  });
});

describe("what the review may claim", () => {
  it("status codes", () => {
    expect([401, 403, 451, 429, 404, 503, 200].map(accessFromStatus)).toEqual([
      "http_blocked",
      "http_blocked",
      "http_blocked",
      "rate_limited",
      "not_found",
      "server_error",
      "ok",
    ]);
  });

  it("complete only when every selected page rendered with both captures of the homepage", () => {
    expect(
      coverageOf([
        ok("https://r.example/", "home"),
        ok("https://r.example/a", "navigation"),
      ]).coverage,
    ).toBe("complete");
    expect(
      coverageOf([ok("https://r.example/", "home", { mobile: undefined })]).coverage,
    ).toBe("partial");
    expect(
      coverageOf([
        ok("https://r.example/", "home"),
        { ...ok("https://r.example/a", "navigation"), access: "timeout" },
      ]).coverage,
    ).toBe("partial");
    expect(coverageOf([ok("https://r.example/", "home")], 1).coverage).toBe("partial");
    expect(
      coverageOf([{ ...ok("https://r.example/", "home"), access: "challenge" }])
        .coverage,
    ).toBe("blocked");
    expect(
      coverageOf([{ ...ok("https://r.example/", "home"), access: "robots_disallowed" }])
        .coverage,
    ).toBe("blocked");
    expect(
      coverageOf([{ ...ok("https://r.example/", "home"), access: "server_error" }])
        .coverage,
    ).toBe("failed");
    expect(coverageOf([]).coverage).toBe("failed");
  });

  it("a blocked review yields one finding and claims nothing about the site", () => {
    const f = visualFindings(
      review([
        {
          ...ok("https://r.example/", "home"),
          access: "http_blocked",
          detail: "refused (HTTP 403)",
        },
      ]),
    );
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ key: "visual.coverage", status: "blocked" });
  });

  it("absence is scoped to the pages viewed, at medium confidence; never stated for unviewed pages", () => {
    const f = visualFindings(review([ok("https://r.example/", "home")]));
    const booking = f.find((x) => x.key === "visual.booking_path")!;
    expect(booking.status).toBe("not_found");
    expect(booking.confidence).toBe("medium");
    expect(booking.evidence).toContain(
      "on the 1 page(s) of the site viewed in a real browser",
    );
  });

  it("attaching replaces an earlier visual review's findings and records the coverage on the lead", () => {
    const lead = {
      findings: [
        {
          key: "visual.old",
          label: "x",
          status: "present",
          source: "website",
          observedAt: "",
          evidence: "x",
          confidence: "high",
        },
        {
          key: "site.title",
          label: "t",
          status: "present",
          source: "website",
          observedAt: "",
          evidence: "t",
          confidence: "high",
        },
      ],
      audit: [],
    } as never;
    const p = withVisualReview(lead, review([ok("https://r.example/", "home")]));
    expect(p.findings.some((x) => x.key === "visual.old")).toBe(false);
    expect(p.findings.some((x) => x.key === "site.title")).toBe(true);
    expect(p.visual).toMatchObject({
      coverage: "complete",
      pagesViewed: 1,
      reviewId: "vr-test-0001",
    });
  });
});
