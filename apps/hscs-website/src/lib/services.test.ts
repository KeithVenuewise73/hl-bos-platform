import { describe, it, expect } from "vitest";
import { ASSESSMENT_HREF } from "./content";
import {
  SERVICES,
  SERVICE_SLUGS,
  SERVICES_HUB,
  serviceBySlug,
  ASSESSMENT_SERVICE_HREF,
} from "./services";

// The approved service slugs from the Website IA §1 / Page Specifications §4.2.
// This set is fixed; new services require a v1.1 baseline revision, not an
// invented slug here.
const APPROVED_SLUGS = [
  "operations-assessment",
  "transportation-fleet-optimization",
  "warehousing-distribution-improvement",
  "final-mile-white-glove-delivery",
  "operational-turnaround-margin-recovery",
  "operations-technology-advisory",
  "operations-transformation-program",
  "ai-enablement-for-operations",
  "advisory-operations-leadership",
  "executive-operations-dashboards",
  "government-logistics",
];

describe("service catalog = the approved IA routes (no invented slugs)", () => {
  it("contains exactly the approved slugs", () => {
    expect([...SERVICE_SLUGS].sort()).toEqual([...APPROVED_SLUGS].sort());
  });

  it("resolves every approved slug to a service, and unknown slugs to undefined", () => {
    for (const slug of APPROVED_SLUGS) expect(serviceBySlug(slug)?.slug).toBe(slug);
    expect(serviceBySlug("supply-chain-consulting")).toBeUndefined();
    expect(serviceBySlug("dsp-3pl-training")).toBeUndefined();
  });
});

describe("every service page has the required content (Page Specs §4.2)", () => {
  it("has a headline, lede, problem, scope, experience, what-you-get, and SEO", () => {
    for (const s of SERVICES) {
      expect(s.name, s.slug).toBeTruthy();
      expect(s.headline, s.slug).toBeTruthy();
      expect(s.lede, s.slug).toBeTruthy();
      expect(s.problem, s.slug).toBeTruthy();
      expect(s.scope.length, s.slug).toBeGreaterThan(0);
      expect(s.experience, s.slug).toBeTruthy();
      expect(s.whatYouGet.length, s.slug).toBeGreaterThan(0);
      expect(s.seoTitle, s.slug).toBeTruthy();
      expect(s.seoDescription, s.slug).toBeTruthy();
    }
  });
});

describe("primary conversion + hub navigation", () => {
  it("the hub's primary CTA is the Operations Assessment request", () => {
    expect(SERVICES_HUB.primaryCta.label).toBe("Request an Operations Assessment");
    expect(SERVICES_HUB.primaryCta.href).toBe(ASSESSMENT_HREF);
  });

  it("the hub 'start here' and each service secondary CTA route to the real assessment service page", () => {
    expect(SERVICES_HUB.startHereHref).toBe(ASSESSMENT_SERVICE_HREF);
    expect(ASSESSMENT_SERVICE_HREF).toBe("/services/operations-assessment");
    for (const s of SERVICES) {
      expect(s.secondaryCta.href, s.slug).toBeTruthy();
    }
  });

  it("marks exactly one front-door service (Operations Assessment)", () => {
    const startHere = SERVICES.filter((s) => s.startHere);
    expect(startHere).toHaveLength(1);
    expect(startHere[0]?.slug).toBe("operations-assessment");
  });
});

describe("Government Logistics is a consulting PRACTICE, not a product", () => {
  const gov = serviceBySlug("government-logistics");

  it("is flagged as a practice area", () => {
    expect(gov?.practiceArea).toBe(true);
  });

  it("frames itself as consulting (practice leads; software supports)", () => {
    const text = `${gov?.headline} ${gov?.lede} ${gov?.experience} ${gov?.faq
      .map((f) => f.a)
      .join(" ")}`.toLowerCase();
    expect(text).toContain("practice");
    expect(text).not.toContain("platform product");
  });
});

describe("no service page contains a prohibited buy/try product CTA", () => {
  // Tools may be NAMED as engagement enhancers (toolsNote) but never sold.
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
  ];

  it("no service's copy contains a product-CTA phrase", () => {
    for (const s of SERVICES) {
      const blob = JSON.stringify(s).toLowerCase();
      for (const phrase of FORBIDDEN) {
        expect(blob.includes(phrase), `${s.slug} contains "${phrase}"`).toBe(false);
      }
    }
  });

  it("no service model carries a tool product link/CTA field", () => {
    const bannedKeys = ["buyhref", "tryhref", "signuphref", "price", "pricing", "cta"];
    for (const s of SERVICES) {
      const keys = Object.keys(s).map((k) => k.toLowerCase());
      for (const banned of bannedKeys) {
        expect(keys.includes(banned), `${s.slug} has key ${banned}`).toBe(false);
      }
    }
  });
});
