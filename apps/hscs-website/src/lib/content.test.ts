import { describe, it, expect } from "vitest";
import {
  BRAND,
  DOCTRINE,
  PRIMARY_CTA,
  ASSESSMENT_HREF,
  COMING_SOON,
  NAV_PRIMARY,
  HERO,
  CREDIBILITY,
  LIFECYCLE,
  WHY,
  SERVICES,
  METHOD,
  AI_CLARIFIER,
  TOOLBOX,
  WHO_WE_HELP,
  WHAT_YOU_GET,
  CLOSING,
  FOOTER,
  SECTION_ORDER,
} from "./content";

describe("brand + doctrine", () => {
  it("carries the approved brand descriptor", () => {
    expect(BRAND.short).toBe("HSCS");
    expect(BRAND.descriptor).toBe("Transportation & Operations Consulting");
  });

  it("states the guiding doctrine verbatim", () => {
    expect(DOCTRINE).toBe(
      "Operations lead. Technology supports. Operational expertise is the product. AI enhances analysis, validation, and decision-making.",
    );
  });
});

describe("primary conversion (CTA rule)", () => {
  it("is 'Request an Operations Assessment' everywhere the primary CTA appears", () => {
    expect(PRIMARY_CTA.label).toBe("Request an Operations Assessment");
    expect(HERO.primaryCta.label).toBe(PRIMARY_CTA.label);
    expect(CLOSING.primaryCta.label).toBe(PRIMARY_CTA.label);
    expect(FOOTER.primaryCta.label).toBe(PRIMARY_CTA.label);
  });

  it("points to the honest 'being prepared' page, not a fake form", () => {
    expect(PRIMARY_CTA.href).toBe(ASSESSMENT_HREF);
    expect(ASSESSMENT_HREF).toBe("/request-an-assessment");
  });
});

describe("homepage structure (S1–S11)", () => {
  it("renders the eleven in-page sections in the approved order", () => {
    expect(SECTION_ORDER).toEqual([
      "top",
      "operating-record",
      "lifecycle",
      "why-hscs",
      "services",
      "method",
      "ai",
      "toolbox",
      "who-we-help",
      "what-you-get",
      "closing",
    ]);
  });

  it("leads with the approved hero headline and eyebrow", () => {
    expect(HERO.eyebrow).toBe("TRANSPORTATION & OPERATIONS CONSULTING");
    expect(HERO.headline).toBe("35 Years of Operational Experience. Enhanced by AI.");
  });

  it("presents the end-to-end lifecycle in supply-chain order", () => {
    expect(LIFECYCLE.stages.map((s) => s.name)).toEqual([
      "Manufacturing",
      "Warehousing",
      "Middle Mile",
      "Distribution",
      "Final Mile",
      "White Glove",
    ]);
  });

  it("frames HSCS as operators who consult", () => {
    expect(WHY.headline).toBe(
      "Operators who consult — not consultants who understand operations.",
    );
  });

  it("makes the Operations Assessment the start-here service", () => {
    const startHere = SERVICES.services.filter((s) => s.startHere);
    expect(startHere).toHaveLength(1);
    expect(startHere[0]?.name).toBe("Operations Assessment");
  });

  it("shows the four-stage method and the honesty guarantee", () => {
    expect(METHOD.steps).toEqual(["Assess", "Analyze", "Recommend", "Transform"]);
    expect(METHOD.honestyGuarantee.length).toBeGreaterThan(0);
  });

  it("clarifies AI as an enhancer, not the product", () => {
    expect(AI_CLARIFIER.headline).toBe(
      "AI is not the product. Operational expertise is.",
    );
    expect(AI_CLARIFIER.enhances).toHaveLength(4);
  });
});

describe("doctrine: tools support consulting, never sold (Foundation §18)", () => {
  it("lists all seven toolbox tools", () => {
    expect(TOOLBOX.tools.map((t) => t.name)).toEqual([
      "Operational Assessments",
      "FleetHuddle",
      "DispatchAI",
      "TransportationAI",
      "Executive Dashboards",
      "Government Logistics",
      "AI-supported Operational Intelligence",
    ]);
  });

  it("gives no tool a link or CTA (no buy/try surface)", () => {
    for (const tool of TOOLBOX.tools) {
      expect(Object.keys(tool).sort()).toEqual(["name", "role"]);
      expect(tool).not.toHaveProperty("href");
      expect(tool).not.toHaveProperty("cta");
    }
  });
});

describe("honesty rules", () => {
  it("uses the name-free operating-record line until names are permission-cleared", () => {
    const withheld = [
      "Amazon",
      "Lowe's",
      "Sears",
      "Bob's",
      "Arctic Glacier",
      "Lactalis",
    ];
    for (const name of withheld) {
      expect(CREDIBILITY.operatingRecord).not.toContain(name);
    }
  });

  it("routes not-yet-built destinations to the honest coming-soon page", () => {
    expect(CREDIBILITY.secondaryCta.href).toBe(COMING_SOON);
    expect(SERVICES.secondaryCta.href).toBe(COMING_SOON);
    expect(WHO_WE_HELP.secondaryCta.href).toBe(COMING_SOON);
    expect(WHAT_YOU_GET.secondaryCta.href).toBe(COMING_SOON);
    expect(CLOSING.secondaryCta.href).toBe(COMING_SOON);
  });

  it("marks every primary nav item as pending (its page is not built yet)", () => {
    expect(NAV_PRIMARY.map((n) => n.label)).toEqual([
      "Services",
      "Industries",
      "Experience",
      "Method",
      "Insights",
      "About",
    ]);
    expect(NAV_PRIMARY.every((n) => n.status === "pending")).toBe(true);
  });

  it("keeps working on-page anchors for secondary CTAs that already resolve", () => {
    expect(HERO.secondaryCta.href).toBe("#lifecycle");
    expect(WHY.secondaryCta.href).toBe("#method");
  });
});

describe("footer (S12)", () => {
  it("carries the approved boilerplate and CTA band", () => {
    expect(FOOTER.ctaHeadline).toBe("Ready when you are.");
    expect(FOOTER.boilerplate).toContain("operators who consult");
    expect(FOOTER.columns.length).toBeGreaterThan(0);
  });
});
