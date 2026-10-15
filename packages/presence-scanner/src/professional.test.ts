import { describe, expect, it } from "vitest";

import { detectConversion } from "./detectors.ts";
import { FINDING_STATUS_LABELS } from "./labels.ts";
import { runMarketScan } from "./pipeline.ts";
import { markSavedCopy, savedPageEgress } from "./saved-copy.ts";
import {
  DEFAULT_SCORING_CONFIG,
  scoreOpportunity,
  SCORING_VERSION,
  validateConfig,
} from "./score.ts";
import { fakeEgress, NOW } from "./test-helpers.ts";
import type { Prospect, Vertical } from "./types.ts";
import { matchChain } from "./chains.ts";
import {
  professionalSubtype,
  VERTICAL_KEYS,
  VERTICALS,
  type ConversionKey,
} from "./verticals.ts";
import type { WebEgress } from "./website.ts";

// A consultancy homepage with every professional-services path present.
const FULL = `<!doctype html><html><head><title>Lakeview Advisory | Operations consulting in Buffalo</title>
<meta name="description" content="Operations consulting for Western New York businesses.">
<meta name="viewport" content="width=device-width">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"ProfessionalService","name":"Lakeview Advisory"}</script>
</head><body>
<nav><a href="/services">Services</a><a href="/industries">Industries</a><a href="/about">About us</a><a href="/how-we-work">How we work</a><a href="/case-studies">Case studies</a></nav>
<a href="https://calendly.com/lakeview/intro">Book a consultation</a>
<a href="tel:+17165550000">Call</a><a href="mailto:hello@lakeview.example">Email</a>
<p>Serving Western New York and the Southern Tier.</p>
<form action="/contact"><input name="n"></form><a href="/privacy">Privacy policy</a>
<footer>© 2026 Lakeview Advisory</footer></body></html>`;

// A consultancy homepage with nothing but a title.
const THIN = `<!doctype html><html><head><title>Home</title></head><body><h1>Welcome</h1><p>We help businesses.</p></body></html>`;

// What the HSCS site actually carries: statistics, testimonials, a 555 number, a form.
const CLAIMS = `<!doctype html><html><head><title>Example Logistics Consulting | Transportation consulting</title></head><body>
<a href="/assessment">Start Free Operational Assessment</a>
<h2>Live Performance Benchmarks</h2><p>$2.4M+ Average Annual Savings Identified. 98.2% Client Retention Rate. 200+ Operational Engagements. 30 Yrs Logistics Leadership Experience.</p>
<h2>What Our Clients Say</h2><blockquote>They found savings we did not know existed.</blockquote>
<p>Phone 1-800-555-1234</p><form><input name="e"></form></body></html>`;

async function scan(
  vertical: Vertical,
  html: string | undefined,
  egressOverride?: WebEgress,
): Promise<Prospect> {
  let n = 0;
  const egress =
    egressOverride ??
    fakeEgress(html === undefined ? {} : { "firm.example": { body: html } });
  const { prospects } = await runMarketScan(
    {
      market: "West Seneca",
      zip: "14224",
      radiusMiles: 10,
      vertical,
      maxResults: 5,
      searchTerms: undefined,
      source: "import",
      importText: `Firm Example | ${html === undefined ? "none" : "https://firm.example/"} | 716-220-7354`,
    },
    {
      places: null,
      egress,
      now: () => NOW,
      newId: () => `lead-${++n}`,
      existing: [],
      actor: "test",
    },
  );
  return prospects[0]!;
}

const status = (p: Prospect, key: string) =>
  p.findings.find((f) => f.key === key)?.status;

describe("professional services is a registered vertical", () => {
  it("is in the registry with its own rules, checks and subtypes", () => {
    const v = VERTICALS.professional_services;
    expect(VERTICAL_KEYS).toContain("professional_services");
    expect(v.label).toBe("Professional services / consulting");
    expect(Object.values(v.conversion).reduce((a, b) => a + b, 0)).toBe(20);
    expect(v.conversion.consultation).toBeGreaterThan(0);
    expect(v.extraChecks).toEqual(
      expect.arrayContaining(["consultation", "testimonials", "claims", "privacy"]),
    );
    expect(validateConfig(DEFAULT_SCORING_CONFIG)).toEqual([]);
    expect(SCORING_VERSION).toBe("presence-opportunity-0.2.0");
  });

  it("the five Phase 1 verticals record exactly their Phase 1 website checks", () => {
    for (const k of VERTICAL_KEYS.filter((k) => k !== "professional_services"))
      expect(VERTICALS[k].extraChecks).toEqual([]);
  });

  it("covers consultants, logistics, agencies, accountants, insurance and real estate", () => {
    const sub = (s: string) => professionalSubtype(s).key;
    expect(sub("HLG Business Transformation")).toBe("business_transformation");
    expect(sub("Herman Supply Chain Solutions logistics consulting")).toBe(
      "transport_operations",
    );
    expect(sub("Buffalo Digital Marketing Agency")).toBe("digital_services");
    expect(sub("Smith CPA")).toBe("accounting");
    expect(sub("Orchard Park Insurance Agency")).toBe("insurance");
    expect(sub("Seneca Realty")).toBe("real_estate");
    expect(sub("Kim Advisory")).toBe("general_consulting");
  });

  it("excludes national franchises within the vertical only", () => {
    expect(matchChain("H&R Block", "professional_services")).toBe("h r block");
    expect(matchChain("Keller Williams Realty", "professional_services")).toBeDefined();
    expect(matchChain("H&R Block", "contractor")).toBeUndefined();
  });
});

describe("professional-services scoring", () => {
  it("a complete site has no conversion gaps, and every path is evidenced", async () => {
    const p = await scan("professional_services", FULL);
    for (const k of [
      "site.consultation",
      "site.industries",
      "site.about",
      "site.process",
      "site.proof",
      "site.service_area",
      "site.business_schema",
      "site.privacy",
    ])
      expect(status(p, k), k).toBe("present");
    const conv = p.score.components.find((c) => c.component === "conversion")!;
    expect(conv.awarded).toBe(0);
    expect(conv.status).toBe("scored");
    expect(p.findings.find((f) => f.key === "site.consultation")!.evidence).toContain(
      "Calendly",
    );
  });

  it("a thin site scores every professional gap, each with its rule and finding", async () => {
    const p = await scan("professional_services", THIN);
    const conv = p.score.components.find((c) => c.component === "conversion")!;
    expect(conv.awarded).toBe(20);
    const rules = conv.contributions.map((c) => c.ruleId).sort();
    const expected = (
      Object.keys(VERTICALS.professional_services.conversion) as ConversionKey[]
    )
      .map((k) => `C.missing_${k}`)
      .sort();
    expect(rules).toEqual(expected);
    for (const c of conv.contributions) expect(c.findingKeys).toHaveLength(1);
    expect(conv.note).toContain("Professional services / consulting rules");
  });

  it("a business with no website is scored as having none, like any vertical", async () => {
    const p = await scan("professional_services", undefined);
    expect(p.websiteStatus).toBe("none");
    expect(p.score.components.find((c) => c.component === "conversion")!.awarded).toBe(
      20,
    );
  });
});

describe("missing and unverifiable data is never scored", () => {
  it("offline: website parts are not checked, not zero", async () => {
    const offline: WebEgress = {
      online: () => Promise.resolve(false),
      resolve: () => Promise.reject(new Error("offline")),
      fetchPage: () => Promise.reject(new Error("offline")),
      fetchRobots: () => Promise.resolve(undefined),
    };
    const p = await scan("professional_services", FULL, offline);
    expect(p.websiteStatus).toBe("not_checked");
    expect(status(p, "site.consultation")).toBeUndefined();
    const conv = p.score.components.find((c) => c.component === "conversion")!;
    expect(conv.status).toBe("not_checked");
    expect(p.score.checkedMax).toBeLessThan(100);
  });

  it("testimonials, statistics and 555 numbers require manual verification", async () => {
    const p = await scan("professional_services", CLAIMS);
    expect(status(p, "site.testimonials")).toBe("needs_verification");
    expect(status(p, "site.claims")).toBe("needs_verification");
    expect(status(p, "site.placeholder_contact")).toBe("needs_verification");
    const claims = p.findings.find((f) => f.key === "site.claims")!;
    expect(claims.evidence).toContain("$2.4M+");
    expect(claims.evidence).toContain("98.2%");
    expect(claims.evidence).toContain("cannot be judged from a web page");
    expect(FINDING_STATUS_LABELS[claims.status]).toBe("Requires manual verification");
    expect(status(p, "site.consultation")).toBe("present");
    // A form with no privacy link is a gap; with no form it is not judged.
    expect(status(p, "site.privacy")).toBe("not_found");
    expect(status(await scan("professional_services", THIN), "site.privacy")).toBe(
      "not_checked",
    );
  });

  it("a needs_verification finding never earns or costs points", () => {
    const base = {
      vertical: "professional_services" as const,
      websiteStatus: "ok" as const,
      rubric: undefined,
      reviews: undefined,
    };
    const f = (key: string, st: "not_found" | "needs_verification") => ({
      key,
      label: key,
      status: st,
      source: "website" as const,
      observedAt: NOW.toISOString(),
      evidence: "x",
      confidence: "low" as const,
    });
    const a = scoreOpportunity({
      ...base,
      findings: [f("site.consultation", "not_found")],
    });
    const b = scoreOpportunity({
      ...base,
      findings: [f("site.consultation", "needs_verification")],
    });
    expect(a.components.find((c) => c.component === "conversion")!.awarded).toBe(4);
    const bc = b.components.find((c) => c.component === "conversion")!;
    expect(bc.awarded).toBe(0);
    expect(bc.status).toBe("not_checked");
  });

  it("contractor scans record no professional-services findings", async () => {
    const p = await scan("contractor", CLAIMS);
    expect(p.findings.some((f) => f.key === "site.testimonials")).toBe(false);
    expect(p.findings.some((f) => f.key === "site.consultation")).toBe(false);
  });
});

describe("detectors", () => {
  it("record exactly what they saw", () => {
    const d = detectConversion(CLAIMS, NOW);
    expect(d.capabilities.consultation?.evidence).toContain(
      "free operational assessment",
    );
    expect(d.observations.placeholderPhones.evidence).toContain("800-555-1234");
    expect(d.observations.testimonials.found).toBe(true);
    const none = detectConversion(THIN, NOW);
    expect(none.observations.claims.found).toBe(false);
    expect(none.observations.placeholderPhones.found).toBe(false);
  });

  it("a real 716 number is not mistaken for a placeholder", () => {
    const d = detectConversion(
      '<a href="tel:+17162207354">716-220-7354</a><p>Call (716) 220-7354</p>',
      NOW,
    );
    expect(d.observations.placeholderPhones.found).toBe(false);
  });
});

describe("inspecting a saved copy of a homepage", () => {
  const page = {
    url: "https://firm.example/",
    html: CLAIMS,
    source: "GitHub example/firm-site @ abc1234",
    savedAt: "2026-10-15T00:00:00Z",
  };

  it("runs the same scanner and labels every website finding as a saved copy", async () => {
    const p = await scan("professional_services", "x", savedPageEgress(page));
    const marked = markSavedCopy(p.findings, page);
    const site = marked.filter((f) => f.source === "website");
    expect(site.length).toBeGreaterThan(10);
    for (const f of site) {
      expect(f.evidence).toContain("Saved copy of https://firm.example/");
      expect(f.evidence).toContain("the live site was not contacted");
      expect(f.confidence).not.toBe("high");
    }
    expect(marked.find((f) => f.key === "website.reachable")!.label).toBe(
      "Website inspected from a saved copy",
    );
    expect(status(p, "site.claims")).toBe("needs_verification");
  });

  it("serves only the saved address and never reaches the network", async () => {
    const e = savedPageEgress(page);
    await expect(e.fetchPage("https://other.example/")).rejects.toThrow();
    await expect(e.resolve("other.example")).rejects.toThrow();
    expect((await e.fetchPage("https://firm.example/")).body).toBe(CLAIMS);
    expect(await e.fetchRobots("https://firm.example")).toBeUndefined();
  });
});
