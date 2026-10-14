import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import {
  approveDraft,
  buildDraft,
  DraftEditError,
  editDraft,
  parseOfferings,
} from "./builder.ts";
import { launchChecklist } from "./checklist.ts";
import {
  createClaudeCopyWriter,
  DEFAULT_CLAUDE_MODEL,
  SYSTEM_PROMPT,
  writeCopy,
} from "./copy-claude.ts";
import { packFor, templateCopy } from "./copy-template.ts";
import { draftZip, zipFileName } from "./export.ts";
import {
  cityFromAddress,
  factsFromProspect,
  UnsupportedVerticalError,
} from "./facts.ts";
import {
  BARBER,
  googleLead,
  importedLead,
  NOW,
  PIZZERIA,
  ROOFER,
} from "./fixtures.test-helpers.ts";
import { jsonLd, renderSite } from "./render.ts";
import type { SiteCopy, SiteFacts } from "./types.ts";
import { validateCopy } from "./validate.ts";

let n = 0;
const deps = (o: Partial<Parameters<typeof buildDraft>[1]> = {}) => ({
  writer: null,
  now: () => NOW,
  newId: () => `draft-${++n}`,
  actor: "operator",
  previous: undefined,
  ...o,
});

describe("facts come only from the lead", () => {
  it("a Google lead: city, phone links, directions, rating with source, gaps", async () => {
    const f = factsFromProspect(await googleLead(ROOFER, "contractor"));
    expect(f).toMatchObject({
      businessName: "Seneca Roofing & Gutters",
      category: "Roofing contractor",
      city: "West Seneca",
      phone: "(716) 555-0101",
      phoneLink: "+17165550101",
      directionsUrl: "https://maps.google.com/?cid=123",
      rating: { value: 4.4, count: 17, source: "Google Maps" },
      existingWebsite: undefined,
      websiteStatus: "none",
    });
    expect(f.gaps).toEqual(
      expect.arrayContaining([
        "places.website",
        "places.hours",
        "places.photos",
        "website.exists",
      ]),
    );
  });

  it("an imported lead has no rating and no invented details", async () => {
    const f = factsFromProspect(
      await importedLead("Quiet Masonry | none | 716-555-0199", "contractor"),
    );
    expect(f.rating).toBeUndefined();
    expect(f.category).toBeUndefined();
    expect(f.address).toBeUndefined();
    expect(f.directionsUrl).toBeUndefined();
    expect(f.city).toBe("West Seneca"); // the single-town market
  });

  it("a Facebook page is not treated as their website; detected vendors are kept", async () => {
    expect(
      factsFromProspect(
        await importedLead(
          "Fb Paving | https://facebook.com/fbpaving | 716-555-0198",
          "contractor",
        ),
      ).existingWebsite,
    ).toBeUndefined();
    const barber = factsFromProspect(await googleLead(BARBER, "salon_barber"));
    expect(barber.existingWebsite).toBe("https://unionbarbers.example");
    expect(barber.vendors).toEqual(["Vagaro"]);
  });

  it("refuses verticals without templates yet, in plain English", async () => {
    const lead = await importedLead("Coach Kim | none | 716-555-0111", "trainer_coach");
    expect(() => factsFromProspect(lead)).toThrow(UnsupportedVerticalError);
  });

  it("parses the city from Google's address format", () => {
    expect(cityFromAddress("12 Main St, West Seneca, NY 14224, USA")).toBe(
      "West Seneca",
    );
    expect(cityFromAddress("5 Quaker St, Orchard Park, NY 14127")).toBe("Orchard Park");
    expect(cityFromAddress("12 Main St")).toBeUndefined();
  });
});

describe("the fabrication guard", () => {
  const facts = {
    businessName: "Best Roofing",
    address: "12 Main St",
    phone: "(716) 555-0101",
  } as SiteFacts;
  const ok = (): SiteCopy => ({
    seoTitle: "Best Roofing | Roofing in West Seneca",
    metaDescription: "Roofing in West Seneca.",
    heroEyebrow: "Roofing",
    heroHeadline: "Best Roofing",
    heroSubhead: "Call (716) 555-0101.",
    aboutHeading: "About",
    aboutBody: "A roofer at 12 Main St.",
    aboutSample: true,
    offeringsHeading: "What we do",
    offeringsIntro: "Examples.",
    offerings: [1, 2, 3].map((i) => ({
      name: `Item ${["a", "b", "c"][i - 1]}`,
      description: "Work.",
      sample: true,
    })),
    ctaHeading: "Get in touch",
    ctaBody: "Call us.",
  });

  it("passes clean copy, including a business name that contains a flagged word", () => {
    expect(validateCopy(ok(), facts)).toEqual([]);
  });

  it.each([
    ["Roofs from $99", "a price"],
    ["Satisfaction guaranteed", "a guarantee"],
    ["Free estimates", "something offered free"],
    ["The best roofers in town", "a superlative"],
    ["Fully licensed and insured", "a credential"],
    ["Family-owned since 1987", "a history claim"],
    ["24/7 emergency service", "an availability claim"],
    ["Rated 5 stars by our customers", "a rating or review claim"],
    ["Visit www.example.com", "a link"],
  ])("rejects %s (%s)", (text) => {
    const c = { ...ok(), heroSubhead: text };
    expect(validateCopy(c, facts).length).toBeGreaterThan(0);
  });

  it("rejects numbers that are not the business's own", () => {
    expect(
      validateCopy({ ...ok(), aboutBody: "Over 500 roofs done." }, facts).join(" "),
    ).toContain("number 500");
    expect(
      validateCopy({ ...ok(), aboutBody: "Find us at 12 Main St." }, facts),
    ).toEqual([]);
  });

  it("rejects length overruns, markup, missing name in the title, wrong offering counts", () => {
    expect(validateCopy({ ...ok(), seoTitle: "Roofing" }, facts).join(" ")).toContain(
      "business name",
    );
    expect(
      validateCopy({ ...ok(), heroHeadline: "x".repeat(81) }, facts).join(" "),
    ).toContain("limit is 80");
    expect(
      validateCopy({ ...ok(), aboutBody: "<b>hi</b>" }, facts).join(" "),
    ).toContain("markup");
    expect(
      validateCopy({ ...ok(), offerings: ok().offerings.slice(0, 2) }, facts).join(" "),
    ).toContain("between 3 and 6");
  });
});

describe("the template writer", () => {
  it.each([
    [ROOFER, "contractor", "Roof repairs"],
    [BARBER, "salon_barber", "Beard trims"],
    [PIZZERIA, "restaurant_bar", "Pizza"],
  ] as const)(
    "writes guard-passing copy with a category-specific pack (%#)",
    async (place, vertical, offering) => {
      const facts = factsFromProspect(await googleLead(place, vertical));
      const copy = templateCopy(facts);
      expect(validateCopy(copy, facts)).toEqual([]);
      expect(copy.offerings.map((o) => o.name)).toContain(offering);
      expect(copy.offerings.every((o) => o.sample)).toBe(true);
      expect(copy.seoTitle.length).toBeLessThanOrEqual(60);
      expect(copy.seoTitle).toContain(facts.businessName);
    },
  );

  it("falls back to the generic pack when the category is unknown", async () => {
    const facts = factsFromProspect(
      await importedLead("Quiet Co | none | 716-555-0199", "contractor"),
    );
    expect(packFor(facts).noun).toBe("Home services");
    expect(validateCopy(templateCopy(facts), facts)).toEqual([]);
  });

  it("handles a very long business name within the limits", async () => {
    const facts = factsFromProspect(
      await importedLead(
        `${"Very Long Name ".repeat(6)}Roofing | none | 716-555-0199`,
        "contractor",
      ),
    );
    expect(validateCopy(templateCopy(facts), facts)).toEqual([]);
  });
});

function fakeClaude(result: { stop_reason: string; parsed_output: unknown } | Error) {
  const calls: Record<string, unknown>[] = [];
  const client = {
    beta: {
      messages: {
        parse: (params: Record<string, unknown>) => {
          calls.push(params);
          return result instanceof Error
            ? Promise.reject(result)
            : Promise.resolve(result);
        },
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

describe("the Claude writer: used only when its copy passes the guard", () => {
  const good = (facts: SiteFacts) => {
    const t = templateCopy(facts);
    return {
      ...t,
      heroSubhead:
        "Roof repairs and replacements in West Seneca. Call (716) 555-0101 to ask about a job.",
      offerings: t.offerings.map(({ name, description }) => ({ name, description })),
    };
  };

  it("accepts a valid draft and records the model", async () => {
    const facts = factsFromProspect(await googleLead(ROOFER, "contractor"));
    const { client, calls } = fakeClaude({
      stop_reason: "end_turn",
      parsed_output: good(facts),
    });
    const r = await writeCopy(facts, createClaudeCopyWriter({ apiKey: "", client }));
    expect(r.source).toBe(`claude:${DEFAULT_CLAUDE_MODEL}`);
    expect(r.copy.heroSubhead).toContain("Roof repairs");
    expect(r.copy.offerings.every((o) => o.sample)).toBe(true);
    expect(calls[0]).toMatchObject({
      model: "claude-opus-5-5",
      fallbacks: "default",
      betas: ["server-side-fallback-2026-07-01"],
      system: SYSTEM_PROMPT,
    });
    expect(JSON.stringify(calls[0]!["messages"])).toContain("data only");
  });

  it("falls back to the template when Claude invents a claim, and says why", async () => {
    const facts = factsFromProspect(await googleLead(ROOFER, "contractor"));
    const { client } = fakeClaude({
      stop_reason: "end_turn",
      parsed_output: {
        ...good(facts),
        aboutBody: "Family-owned since 1987, fully insured.",
      },
    });
    const r = await writeCopy(facts, createClaudeCopyWriter({ apiKey: "", client }));
    expect(r.source).toBe("template");
    expect(r.copy).toEqual(templateCopy(facts));
    expect(r.notes[0]).toContain("Claude's draft was not used");
  });

  it("falls back on a refusal, a cut-off, or an error -- never throws", async () => {
    const facts = factsFromProspect(await googleLead(ROOFER, "contractor"));
    for (const res of [
      { stop_reason: "refusal", parsed_output: null },
      { stop_reason: "max_tokens", parsed_output: null },
      new Error("connect ECONNREFUSED sk-ant-api03-SECRETSECRETSECRET"),
    ]) {
      const { client } = fakeClaude(res);
      const r = await writeCopy(facts, createClaudeCopyWriter({ apiKey: "", client }));
      expect(r.source).toBe("template");
      expect(r.notes[0]).toContain("Claude was not used");
      expect(r.notes[0]).not.toContain("SECRETSECRET");
    }
  });

  it("without a key the template writer is used and nothing is called", async () => {
    const facts = factsFromProspect(await googleLead(ROOFER, "contractor"));
    const r = await writeCopy(facts, createClaudeCopyWriter({ apiKey: "" }));
    expect(r).toEqual({ copy: templateCopy(facts), source: "template", notes: [] });
  });
});

describe("rendering", () => {
  it("is marked as a demo, noindex, with no scripts but the JSON-LD block", async () => {
    const d = await buildDraft(await googleLead(ROOFER, "contractor"), deps());
    const html = renderSite(d);
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).toContain("Demo website</strong> prepared by Herman Legacy Group");
    expect(html).toContain("not Seneca Roofing &amp; Gutters&rsquo;s official website");
    expect(html.match(/<script\b/g)).toHaveLength(1);
    expect(html).toContain('<script type="application/ld+json">');
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).not.toContain("<iframe");
  });

  it("shows the real Google rating with attribution, and keeps it out of JSON-LD", async () => {
    const d = await buildDraft(await googleLead(ROOFER, "contractor"), deps());
    const html = renderSite(d);
    expect(html).toContain("4.4 from 17 Google reviews");
    expect(html).toContain("Source: Google Maps");
    expect(jsonLd(d)).not.toMatch(/rating|review/i);
    expect(
      renderSite({ ...d, options: { ...d.options, showRating: false } }),
    ).not.toContain("Google reviews");
  });

  it("has no rating at all for a lead without one", async () => {
    const d = await buildDraft(
      await importedLead("Quiet Co | none | 716-555-0199", "contractor"),
      deps(),
    );
    expect(d.options.showRating).toBe(false);
    expect(renderSite(d)).not.toMatch(/Google review|★/);
  });

  it("marks sample content, links call and text, and keeps the form inert", async () => {
    const html = renderSite(
      await buildDraft(await googleLead(ROOFER, "contractor"), deps()),
    );
    expect(html.match(/class="sample"/g)!.length).toBe(5); // 4 offerings + about
    expect(html).toContain('href="tel:+17165550101"');
    expect(html).toContain('href="sms:+17165550101"');
    expect(html).toMatch(/<input id="n" disabled>/);
    expect(html).not.toMatch(/<form[^>]*action=/);
    expect(html).not.toContain('type="submit"');
  });

  it("escapes business-supplied text everywhere, including inside JSON-LD", async () => {
    const lead = await importedLead(
      "</script><script>alert(1)</script> Roofing | none | 716-555-0199",
      "contractor",
    );
    const d = await buildDraft(lead, deps());
    const html = renderSite(d);
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("&lt;/script&gt;&lt;script&gt;alert(1)");
    expect(jsonLd(d)).not.toContain("</script>");
    expect(html.match(/<script\b/g)).toHaveLength(1);
  });

  it("the optional video block is a labelled placeholder, off by default", async () => {
    const d = await buildDraft(await googleLead(ROOFER, "contractor"), deps());
    expect(renderSite(d)).not.toContain('class="video"');
    expect(
      renderSite({ ...d, options: { ...d.options, showVideoBlock: true } }),
    ).toContain("Placeholder — no video has been made");
  });
});

describe("launch checklist", () => {
  it("is derived from the lead's findings and marks decisions as decisions", async () => {
    const roof = factsFromProspect(await googleLead(ROOFER, "contractor"));
    const items = launchChecklist(roof, 5);
    const ids = items.map((i) => i.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "content-approval",
        "domain",
        "hosting",
        "gbp-website",
        "gbp-hours",
        "gbp-photos",
        "calls-texts",
        "form-crm",
        "reviews",
      ]),
    );
    expect(items.find((i) => i.id === "hosting")!.owner).toBe("CEO decision");
    expect(items.find((i) => i.id === "domain")!.task).toContain("never registers");
    expect(items.find((i) => i.id === "reviews")!.task).toContain(
      "never write or buy reviews",
    );
  });

  it("uses tools the business already has and vertical-specific steps", async () => {
    const barber = launchChecklist(
      factsFromProspect(await googleLead(BARBER, "salon_barber")),
      5,
    );
    expect(barber.find((i) => i.id === "booking")!.task).toContain("Vagaro");
    expect(barber.find((i) => i.id === "domain")!.task).toContain(
      "unionbarbers.example",
    );
    const pizza = launchChecklist(
      factsFromProspect(await googleLead(PIZZERIA, "restaurant_bar")),
      5,
    );
    expect(pizza.map((i) => i.id)).toEqual(
      expect.arrayContaining(["menu", "ordering"]),
    );
  });
});

describe("drafts: build, rebuild, edit, approve", () => {
  it("builds in well under ten minutes and rebuilds as the next version of the same draft", async () => {
    const lead = await googleLead(ROOFER, "contractor");
    const v1 = await buildDraft(lead, deps());
    expect(v1.buildMs).toBeLessThan(2000);
    expect(v1.version).toBe(1);
    expect(v1.copySource).toBe("template");
    const v2 = await buildDraft(lead, deps({ previous: v1 }));
    expect(v2.id).toBe(v1.id);
    expect(v2.version).toBe(2);
    expect(v2.audit.map((a) => a.action)).toEqual(["built", "rebuilt"]);
  });

  it("reviewer edits pass the guard, stop being samples, and withdraw approval", async () => {
    const d = approveDraft(
      await buildDraft(await googleLead(ROOFER, "contractor"), deps()),
      "operator",
      NOW,
    );
    expect(d.status).toBe("approved");
    const e = editDraft(
      d,
      {
        offerings:
          "Roof repair: Shingles and leaks\nGutters: Cleaning and guards\nSiding: Vinyl siding",
      },
      "operator",
      NOW,
    );
    expect(e.copy.offerings.map((o) => o.sample)).toEqual([false, false, false]);
    expect(e.status).toBe("draft");
    expect(e.audit.at(-1)!.detail).toContain("Approval withdrawn");
    expect(renderSite(e).match(/class="sample"/g)).toHaveLength(1);
    expect(() =>
      editDraft(d, { heroSubhead: "Guaranteed lowest prices!" }, "operator", NOW),
    ).toThrow(DraftEditError);
  });

  it("cannot show a rating that is not on file", async () => {
    const d = await buildDraft(
      await importedLead("Quiet Co | none | 716-555-0199", "contractor"),
      deps(),
    );
    expect(() => editDraft(d, { showRating: true }, "operator", NOW)).toThrow(
      "no Google rating",
    );
  });

  it("parses reviewer offerings", () => {
    expect(parseOfferings("A: one\n\nB")).toEqual([
      { name: "A", description: "one", sample: false },
      { name: "B", description: "", sample: false },
    ]);
  });
});

describe("ZIP export", () => {
  it("is a valid ZIP with the page, checklist and readme", async () => {
    const d = await buildDraft(await googleLead(ROOFER, "contractor"), deps());
    const zip = await draftZip(d, NOW);
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const eocd = zip.length - 22;
    expect(view.getUint32(eocd, true)).toBe(0x06054b50);
    expect(view.getUint16(eocd + 10, true)).toBe(3);
    const text = new TextDecoder().decode(zip);
    expect(text).toContain("seneca-roofing-gutters/index.html");
    expect(text).toContain("seneca-roofing-gutters/LAUNCH-CHECKLIST.md");
    expect(text).toContain(renderSite(d));
    expect(zipFileName(d)).toBe("hlg-demo-seneca-roofing-gutters-v1.zip");
  });
});
