// The template writer: deterministic copy from facts alone. Always available,
// needs no key, and is the fallback whenever a Claude draft fails the guard.
// Offerings are typical examples for the business's category, marked SAMPLE
// on the page -- we do not know what this business actually offers.

import type { ProfessionalCopy, SiteCopy, SiteFacts } from "./types.ts";
import { LIMITS } from "./validate.ts";
import { proPackFor, sample, verticalDef, type Pack } from "./verticals.ts";

export function packFor(facts: SiteFacts): Pack {
  if (verticalDef(facts.vertical).renderer === "professional")
    return proPackFor(facts.subtype);
  const text = `${facts.category ?? ""} ${facts.businessName}`;
  const packs = verticalDef(facts.vertical).packs;
  return packs.find((p) => p.match.test(text)) ?? packs[packs.length - 1]!;
}

const aOrAn = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

const fit = (s: string, max: number) =>
  s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;

export function templateCopy(facts: SiteFacts): SiteCopy {
  const pack = packFor(facts);
  const def = verticalDef(facts.vertical);
  const { verb, cta } = def.action;
  const where = facts.city ? ` in ${facts.city}` : "";
  const kind = facts.category ?? pack.noun;
  // "a roofing contractor" from Google's category; otherwise "a roofing business".
  const described = facts.category
    ? facts.category.toLowerCase()
    : (pack.described ??
      (/shop|salon|restaurant|pizzeria/i.test(pack.noun)
        ? pack.noun.toLowerCase()
        : `${pack.noun.toLowerCase()} business`));
  const reach = facts.phone
    ? `Call or text ${facts.phone} ${verb}.`
    : `Get in touch ${verb}.`;

  const titleTail = ` | ${kind}${where}`;
  const seoTitle =
    facts.businessName.length + titleTail.length <= LIMITS.seoTitle
      ? `${facts.businessName}${titleTail}`
      : fit(facts.businessName, LIMITS.seoTitle);

  return {
    seoTitle,
    metaDescription: fit(
      `${facts.businessName}: ${kind.toLowerCase()}${where}. ${reach}`,
      LIMITS.metaDescription,
    ),
    heroEyebrow: fit(`${kind}${where}`, LIMITS.heroEyebrow),
    heroHeadline: fit(facts.businessName, LIMITS.heroHeadline),
    heroSubhead: fit(`${pack.noun}${where}. ${reach}`, LIMITS.heroSubhead),
    aboutHeading: `About ${fit(facts.businessName, LIMITS.aboutHeading - 6)}`,
    aboutBody: fit(
      `${facts.businessName} is ${aOrAn(described)} ${described}${where}. This is where the owner's own story goes: how the business started, the people behind it, and what customers can expect.`,
      LIMITS.aboutBody,
    ),
    aboutSample: true,
    offeringsHeading: def.offeringsHeading,
    offeringsIntro:
      "Examples to show the layout. Replace them with the real list before launch.",
    offerings: sample(pack.offerings),
    ctaHeading: cta,
    ctaBody: reach,
    ...(def.renderer === "professional"
      ? { pro: templateProCopy(pack, def.primaryCta) }
      : {}),
  };
}

/** Sample sections for a professional firm we have not spoken to. */
export function templateProCopy(pack: Pack, primaryCta: string): ProfessionalCopy {
  const p = pack.pro;
  return {
    primaryCta,
    secondaryCta: undefined,
    challengesHeading: "Challenges we help with",
    challenges: sample(p?.challenges ?? []),
    processHeading: "How an engagement works",
    process: sample(p?.process ?? []),
    industriesHeading: "Who we work with",
    industries: sample(p?.industries ?? []),
    experienceHeading: "Experience",
    experience: [],
    proofHeading: "Case studies",
    proof: [],
    toolsHeading: "Tools we work with",
    tools: [],
  };
}
