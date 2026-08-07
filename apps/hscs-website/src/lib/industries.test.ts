import { describe, it, expect } from "vitest";
import { ASSESSMENT_HREF } from "./content";
import {
  INDUSTRIES,
  INDUSTRY_SLUGS,
  INDUSTRIES_HUB,
  INDUSTRIES_BASE,
  industryBySlug,
} from "./industries";
import { SERVICES, SERVICE_SLUGS } from "./services";

// The approved industry slugs from the Website IA §1 / Page Specifications §4.3.
// This set is fixed at exactly five; new industries require a v1.1 baseline
// revision, not an invented slug here.
const APPROVED_SLUGS = [
  "warehousing-fulfillment",
  "middle-mile-logistics",
  "direct-to-customer-cold-chain",
  "final-mile-retail-delivery",
  "white-glove-high-touch-delivery",
];

describe("industry catalog = the approved IA routes (no invented slugs)", () => {
  it("contains exactly the approved five slugs", () => {
    expect([...INDUSTRY_SLUGS].sort()).toEqual([...APPROVED_SLUGS].sort());
  });

  it("resolves every approved slug to an industry, and unknown slugs to undefined", () => {
    for (const slug of APPROVED_SLUGS) expect(industryBySlug(slug)?.slug).toBe(slug);
    expect(industryBySlug("agriculture")).toBeUndefined();
    expect(industryBySlug("healthcare-logistics")).toBeUndefined();
  });
});

describe("every industry page has the required content (Page Specs §4.3 T-Industry)", () => {
  it("has a headline, lede, operating proof, lifecycle placement, challenges, mapped services, what-you-get, and SEO", () => {
    for (const i of INDUSTRIES) {
      expect(i.name, i.slug).toBeTruthy();
      expect(i.headline, i.slug).toBeTruthy();
      expect(i.lede, i.slug).toBeTruthy();
      expect(i.operatingProof, i.slug).toBeTruthy();
      expect(i.lifecyclePlacement, i.slug).toBeTruthy();
      expect(i.challenges.length, i.slug).toBeGreaterThan(0);
      expect(i.mappedServices.length, i.slug).toBeGreaterThan(0);
      expect(i.whatYouGet.length, i.slug).toBeTruthy();
      expect(i.seoTitle, i.slug).toBeTruthy();
      expect(i.seoDescription, i.slug).toBeTruthy();
    }
  });
});

describe("primary conversion + hub navigation", () => {
  it("the hub's primary CTA is the Operations Assessment request", () => {
    expect(INDUSTRIES_HUB.primaryCta.label).toBe("Request an Operations Assessment");
    expect(INDUSTRIES_HUB.primaryCta.href).toBe(ASSESSMENT_HREF);
  });

  it("every industry's secondary CTA is its mapped service page (the §4.3 spec)", () => {
    for (const i of INDUSTRIES) {
      expect(i.secondaryCta.href.startsWith("/services/"), i.slug).toBe(true);
    }
  });
});

describe("service ↔ industry bridge (IA §6.2) resolves to real, built routes", () => {
  it("every mapped service on an industry points to a real approved service route", () => {
    for (const i of INDUSTRIES) {
      for (const svc of i.mappedServices) {
        expect(svc.href.startsWith("/services/"), `${i.slug} → ${svc.href}`).toBe(true);
        const slug = svc.href.replace("/services/", "");
        expect(SERVICE_SLUGS.includes(slug), `${i.slug} → ${slug}`).toBe(true);
      }
    }
  });

  it("service pages now link back to real, built industry routes (no coming-soon industry links remain)", () => {
    for (const s of SERVICES) {
      for (const ri of s.relatedIndustries) {
        expect(
          ri.href.startsWith(`${INDUSTRIES_BASE}/`),
          `${s.slug} → ${ri.href}`,
        ).toBe(true);
        const slug = ri.href.replace(`${INDUSTRIES_BASE}/`, "");
        expect(INDUSTRY_SLUGS.includes(slug), `${s.slug} → ${slug}`).toBe(true);
      }
    }
  });
});

describe("HONESTY: operating proof uses the name-free treatment (Foundation G4)", () => {
  // Real operating-record names stay withheld until permission-cleared. They must
  // appear nowhere in any industry page's copy.
  const WITHHELD = [
    "Amazon",
    "Lowe's",
    "Lowes",
    "Sears",
    "Bob's",
    "Bobs",
    "Arctic Glacier",
    "Sorrento",
    "Lactalis",
    "Herman Movers",
  ];

  it("no industry page names a withheld operating-record company", () => {
    for (const i of INDUSTRIES) {
      const blob = JSON.stringify(i);
      for (const name of WITHHELD) {
        expect(blob.includes(name), `${i.slug} contains "${name}"`).toBe(false);
      }
    }
  });

  it("frames the operating record as experience, not endorsement", () => {
    for (const i of INDUSTRIES) {
      expect(i.operatingProof.toLowerCase(), i.slug).toContain("experience");
    }
  });
});

describe("no industry page contains a prohibited product/marketing CTA or fabricated proof", () => {
  const FORBIDDEN = [
    "buy now",
    "add to cart",
    "free trial",
    "start free",
    "sign up",
    "signup",
    "subscribe now",
    "pricing",
    "price:",
    "$",
    "purchase now",
    "try it free",
    "get started free",
    "testimonial",
    "case study",
    "case studies",
  ];

  it("no industry's copy contains a forbidden phrase", () => {
    for (const i of INDUSTRIES) {
      const blob = JSON.stringify(i).toLowerCase();
      for (const phrase of FORBIDDEN) {
        expect(blob.includes(phrase), `${i.slug} contains "${phrase}"`).toBe(false);
      }
    }
  });

  it("no industry model carries a buy/try/price/product-cta key", () => {
    const bannedKeys = ["buyhref", "tryhref", "signuphref", "price", "pricing", "cta"];
    for (const i of INDUSTRIES) {
      const keys = Object.keys(i).map((k) => k.toLowerCase());
      for (const banned of bannedKeys) {
        expect(keys.includes(banned), `${i.slug} has key ${banned}`).toBe(false);
      }
    }
  });
});
