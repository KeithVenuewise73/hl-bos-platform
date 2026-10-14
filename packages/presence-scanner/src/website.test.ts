import { describe, expect, it } from "vitest";

import { detectConversion } from "./detectors.ts";
import { robotsAllows } from "./robots.ts";
import {
  fakeEgress,
  NOW,
  STRONG_SALON_HTML,
  WEAK_CONTRACTOR_HTML,
} from "./test-helpers.ts";
import { explainScanError, inspectWebsite } from "./website.ts";

const status = (fs: { key: string; status: string }[], key: string) =>
  fs.find((f) => f.key === key)?.status;

describe("website inspection through the existing safe scanner", () => {
  it("no address -> not checked, nothing fetched", async () => {
    const eg = fakeEgress({});
    const r = await inspectWebsite(undefined, eg, NOW);
    expect(r.status).toBe("not_checked");
    expect(r.findings).toEqual([]);
    expect(eg.fetched).toEqual([]);
  });

  it("Facebook-only: recognised from the address and never fetched", async () => {
    const eg = fakeEgress({ "www.facebook.com": { body: "<html></html>" } });
    const r = await inspectWebsite("https://www.facebook.com/smithroofing", eg, NOW);
    expect(r.status).toBe("social_only");
    expect(status(r.findings, "website.social_only")).toBe("present");
    expect(r.findings[0]!.evidence).toContain("never fetched");
    expect(eg.fetched).toEqual([]);
  });

  it("link-in-bio and retired Google sites are recognised and not fetched", async () => {
    const eg = fakeEgress({});
    expect((await inspectWebsite("https://linktr.ee/smith", eg, NOW)).status).toBe(
      "link_in_bio",
    );
    expect((await inspectWebsite("https://smith.business.site", eg, NOW)).status).toBe(
      "retired_google_site",
    );
    expect(eg.fetched).toEqual([]);
  });

  it("broken: a domain that does not resolve is unreachable, in plain English", async () => {
    const r = await inspectWebsite(
      "https://lapsed-domain.example",
      fakeEgress({}),
      NOW,
    );
    expect(r.status).toBe("unreachable");
    expect(status(r.findings, "website.reachable")).toBe("missing");
    expect(r.summary).toContain("does not resolve");
  });

  it("broken: a server error is unreachable", async () => {
    const r = await inspectWebsite(
      "https://down.example",
      fakeEgress({ "down.example": { status: 503 } }),
      NOW,
    );
    expect(r.status).toBe("unreachable");
    expect(r.summary).toContain("HTTP 503");
  });

  it("blocked: a 403 refusal is 'could not inspect', not 'broken'", async () => {
    const r = await inspectWebsite(
      "https://shy.example",
      fakeEgress({ "shy.example": { status: 403 } }),
      NOW,
    );
    expect(r.status).toBe("blocked");
    expect(status(r.findings, "website.reachable")).toBe("blocked");
  });

  it("blocked: robots.txt disallowing / is respected and the homepage is not fetched", async () => {
    const eg = fakeEgress({
      "private.example": {
        body: WEAK_CONTRACTOR_HTML,
        robots: "User-agent: *\nDisallow: /",
      },
    });
    const r = await inspectWebsite("https://private.example", eg, NOW);
    expect(r.status).toBe("blocked");
    expect(r.findings[0]!.evidence).toContain("Disallow: /");
    expect(eg.fetched).toEqual([]);
  });

  it("blocked: an address resolving to a private network is refused by the SSRF guard", async () => {
    const eg = fakeEgress({}, { "intranet.example": "10.0.0.5" });
    const r = await inspectWebsite("https://intranet.example", eg, NOW);
    expect(r.status).toBe("blocked");
    expect(r.findings[0]!.evidence).toContain("ssrf_blocked:dns_private");
    expect(eg.fetched).toEqual([]);
  });

  it("blocked: a redirect into a private network is refused", async () => {
    const eg = fakeEgress({
      "hop.example": {
        body: "<html></html>",
        redirectChain: ["http://169.254.169.254/latest"],
        finalUrl: "http://169.254.169.254/latest",
      },
    });
    const r = await inspectWebsite("https://hop.example", eg, NOW);
    expect(r.status).toBe("blocked");
  });

  it("not a web page (e.g. a PDF) is unreachable", async () => {
    const r = await inspectWebsite(
      "https://pdf.example",
      fakeEgress({ "pdf.example": { contentType: "application/pdf", body: "%PDF" } }),
      NOW,
    );
    expect(r.status).toBe("unreachable");
    expect(r.summary).toContain("does not return a web page");
  });

  it("a weak site: every gap is evidence-backed, and unseen features are 'not found', not 'missing'", async () => {
    const r = await inspectWebsite(
      "http://smithroofing.example",
      fakeEgress({ "smithroofing.example": { body: WEAK_CONTRACTOR_HTML } }),
      NOW,
    );
    expect(r.status).toBe("ok");
    const f = r.findings;
    expect(status(f, "site.https")).toBe("missing");
    expect(status(f, "site.title")).toBe("missing"); // "Home" is a weak title
    expect(status(f, "site.meta_description")).toBe("missing");
    expect(status(f, "site.viewport")).toBe("missing");
    expect(status(f, "site.structured_data")).toBe("missing");
    expect(status(f, "site.call")).toBe("not_found"); // phone in text, but no tel: link
    expect(status(f, "site.form")).toBe("not_found");
    expect(status(f, "site.booking")).toBe("not_found");
    expect(status(f, "site.copyright")).toBe("missing"); // © 2019 in 2026
    expect(f.find((x) => x.key === "site.booking")!.evidence).toContain(
      "Only the homepage is inspected",
    );
    expect(r.rubric?.version).toBe("rubric-0.1.0");
    for (const x of f) {
      expect(x.source).toBe("website");
      expect(x.observedAt).toBe(NOW.toISOString());
      expect(x.evidence.length).toBeGreaterThan(5);
    }
  });

  it("a strong site: paths and vendors are detected with the link that proves them", async () => {
    const r = await inspectWebsite(
      "https://bella.example",
      fakeEgress({ "bella.example": { body: STRONG_SALON_HTML } }),
      NOW,
    );
    const f = r.findings;
    for (const k of [
      "site.https",
      "site.title",
      "site.meta_description",
      "site.viewport",
      "site.structured_data",
      "site.analytics",
      "site.social_links",
      "site.call",
      "site.email",
      "site.form",
      "site.booking",
      "site.pricing",
      "site.services",
      "site.directions",
      "site.vendors",
      "site.copyright",
    ])
      expect([k, status(f, k)]).toEqual([k, "present"]);
    expect(f.find((x) => x.key === "site.booking")!.evidence).toContain("vagaro.com");
    expect(f.find((x) => x.key === "site.vendors")!.evidence).toContain(
      "Vagaro (booking)",
    );
  });
});

describe("conversion detectors", () => {
  it("detects ordering and reservation vendors by their own domains only", () => {
    const d = detectConversion(
      `<a href="https://www.toasttab.com/joes/v3">Order Online</a>
       <a href="https://www.opentable.com/r/joes">Reserve</a>
       <p>We love doordash and grubhub</p>`,
      NOW,
    );
    expect(d.vendors.map((v) => v.id).sort()).toEqual(["opentable", "toast"]);
    expect(d.capabilities.ordering?.found).toBe(true);
    expect(d.capabilities.booking?.found).toBe(true);
  });

  it("finds a menu from a menu link or PDF, not from a navigation toggle", () => {
    expect(
      detectConversion(`<a href="/menu">Menu</a>`, NOW).capabilities.menu?.found,
    ).toBe(true);
    expect(
      detectConversion(`<a href="/files/DinnerMenu.pdf">Dinner</a>`, NOW).capabilities
        .menu?.found,
    ).toBe(true);
    expect(
      detectConversion(
        `<button aria-label="menu">≡</button><a href="#">Open main menu now</a>`,
        NOW,
      ).capabilities.menu?.found,
    ).toBe(false);
  });

  it("counts prices shown on the page as pricing only with three or more", () => {
    expect(
      detectConversion("<p>Cut $25 Colour $80 Blowout $40</p>", NOW).capabilities
        .pricing?.found,
    ).toBe(true);
    expect(detectConversion("<p>Cut $25</p>", NOW).capabilities.pricing?.found).toBe(
      false,
    );
  });

  it("finds youth-sports registration and contractor quote tools", () => {
    expect(
      detectConversion(
        `<a href="https://wnysoccer.leagueapps.com/register">Register</a>`,
        NOW,
      ).capabilities.registration?.found,
    ).toBe(true);
    expect(
      detectConversion(
        `<a href="https://clienthub.getjobber.com/booking/x">Request work</a>`,
        NOW,
      ).capabilities.form?.found,
    ).toBe(true);
  });

  it("reads the latest static copyright year, and ignores future years", () => {
    expect(
      detectConversion("<footer>© 2015 - 2021 Acme</footer>", NOW).copyrightYear,
    ).toBe(2021);
    expect(
      detectConversion("<footer>Copyright 2099</footer>", NOW).copyrightYear,
    ).toBeUndefined();
    expect(
      detectConversion(
        "<footer>&copy; <script>document.write(new Date().getFullYear())</script></footer>",
        NOW,
      ).copyrightYear,
    ).toBeUndefined();
  });
});

describe("robots.txt", () => {
  it("disallow-all blocks; empty disallow allows; our own group wins", () => {
    expect(robotsAllows("User-agent: *\nDisallow: /").allowed).toBe(false);
    expect(robotsAllows("User-agent: *\nDisallow:").allowed).toBe(true);
    expect(robotsAllows("User-agent: *\nDisallow: /admin").allowed).toBe(true);
    expect(
      robotsAllows(
        "User-agent: *\nDisallow: /\n\nUser-agent: HLG-PresenceScanner\nAllow: /",
      ).allowed,
    ).toBe(true);
    expect(robotsAllows("User-agent: Googlebot\nDisallow: /").allowed).toBe(true);
    expect(robotsAllows("User-agent: *\nDisallow: /\nAllow: /$").allowed).toBe(true);
  });
});

describe("scanner error codes in plain English", () => {
  it("translates each class of failure", () => {
    expect(explainScanError("ssrf_blocked:dns_no_records")).toContain(
      "does not resolve",
    );
    expect(explainScanError("ssrf_blocked:ip_private")).toContain("private");
    expect(explainScanError("http_404")).toContain("Page Not Found");
    expect(explainScanError("http_429")).toContain("rate-limiting");
    expect(explainScanError("fetch_error:Error: timeout after 10000 ms")).toContain(
      "in time",
    );
    expect(explainScanError("fetch_error:Error: certificate has expired")).toContain(
      "certificate",
    );
  });
});
