/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return -- tests deliberately build specs that FAIL validation, to prove the renderer is safe anyway */
import { describe, expect, it } from "vitest";
import { contrastRatio, siteSpecSchema, type SiteSpec } from "@hl-bos/sitegen-spec";
import { renderSite } from "./index.ts";
import { TEXT_PAIRS } from "./theme.ts";
import { bareSpec, ctx, typicalSpec, unchecked } from "./fixtures.test-helpers.ts";

const html = (spec: SiteSpec, c = ctx) => renderSite(spec, c).html;
const scripts = (h: string) => [...h.matchAll(/<script\b[^>]*>/gi)].map((m) => m[0]);

describe("structure of the barber template", () => {
  const spec = typicalSpec();
  const h = html(spec);

  it("the fixture is itself a valid spec", () => {
    expect(siteSpecSchema.safeParse(spec).success).toBe(true);
  });
  it("renders header, hero, services, hours, about, gallery, contact, faq and footer in page order", () => {
    const order = [
      '<header class="hdr"',
      'class="hero"',
      'id="services"',
      'id="hours"',
      'id="about"',
      'id="gallery"',
      'id="contact"',
      'id="faq"',
      '<footer class="ftr"',
    ].map((needle) => h.indexOf(needle));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it("shows the logo, the hero image and the h1", () => {
    expect(h).toContain('<img src="https://cdn.example.com/logo.png"');
    expect(h).toContain('class="hero-img" src="https://cdn.example.com/hero.jpg"');
    expect(h).toContain("<h1>Main Street Barbers</h1>");
    expect(h.match(/<h1>/g)).toHaveLength(1);
  });
  it("lists services with a price only where the spec has one", () => {
    expect(h).toContain("Haircut");
    expect(h).toContain(">$30<");
    expect(h).toContain(">$15.50<");
    const hot = h.slice(
      h.indexOf("Hot towel shave"),
      h.indexOf("Hot towel shave") + 60,
    );
    expect(hot).not.toContain("$");
    expect(h).toContain("30 min");
  });
  it("sorts hours Monday first and shows closed days", () => {
    const hours = h.slice(h.indexOf('id="hours"'), h.indexOf('id="about"'));
    expect(hours.indexOf("Monday")).toBeLessThan(hours.indexOf("Tuesday"));
    expect(hours.indexOf("Tuesday")).toBeLessThan(hours.indexOf("Saturday"));
    expect(hours).toContain("Closed");
    expect(hours).toContain("9:00 AM \u2013 6:00 PM");
    expect(hours).not.toContain("Sunday");
  });
  it("contact has Book, Call and Text buttons, Book first when there is a booking link", () => {
    const c = h.slice(h.indexOf('id="contact"'), h.indexOf('id="faq"'));
    expect(c.indexOf("Book now")).toBeGreaterThanOrEqual(0);
    expect(c.indexOf("Book now")).toBeLessThan(c.indexOf("Call (716) 555-0100"));
    expect(c).toContain('href="tel:+17165550100"');
    expect(c).toContain('href="sms:+17165550100"');
    expect(c).toContain('href="https://book.example.com/main-street"');
    expect(c).toContain("12 Main St");
  });
  it("the faq uses native details/summary (no script needed)", () => {
    expect(h).toContain("<details><summary>Do I need an appointment?</summary>");
  });
  it("about text keeps its paragraphs", () => {
    expect(h).toContain("<p>A neighbourhood shop on Main Street.</p>");
    expect(h).toContain("<p>Walk-ins welcome when there is a chair free.</p>");
  });
});

describe("SEO", () => {
  const spec = typicalSpec();
  const r = renderSite(spec, ctx);
  it("has title, description, canonical, viewport and Open Graph tags", () => {
    expect(r.headTags).toContain("<title>Main Street Barbers | Buffalo, NY</title>");
    expect(r.headTags).toContain(
      `<meta name="description" content="${spec.seo.description}"/>`,
    );
    expect(r.headTags).toContain(
      '<link rel="canonical" href="https://main-street.example.com/"/>',
    );
    expect(r.headTags).toContain(
      'name="viewport" content="width=device-width, initial-scale=1"',
    );
    expect(r.headTags).toContain('property="og:title"');
    expect(r.headTags).toContain(
      'property="og:url" content="https://main-street.example.com/"',
    );
    expect(r.headTags).toContain(
      'property="og:image" content="https://cdn.example.com/hero.jpg"',
    );
    expect(r.html.startsWith('<!doctype html><html lang="en"><head>')).toBe(true);
  });
  it("sitemap entries use the canonical origin", () => {
    expect(r.sitemapEntries).toEqual([
      { loc: "https://main-street.example.com/", lastmod: "2026-11-20" },
    ]);
    const { lastModified: _omit, ...noDate } = ctx;
    expect(renderSite(spec, noDate).sitemapEntries).toEqual([
      { loc: "https://main-street.example.com/" },
    ]);
  });
  it("multi-page sites get a nav, per-page canonicals and one sitemap entry each", () => {
    const two = unchecked(spec, (s) =>
      s["pages"].push({
        slug: "faq-page",
        title: "Questions",
        sections: [{ type: "contact" }],
      }),
    );
    const out = renderSite(two, ctx);
    expect(out.pages.map((p) => p.path)).toEqual(["/", "/faq-page"]);
    expect(out.sitemapEntries.map((e) => e.loc)).toEqual([
      "https://main-street.example.com/",
      "https://main-street.example.com/faq-page",
    ]);
    expect(out.pages[1]!.html).toContain(
      'rel="canonical" href="https://main-street.example.com/faq-page"',
    );
    expect(out.pages[1]!.html).toContain('<nav class="nav"');
    expect(h1Count(out.pages[1]!.html)).toBe(0);
  });
  it("JSON-LD is a HairSalon with only facts from the spec", () => {
    const ld = extractLd(r.html);
    expect(ld).toMatchObject({
      "@context": "https://schema.org",
      "@type": "HairSalon",
      name: "Main Street Barbers",
      telephone: "+17165550100",
      url: "https://main-street.example.com/",
      address: {
        "@type": "PostalAddress",
        streetAddress: "12 Main St",
        addressLocality: "Buffalo",
        addressRegion: "NY",
        postalCode: "14201",
      },
    });
    expect(ld["openingHoursSpecification"]).toEqual([
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: "Tuesday",
        opens: "09:00",
        closes: "18:00",
      },
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: "Saturday",
        opens: "08:00",
        closes: "15:00",
      },
    ]);
    const keys = Object.keys(ld).sort();
    expect(keys).toEqual(
      [
        "@context",
        "@type",
        "address",
        "hasOfferCatalog",
        "name",
        "openingHoursSpecification",
        "telephone",
        "url",
      ].sort(),
    );
    expect(JSON.stringify(ld)).not.toMatch(/rating|review|award|founded|priceRange/i);
  });
  it("JSON-LD for a bare spec has no address, hours or services", () => {
    const ld = extractLd(html(bareSpec()));
    expect(Object.keys(ld).sort()).toEqual(
      ["@context", "@type", "name", "telephone", "url"].sort(),
    );
  });
});

describe("missing data degrades gracefully, and nothing is invented", () => {
  it("no hours -> no hours section; no services -> no services section", () => {
    const s = typicalSpec();
    s.profile.hours = [];
    s.profile.services = [];
    const h = html(s);
    expect(h).not.toContain('id="hours"');
    expect(h).not.toContain('id="services"');
  });
  it("no hero image -> themed gradient hero and no <img> for it", () => {
    const h = html(typicalSpec(), { origin: ctx.origin });
    expect(h).toContain('class="hero"');
    expect(h).not.toContain('class="hero-img"');
    expect(h).toContain("linear-gradient(135deg,var(--hero-from),var(--hero-to))");
    expect(h).not.toContain("og:image");
  });
  it("no booking link -> Call and Text only, no Book button", () => {
    const s = typicalSpec();
    delete s.profile.bookingUrl;
    const h = html(s);
    expect(h).not.toContain("Book now");
    expect(h).toContain("Call (716) 555-0100");
    expect(h).toContain("Text us");
  });
  it("a gallery whose images the host did not resolve is omitted", () => {
    const h = html(typicalSpec(), { origin: ctx.origin });
    expect(h).not.toContain('id="gallery"');
  });
  it("a bare spec renders only what it has", () => {
    const h = html(bareSpec(), { origin: ctx.origin });
    expect(h).toContain("<h1>Bare Cuts</h1>");
    for (const absent of [
      'id="services"',
      'id="hours"',
      'id="about"',
      "<address",
      "Book now",
      'class="hero-img"',
    ])
      expect(h, absent).not.toContain(absent);
    // words that would only appear if something were made up
    for (const word of [
      "review",
      "testimonial",
      "award",
      "years",
      "licensed",
      "best",
      "rated",
      "\u2605",
      "$",
    ])
      expect(h.toLowerCase(), word).not.toContain(word);
  });
  it("showPrices:false hides prices", () => {
    const s = typicalSpec();
    s.pages[0]!.sections = [{ type: "services", showPrices: false }];
    expect(html(s)).not.toContain("$30");
  });
});

describe("inert output", () => {
  const evil = `<script>alert(1)</script>`;
  const attack = (s: Record<string, any>) => {
    s["profile"].businessName = `Bad "><img src=x onerror=alert(1)> ${evil}`;
    s["profile"].services = [
      { name: evil, description: `<img src=x onerror=alert(2)>`, priceCents: 100 },
    ];
    s["hero"].headline = evil;
    s["hero"].subheadline = `<svg onload=alert(3)>`;
    s["seo"].title = `</title>${evil}`;
    s["seo"].description = `"><script>alert(4)</script>`;
    s["pages"][0].sections.push({ type: "about", body: `${evil}\n<b onclick=x>` });
  };
  const s = unchecked(typicalSpec(), attack);

  it("the attack spec is refused by the schema (defence one)", () => {
    expect(siteSpecSchema.safeParse(s).success).toBe(false);
  });
  it("and is still inert in the renderer if it ever got through (defence two)", () => {
    const h = html(s);
    expect(scripts(h)).toEqual(['<script type="application/ld+json">']);
    expect(h).not.toContain("<script>alert");
    expect(h).not.toMatch(/<img src=x/);
    expect(h).not.toMatch(/<svg/);
    expect(h).not.toMatch(/<b onclick/);
    expect(h).not.toContain("</title><script>");
    expect(h).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    // no element with an on* attribute anywhere
    expect(withoutQuotedValues(h)).not.toMatch(/<[a-z][^>]*\son[a-z]+\s*=/i);
  });
  it("JSON-LD cannot be broken out of: </script> in a name stays inside the string", () => {
    const h = html(s);
    const block = ldBlock(h);
    expect(block).not.toContain("<");
    expect(block).not.toContain(">");
    expect(block).toContain("\\u003c/script\\u003e");
    const ld = JSON.parse(block) as { name: string };
    expect(ld.name).toContain("</script>");
    expect(h.match(/<\/script>/g)).toHaveLength(1);
  });
  it("unsafe links and asset URLs that bypass validation are dropped, not rendered", () => {
    const x = unchecked(typicalSpec(), (sp) => {
      sp["profile"].bookingUrl = "javascript:alert(1)";
      sp["pages"][0].sections.push({
        type: "contact",
        links: [
          { label: "x", href: "javascript:alert(1)" },
          { label: "y", href: "data:text/html,hi" },
          { label: "ok", href: "https://ok.example.com/" },
        ],
      });
    });
    const h = html(x, {
      origin: ctx.origin,
      assets: {
        heroUrl: "javascript:alert(1)",
        logoUrl: "http://insecure.example.com/l.png",
      },
    });
    expect(h).not.toMatch(/javascript:/i);
    expect(h).not.toContain("data:text");
    expect(h).not.toContain("insecure.example.com");
    expect(h).toContain('href="https://ok.example.com/"');
    expect(h).not.toContain("Book now");
  });
  it("a colour or font that bypassed validation cannot reach the stylesheet", () => {
    const x = unchecked(typicalSpec(), (sp) => {
      sp["theme"].brandColor = "red;} body{display:none";
      sp["theme"].fontBody = "x;} body{display:none";
    });
    const css = html(x).match(/<style>([\s\S]*?)<\/style>/)![1]!;
    expect(css).not.toContain("display:none");
    expect(css).toContain("--brand:#1f2937");
  });
  it("a non-https canonical origin is refused", () => {
    expect(() => renderSite(typicalSpec(), { origin: "http://x.example.com" })).toThrow(
      /https/,
    );
    expect(() => renderSite(typicalSpec(), { origin: "nope" })).toThrow();
  });
});

describe("zero client-side JavaScript, no stray network", () => {
  const h = html(typicalSpec());
  it("the only <script> is one application/ld+json block", () => {
    expect(scripts(h)).toEqual(['<script type="application/ld+json">']);
    expect(h).not.toMatch(/<script[^>]+src=/i);
    expect(withoutQuotedValues(h)).not.toMatch(/\son[a-z]+\s*=/i);
    expect(h).not.toMatch(/<(iframe|object|embed|link rel="stylesheet"|form)/i);
  });
  it("every absolute URL is the origin, a ctx asset, a link from the spec, or the schema.org vocabulary", () => {
    const spec = typicalSpec();
    const allowed = new Set<string>([
      ctx.origin,
      "https://schema.org",
      ...Object.values(ctx.assets!).flatMap((v) =>
        typeof v === "string" ? [v] : Object.values(v),
      ),
      spec.profile.bookingUrl!,
    ]);
    const found = [...h.matchAll(/https?:\/\/[^\s"'<>\\]+/g)].map((m) => m[0]);
    expect(found.length).toBeGreaterThan(0);
    for (const u of found) {
      const ok = [...allowed].some((a) => u === a || u.startsWith(`${ctx.origin}/`));
      expect(ok, u).toBe(true);
    }
    // nothing the browser would fetch automatically points elsewhere
    const fetched = [...h.matchAll(/\ssrc="([^"]+)"/g)].map((m) => m[1]!);
    for (const u of fetched)
      expect(
        Object.values(ctx.assets!).flatMap((v) =>
          typeof v === "string" ? [v] : Object.values(v),
        ),
      ).toContain(u);
  });
  it("is deterministic", () => {
    expect(html(typicalSpec())).toBe(html(typicalSpec()));
  });
});

describe("contrast of everything rendered", () => {
  function tokens(h: string): Record<string, string> {
    const root = /:root\{([^}]*)\}/.exec(h)![1]!;
    const out: Record<string, string> = {};
    for (const decl of root.split(";")) {
      const m = /^(--[a-z-]+):(#[0-9a-f]{6})$/.exec(decl);
      if (m) out[m[1]!] = m[2]!;
    }
    return out;
  }
  let seed = 20261120;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const randHex = () =>
    `#${Math.floor(rnd() * 0x1000000)
      .toString(16)
      .padStart(6, "0")}`;

  it("every text/background pair is >= 4.5:1 for 400 random valid brand and accent colours (plus the extremes)", () => {
    const colors: [string, string][] = [
      ["#000000", "#000000"],
      ["#ffffff", "#ffffff"],
      ["#777777", "#777777"],
      ["#ff0000", "#00ff00"],
      ["#808080", "#7f7f7f"],
      ...Array.from({ length: 400 }, (): [string, string] => [randHex(), randHex()]),
    ];
    let worst = Infinity;
    for (const [brand, accent] of colors) {
      const s = typicalSpec();
      s.theme.brandColor = brand;
      s.theme.accentColor = accent;
      const t = tokens(html(s));
      for (const [fg, bg] of TEXT_PAIRS) {
        const ratio = contrastRatio(t[fg]!, t[bg]!);
        worst = Math.min(worst, ratio);
        expect(ratio, `${fg} on ${bg} for ${brand}/${accent}`).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    }
    expect(worst).toBeGreaterThanOrEqual(4.5);
  });
  it("the pairs in the test are the pairs the stylesheet uses", () => {
    const t = tokens(html(typicalSpec()));
    for (const [fg, bg] of TEXT_PAIRS) {
      expect(t[fg]).toBeDefined();
      expect(t[bg]).toBeDefined();
    }
  });
});

describe("weight", () => {
  it("a typical spec is under 60 KB", () => {
    const bytes = Buffer.byteLength(html(typicalSpec()), "utf8");
    expect(bytes).toBeLessThan(60 * 1024);
    expect(bytes).toBeGreaterThan(1000);
  });
});

// --- helpers -----------------------------------------------------------------
/** Drop "..." attribute values (escaped, so inert) before looking for event-handler attributes. */
function withoutQuotedValues(h: string): string {
  return h.replace(/<style>[\s\S]*?<\/style>/, "").replace(/="[^"]*"/g, '=""');
}
function ldBlock(h: string): string {
  const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(h);
  expect(m).not.toBeNull();
  return m![1]!;
}
function extractLd(h: string): Record<string, unknown> {
  return JSON.parse(ldBlock(h)) as Record<string, unknown>;
}
function h1Count(h: string): number {
  return (h.match(/<h1>/g) ?? []).length;
}
