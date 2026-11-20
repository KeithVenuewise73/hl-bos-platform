import { describe, expect, it } from "vitest";
import { sgSpec } from "./fixtures.test-helpers.ts";
import { siteSpecSchema, validateSpec } from "./schema.ts";

const ok = (v: unknown) => siteSpecSchema.safeParse(v).success;
const clone = <T>(v: T): T => structuredClone(v);

describe("a valid spec", () => {
  it("passes (the same shape the database tests save)", () => {
    expect(ok(sgSpec())).toBe(true);
  });

  it("passes with every section type, a logo, an asset hero and sourced claims", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    const spec = sgSpec("#112233", "+17165550100", 1, {
      theme: {
        brandColor: "#112233",
        accentColor: "#C8A24A",
        fontHeading: "mono_workshop",
        fontBody: "sans_rounded",
        logoAssetId: id,
      },
      hero: {
        headline: "H",
        subheadline: "S",
        choice: { kind: "asset", assetId: id },
      },
      pages: [
        {
          slug: "home",
          title: "Home",
          sections: [
            { type: "hero" },
            { type: "services", showPrices: false },
            { type: "hours" },
            { type: "about", body: "Two\nlines." },
            { type: "gallery", items: [{ assetId: id, alt: "Shop floor" }] },
            {
              type: "contact",
              links: [
                { label: "Map", href: "https://maps.example.com/x" },
                { label: "Text us", href: "sms:+17165550100" },
              ],
            },
            { type: "faq", items: [{ question: "Q?", answer: "A." }] },
          ],
        },
      ],
      claims: [
        {
          kind: "yearsInBusiness",
          value: "25 years",
          source: { type: "intake", field: "yearsInBusiness" },
        },
      ],
    });
    const r = validateSpec(spec);
    expect(r).toMatchObject({ ok: true });
  });
});

describe("each database rule is also refused here", () => {
  it("bad colour", () => {
    expect(ok(sgSpec("#12345"))).toBe(false);
    expect(ok(sgSpec("red"))).toBe(false);
    expect(ok(sgSpec("#11223g"))).toBe(false);
  });
  it("font not on the allowlist (no CSS injection)", () => {
    const s = clone(sgSpec()) as { theme: Record<string, unknown> };
    s.theme["fontBody"] = "Comic Sans; } body{display:none";
    expect(ok(s)).toBe(false);
  });
  it("phone not E.164", () => {
    expect(ok(sgSpec("#112233", "7165550199"))).toBe(false);
    expect(ok(sgSpec("#112233", "+0716555"))).toBe(false);
    expect(ok(sgSpec("#112233", "+1 716 555 0199"))).toBe(false);
  });
  it("31 services (30 is fine)", () => {
    const svc = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ name: `Service ${i}` }));
    const mk = (n: number) =>
      sgSpec("#112233", "+17165550100", 1, {
        profile: {
          businessName: "B",
          phone: "+17165550100",
          services: svc(n),
          hours: [],
        },
      });
    expect(ok(mk(30))).toBe(true);
    expect(ok(mk(31))).toBe(false);
  });
  it("service name over 80 characters", () => {
    const s = sgSpec("#112233", "+17165550100", 1, {
      profile: {
        businessName: "B",
        phone: "+17165550100",
        services: [{ name: "x".repeat(81) }],
        hours: [],
      },
    });
    expect(ok(s)).toBe(false);
  });
  it("business name empty or over 120", () => {
    const mk = (n: string) =>
      sgSpec("#112233", "+17165550100", 1, {
        profile: { businessName: n, phone: "+17165550100", services: [], hours: [] },
      });
    expect(ok(mk("   "))).toBe(false);
    expect(ok(mk("x".repeat(121)))).toBe(false);
    expect(ok(mk("x".repeat(120)))).toBe(true);
  });
  it("more than 7 hours entries", () => {
    const day = (d: string) => ({ day: d, closed: true });
    const s = sgSpec("#112233", "+17165550100", 1, {
      profile: {
        businessName: "B",
        phone: "+17165550100",
        services: [],
        hours: ["mon", "tue", "wed", "thu", "fri", "sat", "sun", "mon"].map(day),
      },
    });
    expect(ok(s)).toBe(false);
  });
  it("claim without a source, or with a bad source", () => {
    const claim = (c: unknown) => sgSpec("#112233", "+17165550100", 1, { claims: [c] });
    expect(ok(claim({ kind: "yearsInBusiness", value: "25 years" }))).toBe(false);
    expect(
      ok(
        claim({
          kind: "yearsInBusiness",
          value: "25 years",
          source: { type: "ai", field: "x" },
        }),
      ),
    ).toBe(false);
    expect(
      ok(
        claim({
          kind: "yearsInBusiness",
          value: "25 years",
          source: { type: "intake", field: "  " },
        }),
      ),
    ).toBe(false);
    expect(
      ok(
        claim({
          kind: "yearsInBusiness",
          value: "25 years",
          source: { type: "intake", field: "yearsInBusiness" },
        }),
      ),
    ).toBe(true);
  });
  it("wrong specVersion", () => {
    expect(ok(sgSpec("#112233", "+17165550100", 1, { specVersion: 2 }))).toBe(false);
    expect(ok(sgSpec("#112233", "+17165550100", 1, { specVersion: "1" }))).toBe(false);
  });
  it("unknown top-level key, theme key or hero key", () => {
    expect(ok(sgSpec("#112233", "+17165550100", 1, { extra: "added" }))).toBe(false);
    const s = clone(sgSpec()) as { theme: Record<string, unknown> };
    s.theme["customCss"] = "body{}";
    expect(ok(s)).toBe(false);
    expect(
      ok(
        sgSpec("#112233", "+17165550100", 1, {
          hero: {
            headline: "H",
            subheadline: "",
            choice: { kind: "default" },
            html: "x",
          },
        }),
      ),
    ).toBe(false);
  });
  it("logo that is not a uuid", () => {
    const s = clone(sgSpec()) as { theme: Record<string, unknown> };
    s.theme["logoAssetId"] = "not-a-uuid";
    expect(ok(s)).toBe(false);
  });
  it("hero choice kinds", () => {
    const h = (choice: unknown) =>
      sgSpec("#112233", "+17165550100", 1, {
        hero: { headline: "H", subheadline: "", choice },
      });
    expect(ok(h({ kind: "library", key: "barber_pole" }))).toBe(true);
    expect(ok(h({ kind: "library" }))).toBe(false);
    expect(ok(h({ kind: "asset", assetId: "nope" }))).toBe(false);
    expect(ok(h({ kind: "remote", url: "https://x.example" }))).toBe(false);
  });
});

describe("no raw HTML, only safe links", () => {
  const withSection = (section: unknown) =>
    sgSpec("#112233", "+17165550100", 1, {
      pages: [{ slug: "home", title: "Home", sections: [section] }],
    });

  it("html in text fields is refused everywhere", () => {
    expect(ok(withSection({ type: "about", body: "<b>hi</b>" }))).toBe(false);
    expect(ok(withSection({ type: "about", body: "fine" }))).toBe(true);
    expect(ok(withSection({ type: "services", heading: "<script>x()</script>" }))).toBe(
      false,
    );
    expect(
      ok(withSection({ type: "faq", items: [{ question: "q", answer: "a > b" }] })),
    ).toBe(false);
    const biz = sgSpec("#112233", "+17165550100", 1, {
      profile: {
        businessName: "<img src=x onerror=alert(1)>",
        phone: "+17165550100",
        services: [],
        hours: [],
      },
    });
    expect(ok(biz)).toBe(false);
    expect(
      ok(
        sgSpec("#112233", "+17165550100", 1, {
          seo: { title: "t", description: "<i>d</i>" },
        }),
      ),
    ).toBe(false);
  });

  it("control characters are refused; newlines only where multiline", () => {
    expect(ok(withSection({ type: "about", body: "a\u0000b" }))).toBe(false);
    expect(ok(withSection({ type: "about", body: "a\nb" }))).toBe(true);
    expect(ok(withSection({ type: "services", heading: "a\nb" }))).toBe(false);
  });

  const link = (href: string) =>
    withSection({ type: "contact", links: [{ label: "L", href }] });
  it("javascript:, data:, http:, mailto: and protocol-relative links are refused", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,<b>",
      "http://example.com",
      "mailto:a@b.co",
      "//example.com",
      "https://",
      "tel:7165550100",
    ])
      expect(ok(link(bad)), bad).toBe(false);
  });
  it("https:, tel: and sms: links are accepted", () => {
    for (const good of [
      "https://example.com/a?b=1",
      "tel:+17165550100",
      "sms:+17165550100",
    ])
      expect(ok(link(good)), good).toBe(true);
  });
  it("booking URL must be https", () => {
    const b = (u: string) =>
      sgSpec("#112233", "+17165550100", 1, {
        profile: {
          businessName: "B",
          phone: "+17165550100",
          services: [],
          hours: [],
          bookingUrl: u,
        },
      });
    expect(ok(b("https://book.example.com"))).toBe(true);
    expect(ok(b("http://book.example.com"))).toBe(false);
    expect(ok(b("tel:+17165550100"))).toBe(false);
  });
});

describe("structure", () => {
  it("has no testimonial, review or award section type", () => {
    for (const type of ["testimonials", "testimonial", "reviews", "review", "awards"]) {
      const s = sgSpec("#112233", "+17165550100", 1, {
        pages: [{ slug: "home", title: "Home", sections: [{ type, items: [] }] }],
      });
      expect(ok(s), type).toBe(false);
    }
  });
  it("section objects are strict", () => {
    const s = sgSpec("#112233", "+17165550100", 1, {
      pages: [
        { slug: "home", title: "Home", sections: [{ type: "hours", html: "x" }] },
      ],
    });
    expect(ok(s)).toBe(false);
  });
  it("page slugs are unique and url-safe", () => {
    const pg = (slug: string) => ({ slug, title: "T", sections: [] });
    expect(
      ok(sgSpec("#112233", "+17165550100", 1, { pages: [pg("a"), pg("a")] })),
    ).toBe(false);
    expect(ok(sgSpec("#112233", "+17165550100", 1, { pages: [pg("../x")] }))).toBe(
      false,
    );
    expect(ok(sgSpec("#112233", "+17165550100", 1, { pages: [pg("Home")] }))).toBe(
      false,
    );
  });
  it("hours: closed days carry no times; open days need both, in order", () => {
    const h = (e: unknown) =>
      sgSpec("#112233", "+17165550100", 1, {
        profile: { businessName: "B", phone: "+17165550100", services: [], hours: [e] },
      });
    expect(ok(h({ day: "mon", closed: true }))).toBe(true);
    expect(ok(h({ day: "mon", closed: true, open: "09:00", close: "17:00" }))).toBe(
      false,
    );
    expect(ok(h({ day: "mon", open: "09:00" }))).toBe(false);
    expect(ok(h({ day: "mon", open: "18:00", close: "09:00" }))).toBe(false);
    expect(ok(h({ day: "mon", open: "9:00", close: "17:00" }))).toBe(false);
    expect(ok(h({ day: "mon", open: "09:00", close: "17:00" }))).toBe(true);
  });
  it("validateSpec reports readable problems", () => {
    const r = validateSpec(sgSpec("nope"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join("\n")).toContain("theme.brandColor");
  });
});
