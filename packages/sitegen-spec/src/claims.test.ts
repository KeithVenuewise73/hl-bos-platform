import { describe, expect, it } from "vitest";
import { findUnsupportedClaims } from "./claims.ts";
import { defaultSpec } from "./default-spec.ts";
import { intake } from "./fixtures.test-helpers.ts";
import type { SiteSpec } from "./schema.ts";

const base = defaultSpec("barber", intake);
const withAbout = (body: string): SiteSpec => ({
  ...base,
  pages: [{ slug: "home", title: "Home", sections: [{ type: "about", body }] }],
});

describe("findUnsupportedClaims", () => {
  it("finds nothing in a facts-only starter spec", () => {
    expect(findUnsupportedClaims(base, intake)).toEqual([]);
  });

  it("flags years in business, awards, ratings and testimonials not in the intake", () => {
    const body =
      "Serving Buffalo for 25 years. Award-winning cuts, 5-star rated, see our testimonials.";
    const cats = findUnsupportedClaims(withAbout(body), intake).map((f) => f.category);
    expect(cats).toEqual(
      expect.arrayContaining(["history", "award", "rating", "testimonial"]),
    );
  });

  it("accepts a claim the intake backs, and flags a different number", () => {
    const withYears = { ...intake, yearsInBusiness: 12 };
    expect(findUnsupportedClaims(withAbout("Open for 12 years."), withYears)).toEqual(
      [],
    );
    const wrong = findUnsupportedClaims(withAbout("Open for 25 years."), withYears);
    expect(wrong).toHaveLength(1);
    expect(wrong[0]?.reason).toContain("25");
  });

  it("flags a declared claim whose intake field is missing", () => {
    const spec: SiteSpec = {
      ...base,
      claims: [
        {
          kind: "yearsInBusiness",
          value: "25 years",
          source: { type: "intake", field: "yearsInBusiness" },
        },
      ],
    };
    const f = findUnsupportedClaims(spec, intake);
    expect(f).toHaveLength(1);
    expect(f[0]?.where).toBe("claims[0]");
    expect(f[0]?.reason).toContain("does not have");
  });

  it("passes a declared claim that matches its intake field", () => {
    const spec: SiteSpec = {
      ...base,
      claims: [
        {
          kind: "yearsInBusiness",
          value: "25 years",
          source: { type: "intake", field: "yearsInBusiness" },
        },
      ],
    };
    expect(findUnsupportedClaims(spec, { ...intake, yearsInBusiness: "25" })).toEqual(
      [],
    );
  });

  it("lists user-sourced claims for review (intake cannot back them)", () => {
    const spec: SiteSpec = {
      ...base,
      claims: [
        {
          kind: "award",
          value: "Best of Buffalo",
          source: { type: "user", field: "award" },
        },
      ],
    };
    expect(findUnsupportedClaims(spec, intake)[0]?.reason).toContain(
      "stated by the site owner",
    );
  });

  it("flags a stray number that is not the business's own", () => {
    const f = findUnsupportedClaims(withAbout("Walk-ins until 4000 clients."), intake);
    expect(f.map((x) => x.category)).toContain("number");
  });

  it("does not flag the business's own phone, address or hours numbers", () => {
    expect(
      findUnsupportedClaims(
        withAbout("Visit us at 12 Main St, call (716) 555-0100."),
        intake,
      ),
    ).toEqual([]);
  });
});
