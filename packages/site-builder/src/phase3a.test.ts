import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import { runMarketScan, type Prospect, type WebEgress } from "@hl-bos/presence-scanner";

import { approveDraft, buildDraft, editDraft } from "./builder.ts";
import { createClaudeCopyWriter } from "./copy-claude.ts";
import { draftZip, readme, zipFileName } from "./export.ts";
import { factsFromProspect } from "./facts.ts";
import { importedLead, NOW } from "./fixtures.test-helpers.ts";
import {
  HLG_BT_ID,
  HSCS_ID,
  hlgBusinessTransformationProfile,
  hscsProfile,
} from "./hlg-profiles.ts";
import {
  buildInternalDraft,
  InternalDraftError,
  profileBuildProblems,
} from "./internal.ts";
import {
  emptyProfile,
  profileMissing,
  validateProfile,
  type BusinessProfile,
} from "./profile.ts";
import { renderSite } from "./render.ts";
import type { SiteDraft } from "./types.ts";
import { validateCopy } from "./validate.ts";
import {
  isSiteVertical,
  SITE_VERTICAL_REGISTRY,
  SITE_VERTICALS,
  supportedVerticalsText,
} from "./verticals.ts";

let n = 0;
const deps = (o: Partial<Parameters<typeof buildInternalDraft>[2]> = {}) => ({
  now: () => NOW,
  newId: () => `draft-${++n}`,
  actor: "ceo",
  previous: undefined,
  ...o,
});
const demoDeps = {
  writer: null,
  now: () => NOW,
  newId: () => "d",
  actor: "op",
  previous: undefined,
};

/** The page without its <head> (CSS colours and gradients are not content). */
const body = (html: string) => html.slice(html.indexOf("<body>"));
const scripts = (html: string) => html.match(/<script\b[^>]*>/gi) ?? [];
const internal = (p: BusinessProfile, prospect?: Prospect) =>
  buildInternalDraft(p, prospect, deps());

describe("the site vertical registry", () => {
  it("defines every vertical in one place, with everything the builder needs", () => {
    expect(SITE_VERTICALS).toEqual([
      "contractor",
      "salon_barber",
      "restaurant_bar",
      "professional_services",
    ]);
    for (const d of Object.values(SITE_VERTICAL_REGISTRY)) {
      expect(d.packs.length).toBeGreaterThan(0);
      expect(d.sections).toContain("hero");
      expect(d.sections).toContain("contact");
      expect(d.modules.length).toBeGreaterThan(0);
      expect(d.requiredFacts).toContain("name");
      expect(d.primaryCta).not.toBe("");
      expect(d.validation.minOfferings).toBeLessThanOrEqual(d.validation.maxOfferings);
    }
    expect(SITE_VERTICAL_REGISTRY.professional_services.renderer).toBe("professional");
    expect(isSiteVertical("professional_services")).toBe(true);
    expect(isSiteVertical("trainer_coach")).toBe(false);
    expect(supportedVerticalsText()).toBe(
      "contractors, salons/barbers, restaurants/bars and professional-services firms",
    );
  });

  it("professional sections run in the order the template specifies", () => {
    expect(SITE_VERTICAL_REGISTRY.professional_services.sections).toEqual([
      "banner",
      "header",
      "hero",
      "challenges",
      "offerings",
      "process",
      "industries",
      "experience",
      "proof",
      "tools",
      "about",
      "cta",
      "contact",
      "footer",
    ]);
  });
});

describe("professional-services prospect demos", () => {
  const lead = () =>
    importedLead(
      "Lakeview Advisory | none | 716-555-0180 | 1 Main St, Orchard Park, NY 14127",
      "professional_services",
    );

  it("build from a lead: demo banner, noindex, inert form, samples marked, no claims", async () => {
    const d = await buildDraft(await lead(), demoDeps);
    expect(d.mode).toBeUndefined();
    const html = renderSite(d);
    expect(html).toContain(
      "<strong>Demo website</strong> prepared by Herman Legacy Group",
    );
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(scripts(html)).toEqual(['<script type="application/ld+json">']);
    expect(html).not.toMatch(/<form[^>]*action=/i);
    expect(html.match(/<input id="[a-z]" disabled>/g)).toHaveLength(2);
    expect(html).toContain('"@type":"ProfessionalService"');
    expect(html).toContain('class="sample"');
    for (const id of [
      "challenges",
      "services",
      "process",
      "industries",
      "experience",
      "proof",
      "about",
      "contact",
    ])
      expect(html).toContain(`id="${id}"`);
    // Experience and case studies are notices, never sample claims.
    expect(d.copy.pro!.experience).toEqual([]);
    expect(d.copy.pro!.proof).toEqual([]);
    expect(html).toContain(
      "Information required:</strong> Lakeview Advisory&#39;s own experience",
    );
    expect(validateCopy(d.copy, d.facts)).toEqual([]);
    expect(d.checklist.map((c) => c.id)).toEqual(
      expect.arrayContaining(["consultation", "proof", "form-crm"]),
    );
  });

  it("picks the subtype pack and schema type from the business", async () => {
    const cpa = await importedLead(
      "Smith CPA | none | 716-555-0181",
      "professional_services",
    );
    const f = factsFromProspect(cpa);
    expect(f.subtype).toBe("accounting");
    const d = await buildDraft(cpa, demoDeps);
    expect(d.copy.offerings.map((o) => o.name)).toContain("Tax preparation");
    expect(renderSite(d)).toContain('"@type":"AccountingService"');
  });

  it("Claude writes only the core copy; sample sections stay the template's", async () => {
    const client = {
      beta: {
        messages: {
          parse: () =>
            Promise.resolve({
              stop_reason: "end_turn",
              parsed_output: {
                seoTitle: "Lakeview Advisory | Consulting",
                metaDescription: "Consulting in Orchard Park.",
                heroEyebrow: "Consulting",
                heroHeadline: "Lakeview Advisory",
                heroSubhead: "Consulting in Orchard Park.",
                aboutHeading: "About Lakeview Advisory",
                aboutBody: "Lakeview Advisory is a consulting firm in Orchard Park.",
                offeringsHeading: "Services",
                offeringsIntro: "Examples.",
                offerings: [
                  { name: "Assessments", description: "A look at where things stand." },
                  { name: "Strategy", description: "A plan." },
                  { name: "Support", description: "Help." },
                ],
                ctaHeading: "Start with a conversation",
                ctaBody: "Call (716) 555-0180.",
              },
            }),
        },
      },
    } as unknown as Anthropic;
    const d = await buildDraft(await lead(), {
      ...demoDeps,
      writer: createClaudeCopyWriter({ apiKey: "", client }),
    });
    expect(d.copySource).toMatch(/^claude:/);
    expect(d.copy.pro!.challenges.every((c) => c.sample)).toBe(true);
  });
});

describe("Business Profile validation", () => {
  const base = () => {
    const p = emptyProfile("p1", "professional_services", NOW);
    p.fields.brandName = {
      value: "Lakeview Advisory",
      status: "verified",
      source: "owner",
    };
    return p;
  };

  it("a verified field needs a value and a source", () => {
    const p = base();
    p.fields.tagline = { value: "", status: "verified", source: "" };
    const problems = validateProfile(p).join(" ");
    expect(problems).toContain("Tagline is marked verified but is empty");
    expect(problems).toContain("Tagline is marked verified: say who verified it");
  });

  it("checks phone, email, addresses and colours", () => {
    const p = base();
    p.fields.phone = { value: "716-555-0142", status: "verified", source: "x" };
    p.fields.email = { value: "not-an-email", status: "unverified", source: "x" };
    p.fields.website = {
      value: "http://insecure.example",
      status: "verified",
      source: "x",
    };
    p.fields.brandColor = { value: "gold", status: "verified", source: "x" };
    const problems = validateProfile(p).join(" ");
    expect(problems).toContain("reserved for examples");
    expect(problems).toContain("is not an email address");
    expect(problems).toContain("must be a full https:// address");
    expect(problems).toContain("must be a colour");
    p.fields.phone.value = "716-220-7354";
    expect(validateProfile(p).join(" ")).not.toContain("Business phone");
  });

  it("verified content may state approved experience, never prices, testimonials or awards", () => {
    const p = base();
    p.lists.experience = {
      status: "verified",
      source: "CEO",
      items: [{ name: "Final-mile operations since 2010", description: "" }],
    };
    expect(validateProfile(p)).toEqual([]);
    p.lists.services = {
      status: "verified",
      source: "CEO",
      items: [
        { name: "Assessments from $499", description: "" },
        { name: "Best consultants in WNY", description: "" },
      ],
    };
    p.lists.caseStudies = {
      status: "unverified",
      source: "",
      items: [{ name: "Testimonials", description: "What our clients say" }],
    };
    const problems = validateProfile(p).join(" ");
    expect(problems).toContain("a price or price claim");
    expect(problems).toContain("a superlative or award");
    expect(problems).toContain("testimonials cannot be added through the profile");
  });

  it("lists what is still missing in plain English", () => {
    const missing = profileMissing(base());
    expect(missing).toContain("Business email");
    expect(missing).toContain("Business phone");
    expect(missing).toContain("Verified list of services");
  });
});

describe("internal-draft mode", () => {
  it("says internal draft, never 'prepared by HLG', and is private by construction", () => {
    const d = internal(hlgBusinessTransformationProfile(NOW));
    const html = renderSite(d);
    expect(d.mode).toBe("internal_draft");
    expect(html).toContain("<strong>Internal draft — not published.</strong>");
    expect(html).not.toContain("prepared by Herman Legacy Group");
    expect(html).not.toContain("Demo prepared by");
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(scripts(html)).toEqual(['<script type="application/ld+json">']);
    expect(html).not.toMatch(/<form[^>]*action=/i);
    expect(html).toContain("This form is switched off. It goes live only after");
    expect(html).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
    );
    expect(html).toContain("@media(max-width:620px)");
  });

  it("only verified fields become facts; unverified ones stay off the page", () => {
    const p = hlgBusinessTransformationProfile(NOW);
    p.fields.email = {
      value: "unconfirmed@hlg.example",
      status: "unverified",
      source: "draft",
    };
    p.lists.statistics = {
      status: "unverified",
      source: "draft",
      items: [{ name: "40% more leads", description: "" }],
    };
    const html = renderSite(internal(p));
    expect(html).not.toContain("unconfirmed@hlg.example");
    expect(html).not.toContain("40%");
    // Unverified service area is not shown; the verified phone is.
    expect(html).not.toContain("Western New York");
    expect(html).toContain('href="tel:+17162207354"');
    p.lists.statistics.status = "verified";
    p.lists.statistics.source = "CEO, 2026-10-15";
    expect(renderSite(internal(p))).toContain("40% more leads");
  });

  it("escapes profile text everywhere", () => {
    const p = hlgBusinessTransformationProfile(NOW);
    p.fields.brandName.value = "HLG <b>Test</b> & Co";
    const html = renderSite(internal(p));
    expect(html).toContain("HLG &lt;b&gt;Test&lt;/b&gt; &amp; Co");
    expect(html).not.toContain("<b>Test</b>");
  });

  it("refuses to build without a verified brand name", () => {
    const p = emptyProfile("x", "professional_services", NOW);
    expect(() => internal(p)).toThrow(InternalDraftError);
    expect(profileBuildProblems(p)[0]).toContain("brand name");
    expect(() => internal({ ...hscsProfile(NOW), vertical: "contractor" })).toThrow(
      "Internal drafts use the professional template",
    );
  });

  it("keeps version history, re-applies the full guard to edits, and approves without publishing", () => {
    const p = hscsProfile(NOW);
    const v1 = internal(p);
    const v2 = buildInternalDraft(p, undefined, deps({ previous: v1 }));
    expect(v2.version).toBe(2);
    expect(v2.id).toBe(v1.id);
    expect(v2.audit.map((a) => a.action)).toEqual(["built", "rebuilt"]);
    const approved = approveDraft(v2, "ceo", NOW);
    expect(approved.audit.at(-1)!.detail).toBe(
      "Approved as an internal draft for CEO review. Nothing was published.",
    );
    const edited = editDraft(
      approved,
      { heroHeadline: "Operations consulting supported with AI" },
      "ceo",
      NOW,
    );
    expect(edited.status).toBe("draft");
    expect(edited.copy.verifiedFields).not.toContain("heroHeadline");
    expect(edited.checklist).toEqual(approved.checklist);
    expect(() =>
      editDraft(
        edited,
        { heroSubhead: "Over 30 years of experience saving $2M" },
        "ceo",
        NOW,
      ),
    ).toThrow();
  });
});

describe("HLG Business Transformation draft", () => {
  const p = hlgBusinessTransformationProfile(NOW);
  const d = internal(p);
  const html = renderSite(d);

  it("is built from the verified profile", () => {
    expect(p.id).toBe(HLG_BT_ID);
    expect(validateProfile(p)).toEqual([]);
    expect(html).toContain(
      "HLG Business Transformation helps local and service-based businesses",
    );
    expect(html).toContain("(716) 220-7354");
    expect(html).toContain("Website and customer-experience transformation");
    expect(d.brand!.accent).toBe("#c0892d");
    expect(d.brand!.mark).toBe("HLG");
  });

  it("labels planned products as planned and never as available", () => {
    for (const name of [
      "TakeoutOS",
      "SalonOS / BarberOS",
      "Contractor Performance System",
    ]) {
      const card = html.slice(
        html.indexOf(`<h3>${name.replace("/", "/")}`),
        html.indexOf("</article>", html.indexOf(`<h3>${name}`)),
      );
      expect(card).toContain('class="tool-status planned">Planned</span>');
    }
    expect(html).not.toContain(">Available</span>");
    expect(html).toContain("In development");
  });

  it("shows notices, not invented content, where facts are missing", () => {
    expect(d.infoRequired).toEqual(
      expect.arrayContaining(["Business email", "Privacy policy link"]),
    );
    expect(html).toContain("Information required:</strong> verified case studies");
    expect(html).toContain(
      "Information required:</strong> privacy policy and terms links",
    );
    expect(html).not.toMatch(/mailto:/);
    expect(body(html)).not.toMatch(/\$\s?\d|\d+%|testimonial[^s]|<blockquote/i);
  });
});

describe("HSCS draft", () => {
  const p = hscsProfile(NOW);
  const d = internal(p);
  const html = renderSite(d);

  it("uses the approved positioning and experience areas, in its own colours", () => {
    expect(p.id).toBe(HSCS_ID);
    expect(validateProfile(p)).toEqual([]);
    expect(html).toContain(
      "Transportation &amp; Operations Consulting supported with AI.",
    );
    for (const area of [
      "White-glove delivery",
      "Direct-to-customer distribution",
      "Dispatch and routing",
      "Practical AI-supported improvement",
    ])
      expect(html).toContain(area);
    expect(d.brand!.accent).toBe("#006d77");
    expect(d.brand!.accent).not.toBe(
      internal(hlgBusinessTransformationProfile(NOW)).brand!.accent,
    );
  });

  it("carries none of the current site's unverified claims or placeholder contacts", () => {
    for (const s of [
      "1994",
      "30 Yrs",
      "2.4M",
      "18.3",
      "200+",
      "180M",
      "98.2",
      "555",
      "info@hermansupplychain.com",
      "Lowe",
    ])
      expect(body(html)).not.toContain(s);
    expect(html).not.toMatch(/href="tel:/);
    expect(html).toContain(
      "Information required:</strong> a business phone number or email address",
    );
  });

  it("lists the audit's findings that must be fixed before relaunch", async () => {
    const lead = await importedLead(
      "Herman Supply Chain Solutions | none",
      "professional_services",
    );
    const audit = {
      ...lead,
      findings: [
        {
          key: "site.claims",
          status: "needs_verification",
          evidence: "$2.4M+ …",
          label: "",
          source: "website",
          observedAt: "",
          confidence: "low",
        },
        {
          key: "site.placeholder_contact",
          status: "needs_verification",
          evidence: "800-555-1234",
          label: "",
          source: "website",
          observedAt: "",
          confidence: "medium",
        },
      ],
    } as Prospect;
    const ids = buildInternalDraft(p, audit, deps()).checklist.map((c) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "audit-site.claims",
        "audit-site.placeholder_contact",
        "publishing",
        "domain",
        "privacy",
      ]),
    );
    const pub = d.checklist.find((c) => c.id === "publishing")!;
    expect(pub.owner).toBe("CEO decision");
    expect(pub.task).toContain("Nothing has been published");
  });

  it("exports a ZIP named and described as an internal draft", async () => {
    expect(zipFileName(d)).toBe(
      "hlg-internal-draft-herman-supply-chain-solutions-v1.zip",
    );
    expect(readme(d)).toContain(
      "INTERNAL DRAFT — Herman Supply Chain Solutions (not published)",
    );
    const zip = await draftZip(d, NOW);
    const text = new TextDecoder("latin1").decode(zip);
    expect(text.slice(0, 2)).toBe("PK");
    for (const f of ["index.html", "LAUNCH-CHECKLIST.md", "README.txt"])
      expect(text).toContain(f);
  });
});

describe("the audit feeds an internal draft from a real scan", () => {
  it("uses the lead's gaps and vendors", async () => {
    const offline: WebEgress = {
      online: () => Promise.resolve(false),
      resolve: () => Promise.reject(new Error("offline")),
      fetchPage: () => Promise.reject(new Error("offline")),
      fetchRobots: () => Promise.resolve(undefined),
    };
    const { prospects } = await runMarketScan(
      {
        market: "West Seneca",
        zip: "14224",
        radiusMiles: 10,
        vertical: "professional_services",
        maxResults: 5,
        searchTerms: undefined,
        source: "import",
        importText: "HLG Business Transformation | none | 716-220-7354",
      },
      {
        places: null,
        egress: offline,
        now: () => NOW,
        newId: () => "lead-bt",
        existing: [],
        actor: "ceo",
      },
    );
    const lead = prospects[0]!;
    const d: SiteDraft = internal(hlgBusinessTransformationProfile(NOW), lead);
    expect(d.prospectId).toBe("lead-bt");
    expect(d.facts.websiteStatus).toBe("none");
    expect(d.facts.gaps).toContain("website.exists");
  });
});
