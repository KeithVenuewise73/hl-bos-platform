// Staff-review helper: lists every factual claim in a spec that the intake does
// not back. It is the TypeScript counterpart of the database rule "every claim
// has a source", and goes further: the database checks that a source is NAMED;
// this checks that the named intake field exists and says the same thing. It
// also scans free text (headline, about, FAQ, SEO...) for claims nobody
// declared. Same spirit as @hl-bos/site-builder's fabrication guard, but a
// FINDER for review rather than a gate: it lists, a human decides.

import { displayPhone } from "./contact.ts";
import type { SiteSpec } from "./schema.ts";

export interface UnsupportedClaim {
  /** Where it is: "claims[0]" or "pages[0].sections[3].body". */
  where: string;
  text: string;
  category: ClaimCategory;
  reason: string;
}

export type ClaimCategory =
  | "history"
  | "award"
  | "rating"
  | "testimonial"
  | "credential"
  | "guarantee"
  | "superlative"
  | "number";

/** Which intake fields can back each category. */
const BACKING: Record<ClaimCategory, readonly string[]> = {
  history: ["yearsInBusiness", "foundedYear", "established", "familyOwned"],
  award: ["awards"],
  rating: ["rating", "reviews"],
  testimonial: ["testimonials", "reviews"],
  credential: ["certifications", "licensed", "insured"],
  guarantee: ["guarantee"],
  superlative: ["awards"],
  number: [],
};

const PATTERNS: [ClaimCategory, RegExp][] = [
  [
    "history",
    /\b\d+\+?\s*years?\b|\bsince\s+(19|20)\d\d\b|\bestablished\b|\bdecades?\b|\bgenerations?\b|\bfamily[- ](owned|run)\b/i,
  ],
  ["award", /\baward[- ]?(winning|winner|s)?\b|\bwinner\b/i],
  [
    "rating",
    /\b\d(\.\d)?\s*(\/\s*5\s*)?stars?\b|\b5[- ]star\b|\brated\b|\bratings?\b/i,
  ],
  ["testimonial", /\btestimonials?\b|\breviews?\b|\bcustomers (say|love)\b/i],
  [
    "credential",
    /\blicen[cs]ed\b|\binsured\b|\bbonded\b|\bcertified\b|\baccredited\b/i,
  ],
  ["guarantee", /\bguarantee[ds]?\b|\bwarrant(y|ied|ies)\b/i],
  ["superlative", /\bbest\b|\bnumber one\b|#\s?1\b|\btop[- ]rated\b|\bvoted\b/i],
];

const isEmpty = (v: unknown): boolean =>
  v === undefined ||
  v === null ||
  v === false ||
  v === "" ||
  (Array.isArray(v) && v.length === 0);

const blob = (v: unknown): string =>
  typeof v === "string" ? v : JSON.stringify(v ?? "");

const digitsOf = (s: string): string[] => s.match(/\d+/g) ?? [];

/** The intake fields (not empty) that could back a category. */
function backingText(
  category: ClaimCategory,
  intake: Record<string, unknown>,
): string | null {
  const present = BACKING[category].filter((f) => !isEmpty(intake[f]));
  return present.length ? present.map((f) => blob(intake[f])).join(" ") : null;
}

/** All free text in a spec, with its location. Business facts in `profile` are skipped: they ARE the intake. */
function freeText(spec: SiteSpec): [string, string][] {
  const out: [string, string][] = [
    ["hero.headline", spec.hero.headline],
    ["hero.subheadline", spec.hero.subheadline],
    ["seo.title", spec.seo.title],
    ["seo.description", spec.seo.description],
  ];
  spec.profile.services.forEach((s, i) => {
    if (s.description) out.push([`profile.services[${i}].description`, s.description]);
  });
  spec.pages.forEach((p, pi) =>
    p.sections.forEach((s, si) => {
      const at = `pages[${pi}].sections[${si}]`;
      if ("heading" in s && s.heading) out.push([`${at}.heading`, s.heading]);
      if (s.type === "services" && s.intro) out.push([`${at}.intro`, s.intro]);
      if (s.type === "about") out.push([`${at}.body`, s.body]);
      if (s.type === "contact" && s.note) out.push([`${at}.note`, s.note]);
      if (s.type === "faq")
        s.items.forEach((q, qi) => {
          out.push([`${at}.items[${qi}].question`, q.question]);
          out.push([`${at}.items[${qi}].answer`, q.answer]);
        });
    }),
  );
  return out;
}

export function findUnsupportedClaims(
  spec: SiteSpec,
  intake: Record<string, unknown>,
): UnsupportedClaim[] {
  const found: UnsupportedClaim[] = [];
  const intakeDigits = new Set(
    digitsOf(
      [
        intake["businessName"],
        intake["phone"],
        typeof intake["phone"] === "string" ? displayPhone(intake["phone"]) : "",
        intake["address"],
        intake["services"],
        intake["hours"],
      ]
        .map(blob)
        .join(" "),
    ),
  );

  // 1. Declared claims: the named intake field must exist and contain the claim's numbers.
  (spec.claims ?? []).forEach((c, i) => {
    const where = `claims[${i}]`;
    const category: ClaimCategory =
      c.kind === "yearsInBusiness"
        ? "history"
        : c.kind === "award"
          ? "award"
          : c.kind === "rating"
            ? "rating"
            : c.kind === "certification"
              ? "credential"
              : "number";
    if (c.source.type === "user") {
      found.push({
        where,
        text: c.value,
        category,
        reason:
          "stated by the site owner, not backed by intake data; confirm before publishing",
      });
      return;
    }
    const field = intake[c.source.field];
    if (isEmpty(field)) {
      found.push({
        where,
        text: c.value,
        category,
        reason: `names intake field "${c.source.field}", which the intake does not have`,
      });
      return;
    }
    const have = new Set(digitsOf(blob(field)));
    const missing = digitsOf(c.value).filter((d) => !have.has(d));
    if (missing.length)
      found.push({
        where,
        text: c.value,
        category,
        reason: `says ${missing.join(", ")}, which is not in intake field "${c.source.field}"`,
      });
  });

  // 2. Undeclared claims hiding in free text.
  for (const [where, t] of freeText(spec)) {
    for (const [category, re] of PATTERNS) {
      if (!re.test(t)) continue;
      const backing = backingText(category, intake);
      if (backing === null) {
        found.push({
          where,
          text: t,
          category,
          reason: `makes a ${category} claim and the intake has no ${BACKING[category].join(" / ")}`,
        });
        continue;
      }
      const have = new Set(digitsOf(backing));
      const missing = digitsOf(t).filter((d) => !have.has(d) && !intakeDigits.has(d));
      if (missing.length)
        found.push({
          where,
          text: t,
          category,
          reason: `says ${missing.join(", ")}, which the intake does not say`,
        });
    }
    // A number that is not the business's own.
    const stray = digitsOf(t).filter((d) => !intakeDigits.has(d));
    const alreadyFlagged = found.some((f) => f.where === where);
    if (stray.length && !alreadyFlagged)
      found.push({
        where,
        text: t,
        category: "number",
        reason: `contains ${stray.join(", ")}, which is not in the intake`,
      });
  }
  return found;
}
