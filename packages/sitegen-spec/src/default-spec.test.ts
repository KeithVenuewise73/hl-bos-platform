import { describe, expect, it } from "vitest";
import { defaultSpec } from "./default-spec.ts";
import { intake } from "./fixtures.test-helpers.ts";
import { siteSpecSchema } from "./schema.ts";
import { VERTICALS, resolveCta } from "./verticals.ts";

describe("defaultSpec('barber', intake)", () => {
  const spec = defaultSpec("barber", intake);

  it("is a valid spec", () => {
    expect(siteSpecSchema.safeParse(spec).success).toBe(true);
    expect(spec.vertical).toBe("barber");
  });
  it("carries the intake facts and nothing else", () => {
    expect(spec.profile.businessName).toBe("Main Street Barbers");
    expect(spec.profile.phone).toBe("+17165550100");
    expect(spec.profile.services.map((s) => s.name)).toEqual(["Haircut", "Beard trim"]);
    expect(spec.profile.services[1]).toEqual({ name: "Beard trim" });
    expect(spec.profile.hours).toHaveLength(3);
    expect(spec.profile.address?.city).toBe("Buffalo");
    expect(spec.profile.bookingUrl).toBe("https://book.example.com/main-street");
    expect(spec.hero.subheadline).toBe("Buffalo, NY");
  });
  it("invents no claims, reviews or testimonials", () => {
    expect(spec.claims).toBeUndefined();
    const json = JSON.stringify(spec).toLowerCase();
    for (const word of [
      "review",
      "testimonial",
      "award",
      "years",
      "best",
      "rated",
      "star",
    ])
      expect(json, word).not.toContain(word);
    const types = spec.pages.flatMap((p) => p.sections.map((s) => s.type));
    expect(types).toEqual(["hero", "services", "hours", "contact"]);
  });
  it("leaves missing optional intake absent, and drops the sections that need it", () => {
    const bare = defaultSpec("barber", {
      businessName: "Bare Cuts",
      phone: "+17165550100",
    });
    expect(bare.profile).toEqual({
      businessName: "Bare Cuts",
      phone: "+17165550100",
      services: [],
      hours: [],
    });
    expect("address" in bare.profile).toBe(false);
    expect("bookingUrl" in bare.profile).toBe(false);
    expect(bare.pages[0]?.sections.map((s) => s.type)).toEqual(["hero", "contact"]);
    expect(bare.hero.subheadline).toBe("");
    expect(bare.seo.title).toBe("Bare Cuts");
  });
  it("uses the owner's own about text verbatim, when given", () => {
    const s = defaultSpec("barber", { ...intake, about: "We cut hair." });
    expect(s.pages[0]?.sections.find((x) => x.type === "about")).toEqual({
      type: "about",
      body: "We cut hair.",
    });
  });
  it("refuses an invalid intake loudly instead of producing a bad spec", () => {
    expect(() => defaultSpec("barber", { ...intake, phone: "7165550100" })).toThrow();
  });
});

describe("VERTICALS.barber", () => {
  const v = VERTICALS.barber;
  it("is configured as data", () => {
    expect(v.schemaOrgType).toBe("HairSalon");
    expect(v.defaultCta).toBe("book");
    expect(v.ctaFallback).toBe("call");
    expect(v.requiredIntake).toEqual(["businessName", "phone"]);
    expect(v.defaultPages[0]?.sections).toContain("hero");
  });
  it("offers no testimonial/review/award sections", () => {
    expect([...v.sections].join(",")).not.toMatch(/testimonial|review|award/);
  });
  it("default CTA is book, falling back to call without a booking link", () => {
    expect(resolveCta(defaultSpec("barber", intake))).toBe("book");
    expect(
      resolveCta(defaultSpec("barber", { businessName: "B", phone: "+17165550100" })),
    ).toBe("call");
  });
});
