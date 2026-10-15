import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildDraft } from "../builder.ts";
import { googleLead, NOW, ROOFER } from "../fixtures.test-helpers.ts";
import { hlgBusinessTransformationProfile, hscsProfile } from "../hlg-profiles.ts";
import { emptyProfile, normalizeProfile, type BusinessProfile } from "../profile.ts";
import { renderSite } from "../render.ts";
import { premiumContent } from "./content.ts";
import {
  approvePremiumDraft,
  buildPremiumDraft,
  FONT_FILES,
  fontsDir,
  premiumAsset,
  premiumClaimProblems,
  premiumFiles,
  premiumReviews,
  premiumZip,
  premiumZipName,
  PremiumDraftError,
  SITE_PRODUCTS,
  type PremiumDraft,
} from "./draft.ts";
import { PREMIUM_PAGES, renderPremiumPage } from "./render.ts";
import { completenessReport } from "./review.ts";
import {
  contrastPairs,
  contrastRatio,
  PREMIUM_THEMES,
  premiumTheme,
} from "./themes.ts";

let n = 0;
const deps = (previous?: PremiumDraft) => ({
  now: () => NOW,
  newId: () => `p-${++n}`,
  actor: "ceo",
  previous,
});
const build = (p: BusinessProfile, previous?: PremiumDraft) =>
  buildPremiumDraft(p, deps(previous));
const FONTS = fontsDir(path.dirname(new URL(import.meta.url).pathname));
const fontBytes = async (t: string) =>
  (await readFile(path.join(FONTS, premiumTheme(t).display.file))).length +
  (await readFile(path.join(FONTS, premiumTheme(t).body.file))).length;
/** Visible page content (CSS colour codes and the like are not content). */
const body = (h: string) => h.slice(h.indexOf("<body>"));

describe("two site products", () => {
  it("Express Demo and Premium Business Site are distinct, and the Express Demo is unchanged", async () => {
    expect(Object.keys(SITE_PRODUCTS)).toEqual(["express_demo", "premium_site"]);
    // The Express Demo still renders one page from a lead, exactly as Phase 2 did
    // (byte-for-byte golden files in prospect-demo-golden.test.ts).
    const demo = await buildDraft(await googleLead(ROOFER, "contractor"), {
      writer: null,
      now: () => NOW,
      newId: () => "d",
      actor: "op",
      previous: undefined,
    });
    expect(renderSite(demo)).toContain(
      "<strong>Demo website</strong> prepared by Herman Legacy Group",
    );
    expect(demo.mode).toBeUndefined();
  });
});

describe("premium-mode selection and multi-page output", () => {
  it("each profile chooses a theme preset; unknown themes fall back safely", () => {
    expect(build(hlgBusinessTransformationProfile(NOW)).theme).toBe("atelier");
    expect(build(hscsProfile(NOW)).theme).toBe("meridian");
    const p = hscsProfile(NOW);
    p.design = { theme: "nonsense" };
    expect(build(p).theme).toBe("atelier");
    expect(premiumTheme(undefined).key).toBe("atelier");
  });

  it("builds six pages, each a complete document", () => {
    const d = build(hscsProfile(NOW));
    const { pages, css } = premiumFiles(d);
    expect(Object.keys(pages)).toEqual([
      "index.html",
      "services.html",
      "solutions.html",
      "about.html",
      "assessment.html",
      "privacy.html",
    ]);
    for (const h of Object.values(pages)) {
      expect(h.startsWith("<!doctype html>")).toBe(true);
      expect(h).toContain('<link rel="stylesheet" href="assets/site.css">');
    }
    expect(css).toContain("@font-face");
    expect(() =>
      renderPremiumPage(d.content, "nope", { version: 1, prepared: "2026-10-15" }),
    ).toThrow();
  });

  it("shared components never name a business: the same code renders both", () => {
    const a = premiumFiles(build(hlgBusinessTransformationProfile(NOW))).pages[
      "index.html"
    ]!;
    const b = premiumFiles(build(hscsProfile(NOW))).pages["index.html"]!;
    expect(a).not.toContain("Herman Supply Chain");
    expect(b).not.toContain("HLG Business Transformation");
    expect(a).toContain('class="stack"');
    expect(b).toContain('class="route"');
  });
});

describe("privacy, safety and markup", () => {
  const d = build(hlgBusinessTransformationProfile(NOW));
  const pages = Object.entries(premiumFiles(d).pages);

  it("every page: internal-draft banner, noindex, no scripts, disabled forms", () => {
    for (const [f, h] of pages) {
      expect(h, f).toContain("<strong>Internal draft — not published.</strong>");
      expect(h, f).toContain('<meta name="robots" content="noindex, nofollow">');
      expect(h.match(/<script\b[^>]*>/g) ?? [], f).toEqual(
        f === "index.html" ? ['<script type="application/ld+json">'] : [],
      );
      expect(h, f).not.toMatch(/<form[^>]*action=/i);
      expect(h, f).not.toMatch(/type="submit"|<button/i);
    }
    const form = premiumFiles(d).pages["assessment.html"]!;
    expect(form).toContain("<fieldset disabled");
    expect(form).toContain("This form is switched off.");
  });

  it("navigation is safe: only site pages, the verified phone, and verified https links", () => {
    for (const [f, h] of pages)
      for (const m of h.matchAll(/href="([^"]+)"/g))
        expect(m[1], f).toMatch(
          /^(#main|[a-z]+\.html|tel:\+17162207354|assets\/[a-z0-9./-]+)$/,
        );
  });

  it("mobile navigation is a keyboard-operable disclosure listing every page", () => {
    const h = premiumFiles(d).pages["services.html"]!;
    const menu = h.slice(h.indexOf('<details class="menu">'), h.indexOf("</details>"));
    expect(menu).toContain('<summary aria-label="Open the menu">');
    for (const p of [
      "index.html",
      "services.html",
      "solutions.html",
      "about.html",
      "assessment.html",
    ])
      expect(menu).toContain(`href="${p}"`);
    expect(menu).toContain('href="services.html" aria-current="page"');
  });

  it("escapes profile text everywhere", () => {
    const p = hlgBusinessTransformationProfile(NOW);
    p.fields.brandName.value = 'HLG <img src=x onerror=alert(1)> & "Co"';
    p.lists.services.items[0]!.name = "<script>bad()</script>";
    const html = Object.values(premiumFiles(build(p)).pages).join("");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>bad()");
    expect(html).toContain(
      "HLG &lt;img src=x onerror=alert(1)&gt; &amp; &quot;Co&quot;",
    );
  });
});

describe("verified content only", () => {
  it("HLG Business Transformation: approved positioning, CTAs, phone; no email invented", () => {
    const d = build(hlgBusinessTransformationProfile(NOW));
    const h = Object.values(premiumFiles(d).pages).join("");
    expect(h).toContain(
      "HLG Business Transformation helps local and service-based businesses improve their digital presence, customer acquisition and operating systems.",
    );
    expect(h).toContain("Request a Business Transformation Assessment");
    expect(h).toContain("Call HLG");
    expect(h).toContain('href="tel:+17162207354"');
    expect(h).not.toContain("mailto:");
    expect(h).toContain(
      "Planned address: transform.hermanlegacygroup.com (not configured).",
    );
    for (const s of [
      "Digital-presence assessments",
      "Customer communication",
      "Ongoing managed services",
    ])
      expect(h).toContain(s);
  });

  it("HSCS: both approved statements, its own phone, no placeholder number, no invented claims", () => {
    const d = build(hscsProfile(NOW));
    const h = Object.values(premiumFiles(d).pages).map(body).join("");
    expect(h).toContain("Transportation &amp; Operations Consulting Supported by AI");
    expect(h).toContain("35 Years of Operational Experience. Enhanced by AI.");
    expect(h).toContain("(716) 220-7354");
    for (const s of [
      "555",
      "1-800",
      "1994",
      "2.4M",
      "18.3",
      "200+",
      "180M",
      "98.2",
      "info@hermansupplychain",
      "Lowe",
      "Amazon",
      "Sears",
      "<blockquote",
      "What our clients say",
    ])
      expect(h, s).not.toContain(s);
    for (const s of [
      "Operations Assessment",
      "Assess",
      "Analyze",
      "Recommend",
      "Transform",
      "Middle-mile logistics",
    ])
      expect(h).toContain(s);
  });

  it("no planned product is presented as live", () => {
    const h = premiumFiles(build(hlgBusinessTransformationProfile(NOW))).pages[
      "solutions.html"
    ]!;
    for (const name of [
      "TakeoutOS",
      "SalonOS / BarberOS",
      "Contractor Performance System",
    ]) {
      const card = h.slice(h.indexOf(`<h3>${name.replace("/", "/")}`));
      expect(card.slice(0, card.indexOf("</article>"))).toContain(
        'class="status status-planned">Planned',
      );
    }
    for (const name of ["HLG Presence Scanner", "HLG Instant Site Builder"]) {
      const card = h.slice(h.indexOf(`<h3>${name}`));
      expect(card.slice(0, card.indexOf("</article>"))).toContain(
        'class="status status-pilot">Pilot',
      );
    }
    expect(h).not.toContain("Available now</span>");
    expect(h).toContain(
      "<strong>Pilot</strong> — in use in a pilot; not yet offered to customers",
    );
  });

  it("unverified claims never appear; unverified descriptions are flagged To confirm", () => {
    const p = hscsProfile(NOW);
    p.lists.statistics = {
      status: "unverified",
      source: "",
      items: [{ name: "98% on-time", description: "" }],
    };
    p.lists.pillars.status = "unverified";
    p.fields.email = { value: "draft@hscs.example", status: "unverified", source: "" };
    const h = Object.values(premiumFiles(build(p)).pages).join("");
    expect(h).not.toContain("98% on-time");
    expect(h).not.toContain("We measure what we recommend");
    expect(h).not.toContain("draft@hscs.example");
    const bt = premiumFiles(build(hlgBusinessTransformationProfile(NOW))).pages[
      "solutions.html"
    ]!;
    expect(bt).toMatch(
      /Contractors and home services<span class="tbc"[^>]*>To confirm<\/span>/,
    );
  });

  it("the claims check refuses invented prices, guarantees and testimonials", () => {
    const p = hlgBusinessTransformationProfile(NOW);
    p.lists.services.items.push({
      name: "Free audit",
      description: "Guaranteed results from $99",
    });
    expect(() => build(p)).toThrow(PremiumDraftError);
    const c = premiumContent(hscsProfile(NOW));
    c.caseStudies.push({
      name: "Testimonials",
      description: "Rated 5 stars",
      confirmed: true,
    });
    expect(premiumClaimProblems(c).join(" ")).toContain("a rating or review claim");
  });

  it("missing facts show an Information required notice, never invented content", () => {
    const d = build(hscsProfile(NOW));
    const about = premiumFiles(d).pages["about.html"]!;
    expect(about).toContain(
      "Information required:</strong> <span>verified case studies",
    );
    expect(about).toContain("<dt>Email</dt><dd>Information required</dd>");
    expect(premiumFiles(d).pages["privacy.html"]).toContain(
      "Information required:</strong> <span>a privacy policy",
    );
    expect(d.content.missing).toEqual(
      expect.arrayContaining(["Business email", "Privacy policy link"]),
    );
    const bare = emptyProfile("x", "professional_services", NOW);
    bare.fields.brandName = { value: "Bare Co", status: "verified", source: "test" };
    const h = premiumFiles(build(bare)).pages["index.html"]!;
    expect(h).toContain("Information required:</strong> <span>an approved description");
    expect(h).toContain(
      "Information required:</strong> <span>the verified list of services",
    );
  });

  it("refuses to build without a verified brand name; old profiles gain new fields safely", () => {
    expect(() => build(emptyProfile("x", "professional_services", NOW))).toThrow(
      "brand name",
    );
    const old = hscsProfile(NOW) as BusinessProfile & {
      fields: Record<string, unknown>;
    };
    delete (old.fields as Record<string, unknown>)["credibility"];
    expect(normalizeProfile(old).fields.credibility.status).toBe("required");
    expect(() => build(old)).not.toThrow();
  });
});

describe("accessibility and performance reviews", () => {
  it("every theme meets WCAG AA contrast on every pair it uses", () => {
    for (const t of Object.values(PREMIUM_THEMES))
      for (const p of contrastPairs(t))
        expect(contrastRatio(p.fg, p.bg), `${t.key}: ${p.name}`).toBeGreaterThanOrEqual(
          p.min,
        );
  });

  for (const [name, profile] of [
    ["HLG Business Transformation", hlgBusinessTransformationProfile],
    ["HSCS", hscsProfile],
  ] as const) {
    it(`${name}: every accessibility and performance check passes`, async () => {
      const d = build(profile(NOW));
      const theme = d.theme;
      const r = premiumReviews(d, await fontBytes(theme));
      const failed = [...r.accessibility, ...r.performance].filter((c) => !c.ok);
      expect(failed).toEqual([]);
      expect(r.accessibility.length).toBeGreaterThanOrEqual(14);
      expect(r.performance.find((c) => c.id === "page-weight")!.detail).toMatch(
        /= \d+\.\d KB\.$/,
      );
    });
  }

  it("the reviews catch real problems", () => {
    const d = build(hscsProfile(NOW));
    const bad = { ...d, content: { ...d.content, theme: "atelier" } };
    expect(
      premiumReviews(bad, 0).accessibility.find((c) => c.id === "contrast")!.ok,
    ).toBe(true);
    const weakTheme = structuredClone(PREMIUM_THEMES["atelier"]!);
    weakTheme.colors.muted = "#cfcfcf";
    expect(
      contrastPairs(weakTheme).some((p) => contrastRatio(p.fg, p.bg) < p.min),
    ).toBe(true);
  });

  it("completeness report: per page, confirmed vs to-confirm vs missing", () => {
    const rows = completenessReport(
      build(hlgBusinessTransformationProfile(NOW)).content,
    );
    expect(rows.map((r) => r.page)).toEqual(PREMIUM_PAGES.map((p) => p.file));
    const sol = rows.find((r) => r.page === "solutions.html")!;
    expect(sol.toConfirm).toBe(4);
    expect(rows.find((r) => r.page === "privacy.html")!.missing).toEqual([
      "Privacy policy",
    ]);
  });
});

describe("drafts: versions, approval, readiness, export", () => {
  it("rebuilds as the next version, keeps history, approves without publishing", () => {
    const v1 = build(hscsProfile(NOW));
    const v2 = build(hscsProfile(NOW), v1);
    expect(v2.version).toBe(2);
    expect(v2.id).toBe(v1.id);
    expect(v2.audit.map((a) => a.action)).toEqual(["built", "rebuilt"]);
    const ok = approvePremiumDraft(v2, "ceo", NOW);
    expect(ok.status).toBe("approved");
    expect(ok.audit.at(-1)!.detail).toBe(
      "Design approved for internal review purposes. Nothing was published.",
    );
    expect(approvePremiumDraft(ok, "ceo", NOW)).toBe(ok);
  });

  it("launch readiness lists facts, drafted items, decisions and publishing", () => {
    const d = build(hlgBusinessTransformationProfile(NOW));
    const ids = d.checklist.map((c) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "confirm-drafted",
        "design-approval",
        "domain",
        "hosting",
        "form",
        "privacy",
        "reviews",
        "publishing",
      ]),
    );
    expect(d.checklist.find((c) => c.id === "domain")!.task).toContain(
      "transform.hermanlegacygroup.com",
    );
    expect(d.checklist.find((c) => c.id === "publishing")!.owner).toBe("CEO decision");
    expect(d.checklist.find((c) => c.id === "reviews")!.task).toContain(
      "they pass now",
    );
  });

  it("the ZIP holds six pages, the stylesheet, the two fonts and their licences, readiness and a readme", async () => {
    const d = build(hscsProfile(NOW));
    const zip = await premiumZip(
      d,
      async (f) => new Uint8Array(await readFile(path.join(FONTS, f))),
      NOW,
    );
    const text = new TextDecoder("latin1").decode(zip);
    const folder = premiumZipName(d).replace(/\.zip$/, "");
    expect(premiumZipName(d)).toBe(
      "hlg-premium-draft-herman-supply-chain-solutions-v1.zip",
    );
    for (const f of [
      "index.html",
      "services.html",
      "solutions.html",
      "about.html",
      "assessment.html",
      "privacy.html",
      "assets/site.css",
      "assets/fonts/archivo-latin-wght-normal.woff2",
      "assets/fonts/inter-latin-wght-normal.woff2",
      "assets/fonts/OFL-archivo.txt",
      "assets/fonts/OFL-inter.txt",
      "LAUNCH-READINESS.md",
      "README.txt",
    ])
      expect(text, f).toContain(`${folder}/${f}`);
    expect(text).not.toContain("fraunces-latin");
  });

  it("bundled fonts are the licensed files, and the preview serves only known assets", async () => {
    for (const f of FONT_FILES) {
      const lic = new TextDecoder().decode(await readFile(path.join(FONTS, f.licence)));
      expect(lic).toContain("SIL Open Font License");
    }
    const d = build(hscsProfile(NOW));
    expect(premiumAsset(d, "")?.kind).toBe("page");
    expect(premiumAsset(d, "about.html")?.kind).toBe("page");
    expect(premiumAsset(d, "assets/site.css")?.kind).toBe("css");
    expect(premiumAsset(d, "assets/fonts/inter-latin-wght-normal.woff2")?.kind).toBe(
      "font",
    );
    expect(premiumAsset(d, "../../etc/passwd")).toBeUndefined();
    expect(premiumAsset(d, "assets/fonts/../../secret.woff2")).toBeUndefined();
  });
});
