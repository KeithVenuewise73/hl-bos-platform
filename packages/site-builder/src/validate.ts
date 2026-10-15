// The fabrication guard. Every word that reaches a demo page passes through
// here -- the template writer's and Claude's alike. A demo shown to a business
// owner must not claim anything about them we cannot back: no prices, no
// guarantees, no credentials, no history, no ratings or reviews in the copy
// (a real Google rating is rendered separately, with attribution), no numbers
// or links that are not theirs.

import type { SiteCopy, SiteFacts } from "./types.ts";
import { SITE_VERTICAL_REGISTRY } from "./verticals.ts";

export const LIMITS = {
  seoTitle: 60,
  metaDescription: 160,
  heroEyebrow: 40,
  heroHeadline: 80,
  heroSubhead: 200,
  aboutHeading: 60,
  aboutBody: 600,
  offeringsHeading: 60,
  offeringsIntro: 220,
  offeringName: 40,
  offeringDescription: 160,
  ctaHeading: 70,
  ctaBody: 220,
  minOfferings: 3,
  maxOfferings: 6,
  /** Professional sections (challenges, process, industries, ...). */
  maxSectionItems: 10,
} as const;

/** Claims we cannot verify about a business we have never spoken to. */
export const FORBIDDEN: [RegExp, string][] = [
  [
    /\$\s?\d|\b\d+\s?(usd|dollars?)\b|\bprices? (start|from)\b|\bcheapest\b|\baffordable\b/i,
    "a price or price claim",
  ],
  [/\bguarantee[ds]?\b|\bwarrant(y|ied|ies)\b|\bpromise[sd]?\b/i, "a guarantee"],
  [/\bfree\b/i, "something offered free"],
  [
    /#\s?1\b|\bnumber one\b|\bbest\b|\btop[- ]rated\b|\baward/i,
    "a superlative or award",
  ],
  [
    /\blicen[cs]ed\b|\binsured\b|\bbonded\b|\bcertified\b|\baccredited\b/i,
    "a credential",
  ],
  [
    /\bfamily[- ](owned|run)\b|\bsince\s+(19|20)\d\d\b|\byears? (of )?experience\b|\bdecades?\b|\bestablished\b|\bgenerations?\b/i,
    "a history claim",
  ],
  [
    /\b24\/7\b|\b24 hours\b|\bemergency\b|\bsame[- ]day\b|\bopen (late|now|daily)\b/i,
    "an availability claim",
  ],
  [
    /\breviews?\b|\brated\b|\bstars?\b|\btestimonials?\b|\b5[- ]star\b/i,
    "a rating or review claim",
  ],
  [/\bhttps?:\/\/|\bwww\.|@[a-z0-9-]+\.[a-z]/i, "a link or email address"],
];

/**
 * The rules a VERIFIED Business Profile item still has to pass. Verified items
 * may state approved experience and history ("final-mile operations since
 * 2010") -- the CEO has checked them -- but no prices, guarantees, awards,
 * credentials, testimonials or links, verified or not.
 */
const STILL_FORBIDDEN_WHEN_VERIFIED = new Set([
  "a price or price claim",
  "a guarantee",
  "something offered free",
  "a superlative or award",
  "a credential",
  "a rating or review claim",
  "a link or email address",
]);

type Field = [label: string, text: string, verified: boolean];

function textFields(c: SiteCopy): Field[] {
  const base: [string, string][] = [
    ["SEO title", c.seoTitle],
    ["meta description", c.metaDescription],
    ["eyebrow", c.heroEyebrow],
    ["headline", c.heroHeadline],
    ["subhead", c.heroSubhead],
    ["about heading", c.aboutHeading],
    ["about text", c.aboutBody],
    ["offerings heading", c.offeringsHeading],
    ["offerings intro", c.offeringsIntro],
    ["call-to-action heading", c.ctaHeading],
    ["call-to-action text", c.ctaBody],
  ];
  const items = (
    label: string,
    list: { name: string; description: string; verified?: boolean }[],
  ) =>
    list.flatMap((o, i): Field[] => [
      [`${label} ${i + 1} name`, o.name, o.verified === true],
      [`${label} ${i + 1} description`, o.description, o.verified === true],
    ]);
  const ver = new Set<string>(c.verifiedFields ?? []);
  const key: Record<string, string> = {
    eyebrow: "heroEyebrow",
    headline: "heroHeadline",
    subhead: "heroSubhead",
    "about text": "aboutBody",
    "meta description": "metaDescription",
  };
  const mark = ([l, t]: [string, string]): Field => [l, t, ver.has(key[l] ?? "")];
  const fields: Field[] = [
    ...base.slice(0, 9).map(mark),
    ...items("offering", c.offerings),
    ...base.slice(9).map(mark),
  ];
  const p = c.pro;
  if (p)
    fields.push(
      ["primary call to action", p.primaryCta, false],
      ...(p.secondaryCta
        ? [["secondary call to action", p.secondaryCta, false] as Field]
        : []),
      ["challenges heading", p.challengesHeading, false],
      ...items("challenge", p.challenges),
      ["process heading", p.processHeading, false],
      ...items("process step", p.process),
      ["industries heading", p.industriesHeading, false],
      ...items("industry", p.industries),
      ["experience heading", p.experienceHeading, false],
      ...items("experience item", p.experience),
      ["proof heading", p.proofHeading, false],
      ...items("case study", p.proof),
      ["tools heading", p.toolsHeading, false],
      ...p.tools.flatMap((t, i): Field[] => [
        [`tool ${i + 1} name`, t.name, false],
        [`tool ${i + 1} description`, t.description, false],
      ]),
    );
  return fields;
}

/**
 * Problems with a copy draft, in plain English. Empty = safe to use.
 * Digits are allowed only where they come from the business's own facts
 * (name, address, phone), so no invented "since 1998" or "500 roofs".
 */
export function validateCopy(c: SiteCopy, facts: SiteFacts): string[] {
  const problems: string[] = [];
  const len = (label: string, s: string, max: number) => {
    if (s.trim() === "") problems.push(`The ${label} is empty.`);
    else if (s.length > max)
      problems.push(`The ${label} is ${s.length} characters; the limit is ${max}.`);
  };
  len("SEO title", c.seoTitle, LIMITS.seoTitle);
  len("meta description", c.metaDescription, LIMITS.metaDescription);
  len("eyebrow", c.heroEyebrow, LIMITS.heroEyebrow);
  len("headline", c.heroHeadline, LIMITS.heroHeadline);
  len("subhead", c.heroSubhead, LIMITS.heroSubhead);
  len("about heading", c.aboutHeading, LIMITS.aboutHeading);
  len("about text", c.aboutBody, LIMITS.aboutBody);
  len("offerings heading", c.offeringsHeading, LIMITS.offeringsHeading);
  len("offerings intro", c.offeringsIntro, LIMITS.offeringsIntro);
  len("call-to-action heading", c.ctaHeading, LIMITS.ctaHeading);
  len("call-to-action text", c.ctaBody, LIMITS.ctaBody);
  // Facts without a known vertical (older callers) get the Phase 2 limits.
  const { minOfferings, maxOfferings, itemNameMax } = (
    SITE_VERTICAL_REGISTRY as Partial<typeof SITE_VERTICAL_REGISTRY>
  )[facts.vertical]?.validation ?? {
    minOfferings: LIMITS.minOfferings,
    maxOfferings: LIMITS.maxOfferings,
    itemNameMax: LIMITS.offeringName,
  };
  if (c.offerings.length < minOfferings || c.offerings.length > maxOfferings)
    problems.push(
      `There are ${c.offerings.length} offerings; between ${minOfferings} and ${maxOfferings} are needed.`,
    );
  c.offerings.forEach((o, i) => {
    len(`offering ${i + 1} name`, o.name, itemNameMax);
    len(`offering ${i + 1} description`, o.description, LIMITS.offeringDescription);
  });
  const p = c.pro;
  if (p) {
    len("primary call to action", p.primaryCta, LIMITS.heroEyebrow);
    for (const [label, list] of [
      ["challenge", p.challenges],
      ["process step", p.process],
      ["industry", p.industries],
      ["experience item", p.experience],
      ["case study", p.proof],
      ["tool", p.tools],
    ] as const) {
      if (list.length > LIMITS.maxSectionItems)
        problems.push(
          `There are ${list.length} ${label} entries; at most ${LIMITS.maxSectionItems} fit the page.`,
        );
      list.forEach((o, i) => {
        len(`${label} ${i + 1} name`, o.name, itemNameMax);
        len(`${label} ${i + 1} description`, o.description, LIMITS.offeringDescription);
      });
    }
  }
  if (!c.seoTitle.toLowerCase().includes(facts.businessName.toLowerCase().slice(0, 20)))
    problems.push("The SEO title must include the business name.");

  const ownDigits = new Set(
    [facts.businessName, facts.address ?? "", facts.phone ?? ""]
      .join(" ")
      .match(/\d+/g) ?? [],
  );
  for (const [label, text, verified] of textFields(c)) {
    for (const [re, what] of FORBIDDEN) {
      if (verified && !STILL_FORBIDDEN_WHEN_VERIFIED.has(what)) continue;
      // The business's own name may contain a flagged word ("Best Roofing"):
      // judge the text with the name removed.
      const scrubbed = text.split(facts.businessName).join(" ");
      if (re.test(scrubbed))
        problems.push(`The ${label} contains ${what}: "${clip(text)}".`);
    }
    const scrubbedDigits = text.split(facts.businessName).join(" ");
    for (const d of verified ? [] : (scrubbedDigits.match(/\d+/g) ?? []))
      if (!ownDigits.has(d))
        problems.push(
          `The ${label} contains the number ${d}, which is not in the business's details.`,
        );
    // Markup the business name brings is escaped on render; markup we wrote is not allowed.
    if (/<[a-z/!]/i.test(scrubbedDigits))
      problems.push(`The ${label} contains markup.`);
  }
  return problems;
}

const clip = (s: string) => (s.length > 70 ? `${s.slice(0, 69)}…` : s);
