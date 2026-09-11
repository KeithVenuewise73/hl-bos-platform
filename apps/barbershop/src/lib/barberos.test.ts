import { describe, it, expect } from "vitest";
import {
  missingBeforePublish,
  money,
  toCents,
  toShop,
  toShops,
  toSite,
  toStatus,
  type SiteContent,
} from "./barberos";

const SHOP = {
  tenant_id: "11111111-1111-1111-1111-111111111111",
  tenant_slug: "truth-barbershop",
  shop_name: "Truth Barbershop",
  chair_count: 3,
  timezone: "America/New_York",
  capabilities: ["owned_website"],
  site: { slug: "truth-barbershop", status: "published" },
  can: { read_shop: true, edit_page: true, publish: true, manage_shop: false },
};

const SITE: SiteContent = {
  slug: "truth-barbershop",
  status: "draft",
  shopName: "Truth Barbershop",
  headline: "Sharp cuts since 1998",
  about: null,
  phone: "716-939-3443",
  addressLine1: "2401 Seneca St",
  locality: "West Seneca",
  region: "NY",
  postalCode: "14210",
  mapUrl: null,
  bookingUrl: null,
  publishedAt: null,
  hours: [{ day: 2, closed: false, opens: "09:00", closes: "18:00" }],
  services: [],
  links: [],
};

describe("a permission we do not recognise is not a permission", () => {
  it("reads the real ones", () => {
    const s = toShop(SHOP)!;
    expect(s.can.editPage).toBe(true);
    expect(s.can.manageShop).toBe(false);
  });

  it("treats anything that is not exactly true as false", () => {
    // The app draws its buttons from this. Being wrong in this direction hides
    // a button from someone entitled to it; the other way shows a button that
    // fails when pressed, which is the failure the honesty rules name.
    for (const v of ["true", 1, "yes", {}, null, undefined]) {
      const s = toShop({ ...SHOP, can: { edit_page: v, publish: v } })!;
      expect(s.can.editPage).toBe(false);
      expect(s.can.publish).toBe(false);
    }
  });

  it("grants nothing at all when the permissions block is missing", () => {
    const s = toShop({ ...SHOP, can: undefined })!;
    expect(Object.values(s.can).every((v) => v === false)).toBe(true);
  });
});

describe("a page status we do not recognise is a draft", () => {
  it("reads the real ones", () => {
    expect(toStatus("published")).toBe("published");
    expect(toStatus("unpublished")).toBe("unpublished");
    expect(toStatus("draft")).toBe("draft");
  });

  it("falls back to draft, never to published", () => {
    // Telling a shop its page is live when it is not is the expensive mistake:
    // they find out from a customer who could not find them.
    for (const v of ["live", "", null, 7, undefined]) expect(toStatus(v)).toBe("draft");
  });
});

describe("a shop with no page is not a shop with a blank page", () => {
  it("reports no page as null", () => {
    expect(toShop({ ...SHOP, site: null })!.site).toBeNull();
  });

  it("refuses to call a site block with no slug a page", () => {
    // It would otherwise render a "published" badge for something that does
    // not exist.
    expect(toShop({ ...SHOP, site: { status: "published" } })!.site).toBeNull();
  });

  it("carries a real page through", () => {
    expect(toShop(SHOP)!.site).toEqual({
      slug: "truth-barbershop",
      status: "published",
    });
  });
});

describe("reading the shop list", () => {
  it("drops an entry with no tenant rather than inventing one", () => {
    expect(toShops([SHOP, { shop_name: "Nameless" }, null, "nonsense"])).toHaveLength(
      1,
    );
  });

  it("copes with no shops at all", () => {
    expect(toShops(null)).toEqual([]);
    expect(toShops([])).toEqual([]);
  });

  it("keeps the capabilities actually switched on", () => {
    expect(toShop(SHOP)!.capabilities).toEqual(["owned_website"]);
    expect(toShop({ ...SHOP, capabilities: [] })!.capabilities).toEqual([]);
  });
});

describe("reading the page", () => {
  it("maps every field the editor writes", () => {
    const s = toSite({
      slug: "x",
      status: "draft",
      headline: "H",
      phone: "p",
      address_line1: "a",
      hours: [{ day: 2, closed: false, opens: "09:00", closes: "18:00" }],
      services: [{ name: "Skin fade", price_cents: 3500, duration_minutes: 45 }],
      links: [{ kind: "instagram", url: "https://x.test" }],
    })!;
    expect(s.addressLine1).toBe("a");
    expect(s.hours[0]!.opens).toBe("09:00");
    expect(s.services[0]!.priceCents).toBe(3500);
    expect(s.links[0]!.kind).toBe("instagram");
  });

  it("is null when there is no page, not an empty one", () => {
    expect(toSite(null)).toBeNull();
    expect(toSite({ status: "draft" })).toBeNull();
  });

  it("drops a malformed service rather than showing a nameless line", () => {
    const s = toSite({ slug: "x", services: [{ price_cents: 100 }, { name: "Cut" }] })!;
    expect(s.services.map((x) => x.name)).toEqual(["Cut"]);
  });

  it("keeps an unpriced service as unpriced rather than free", () => {
    const s = toSite({ slug: "x", services: [{ name: "Consultation" }] })!;
    expect(s.services[0]!.priceCents).toBeNull();
  });

  it("drops a link with no url", () => {
    const s = toSite({ slug: "x", links: [{ kind: "yelp" }] })!;
    expect(s.links).toHaveLength(0);
  });
});

describe("what still has to be filled in before publishing", () => {
  it("says nothing is missing when nothing is", () => {
    expect(missingBeforePublish(SITE)).toEqual([]);
  });

  it("names a missing address", () => {
    expect(missingBeforePublish({ ...SITE, addressLine1: null })).toContain(
      "a street address",
    );
  });

  it("accepts a booking link in place of a phone number", () => {
    const noPhone = { ...SITE, phone: null };
    expect(missingBeforePublish(noPhone)).toContain("a phone number or a booking link");
    expect(
      missingBeforePublish({ ...noPhone, bookingUrl: "https://booksy.test" }),
    ).toEqual([]);
  });

  it("requires at least one stated day", () => {
    expect(missingBeforePublish({ ...SITE, hours: [] })).toContain(
      "opening hours for at least one day",
    );
  });

  it("says the page itself is missing when there is no page", () => {
    expect(missingBeforePublish(null)).toEqual(["the page itself"]);
  });
});

describe("money", () => {
  it("never renders an unpriced service as free", () => {
    expect(money(null)).toBeNull();
    expect(money(3500)).toBe("$35.00");
    expect(money(0)).toBe("$0.00");
  });

  it("reads what a barber types", () => {
    expect(toCents("35")).toBe(3500);
    expect(toCents("$35.50")).toBe(3550);
    expect(toCents(" 35.5 ")).toBe(3550);
  });

  it("refuses nonsense rather than storing zero", () => {
    // A price of $0.00 on a public page because somebody typed "ask" is worse
    // than no price at all.
    for (const v of ["ask", "", "35.555", "-5", "1,200"]) expect(toCents(v)).toBeNull();
  });
});
