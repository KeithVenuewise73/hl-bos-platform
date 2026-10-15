// The Opportunity Score: presence-opportunity-0.1.0.
//
// 0-100, higher = a bigger opportunity for HLG to improve the business's
// digital presence. Deterministic: the same findings always give the same
// score. No AI touches it.
//
// Three rules hold everywhere:
//   1. Every point awarded names a rule ID and the findings that justify it.
//   2. A fact we did not check is "not checked" -- it earns no points and is
//      not counted as a zero. `checkedMax` says how much of the 100 had
//      evidence behind it, so a lead scored on half the evidence says so.
//   3. Weights and thresholds live in ScoringConfig, which carries the version.
//      Change a number -> change the version.
//
// The website rubric that judges an existing site is the existing HL-BOS one
// (rubric.ts, rubric-0.1.0), reused, not re-invented.

import type { DimensionScore } from "../../../supabase/functions/_shared/discovery/rubric.ts";
import { VERTICALS, type ConversionKey } from "./verticals.ts";
import type {
  ComponentKey,
  ComponentScore,
  Contribution,
  Finding,
  OpportunityScore,
  Vertical,
  WebsiteStatus,
} from "./types.ts";

export const SCORING_VERSION = "presence-opportunity-0.1.0";

export interface ScoringConfig {
  version: string;
  weights: Record<ComponentKey, number>;
  website: {
    noSite: number;
    socialOnly: number;
    linkInBio: number;
    retiredSite: number;
    broken: number;
    /** Cap for a working site: it can never look as bad as having none. */
    existingSiteMax: number;
    /** Rubric dimensions (0-5) averaged to judge a working site. */
    rubricDimensions: string[];
  };
  reviews: {
    veryFewBelow: number;
    fewBelow: number;
    lowRatingBelow: number;
    belowRatingBelow: number;
    points: {
      none: number;
      veryFew: number;
      few: number;
      lowRating: number;
      belowRating: number;
    };
  };
  profile: { website: number; phone: number; hours: number; photos: number };
  search: { title: number; meta: number; structuredData: number; https: number };
  social: { noLinks: number; stale: number };
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  version: SCORING_VERSION,
  weights: {
    website: 30,
    conversion: 20,
    reviews: 15,
    profile: 15,
    search: 10,
    social: 10,
  },
  website: {
    noSite: 30,
    socialOnly: 30,
    linkInBio: 27,
    retiredSite: 30,
    broken: 24,
    existingSiteMax: 20,
    rubricDimensions: ["digital_presence", "customer_experience", "security"],
  },
  reviews: {
    veryFewBelow: 10,
    fewBelow: 25,
    lowRatingBelow: 3.8,
    belowRatingBelow: 4.2,
    points: { none: 9, veryFew: 7, few: 4, lowRating: 6, belowRating: 3 },
  },
  profile: { website: 5, phone: 4, hours: 4, photos: 2 },
  search: { title: 3, meta: 3, structuredData: 2, https: 2 },
  social: { noLinks: 6, stale: 4 },
};

export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  website: "Website presence and quality",
  conversion: "Conversion gaps",
  reviews: "Reviews",
  profile: "Google profile completeness",
  search: "Search basics",
  social: "Social presence and freshness",
};

export const CONVERSION_LABELS: Record<ConversionKey, string> = {
  call: "click-to-call",
  email: "email link",
  form: "contact or quote form",
  booking: "online booking",
  ordering: "online ordering",
  menu: "menu",
  pricing: "pricing",
  services: "services information",
  directions: "map or directions",
  registration: "online registration",
};

export interface ScoreInput {
  vertical: Vertical;
  websiteStatus: WebsiteStatus;
  findings: Finding[];
  rubric: DimensionScore[] | undefined;
  /** Review figures and where they came from (Google or a reviewer's import). */
  reviews:
    | { rating: number | undefined; count: number | undefined; findingKeys: string[] }
    | undefined;
}

/** Statuses meaning "the business has no website of its own". */
const NO_OWN_SITE: WebsiteStatus[] = ["none", "social_only", "retired_google_site"];

const websiteFindingKey: Partial<Record<WebsiteStatus, string>> = {
  none: "website.exists",
  social_only: "website.social_only",
  link_in_bio: "website.link_in_bio",
  retired_google_site: "website.retired_google_site",
  unreachable: "website.reachable",
  blocked: "website.reachable",
};

interface Partial_ {
  awarded: number;
  checked: number;
  contributions: Contribution[];
  note: string;
}

function component(key: ComponentKey, max: number, p: Partial_ | null): ComponentScore {
  if (p === null || p.checked === 0) {
    return {
      component: key,
      label: COMPONENT_LABELS[key],
      max,
      awarded: 0,
      status: "not_checked",
      contributions: [],
      note:
        p?.note || "Not checked: no evidence was available for this part of the score.",
    };
  }
  const awarded = Math.min(max, p.awarded);
  return {
    component: key,
    label: COMPONENT_LABELS[key],
    max,
    awarded,
    status: p.checked >= max ? "scored" : "partial",
    contributions: p.contributions,
    note: p.note,
  };
}

export function scoreOpportunity(
  input: ScoreInput,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): OpportunityScore {
  const byKey = new Map(input.findings.map((x) => [x.key, x]));
  const status = (k: string) => byKey.get(k)?.status;
  const has = (k: string) => byKey.has(k);
  const ws = input.websiteStatus;
  const wKey = websiteFindingKey[ws];
  const W = config.weights;

  // --- 1. Website presence and quality ------------------------------------
  let website: Partial_ | null = null;
  const fixed: Partial<Record<WebsiteStatus, [string, string, number]>> = {
    none: ["W.no_site", "No website", config.website.noSite],
    social_only: [
      "W.social_only",
      "Social page used as the website",
      config.website.socialOnly,
    ],
    link_in_bio: [
      "W.link_in_bio",
      "Link-in-bio page used as the website",
      config.website.linkInBio,
    ],
    retired_google_site: [
      "W.retired_site",
      "Website is a retired Google business.site page",
      config.website.retiredSite,
    ],
    unreachable: [
      "W.broken",
      "Website is broken or unreachable",
      config.website.broken,
    ],
  };
  const fx = fixed[ws];
  if (fx && wKey && has(wKey)) {
    website = {
      awarded: fx[2],
      checked: W.website,
      contributions: [
        { ruleId: fx[0], label: fx[1], points: fx[2], findingKeys: [wKey] },
      ],
      note: fx[1] + ".",
    };
  } else if (ws === "ok" && input.rubric && has("site.rubric")) {
    const dims = input.rubric.filter((d) =>
      config.website.rubricDimensions.includes(d.dimension),
    );
    if (dims.length) {
      const mean = dims.reduce((s, d) => s + d.score, 0) / dims.length;
      const pts = Math.round((config.website.existingSiteMax * (5 - mean)) / 5);
      website = {
        awarded: pts,
        checked: W.website,
        contributions:
          pts > 0
            ? [
                {
                  ruleId: "W.rubric",
                  label: `Existing website rated ${mean.toFixed(1)}/5 on the HL-BOS rubric`,
                  points: pts,
                  findingKeys: ["site.rubric"],
                },
              ]
            : [],
        note: `A working website: judged by the existing HL-BOS rubric (${dims.map((d) => `${d.dimension} ${d.score}/5`).join(", ")}); a working site can score at most ${config.website.existingSiteMax} of ${W.website}.`,
      };
    }
  } else if (ws === "blocked") {
    website = {
      awarded: 0,
      checked: 0,
      contributions: [],
      note: "Not checked: the website exists but could not be inspected.",
    };
  }

  // --- 2. Conversion gaps (vertical-specific) -----------------------------
  let conversion: Partial_ | null = null;
  if (NO_OWN_SITE.includes(ws) && wKey && has(wKey)) {
    conversion = {
      awarded: W.conversion,
      checked: W.conversion,
      contributions: [
        {
          ruleId: "C.no_own_site",
          label: "No website of its own to call, book, order or enquire from",
          points: W.conversion,
          findingKeys: [wKey],
        },
      ],
      note: "Without its own website, every online conversion path is missing.",
    };
  } else if (ws === "unreachable" && has("website.reachable")) {
    conversion = {
      awarded: W.conversion,
      checked: W.conversion,
      contributions: [
        {
          ruleId: "C.broken_site",
          label: "A broken website converts no visitors",
          points: W.conversion,
          findingKeys: ["website.reachable"],
        },
      ],
      note: "The website does not load, so no visitor can act on it.",
    };
  } else if (ws === "ok") {
    const rules = VERTICALS[input.vertical].conversion;
    const p: Partial_ = { awarded: 0, checked: 0, contributions: [], note: "" };
    const missing: string[] = [];
    for (const [k, pts] of Object.entries(rules) as [ConversionKey, number][]) {
      const key = `site.${k}`;
      const st = status(key);
      if (st === undefined || st === "not_checked" || st === "blocked") continue;
      p.checked += pts;
      if (st === "not_found" || st === "missing") {
        p.awarded += pts;
        missing.push(CONVERSION_LABELS[k]);
        p.contributions.push({
          ruleId: `C.missing_${k}`,
          label: `No ${CONVERSION_LABELS[k]} found`,
          points: pts,
          findingKeys: [key],
        });
      }
    }
    p.note = missing.length
      ? `${VERTICALS[input.vertical].label} rules. Not found on the homepage: ${missing.join(", ")}.`
      : `${VERTICALS[input.vertical].label} rules. Every checked conversion path was found.`;
    conversion = p;
  } else if (ws === "link_in_bio") {
    conversion = {
      awarded: 0,
      checked: 0,
      contributions: [],
      note: "Not checked: link-in-bio pages are not fetched, so their links were not inspected.",
    };
  }

  // --- 3. Reviews -----------------------------------------------------------
  let reviews: Partial_ | null = null;
  if (
    input.reviews &&
    (input.reviews.count !== undefined || input.reviews.rating !== undefined)
  ) {
    const r = config.reviews;
    const keys = input.reviews.findingKeys;
    const p: Partial_ = { awarded: 0, checked: 0, contributions: [], note: "" };
    const { count, rating } = input.reviews;
    const countMax = Math.max(r.points.none, r.points.veryFew, r.points.few);
    const ratingMax = Math.max(r.points.lowRating, r.points.belowRating);
    const notes: string[] = [];
    if (count !== undefined) {
      p.checked += countMax;
      notes.push(`${count} review${count === 1 ? "" : "s"}`);
      const rule: [string, string, number] | null =
        count === 0
          ? ["R.no_reviews", "No reviews", r.points.none]
          : count < r.veryFewBelow
            ? [
                "R.very_few_reviews",
                `Fewer than ${r.veryFewBelow} reviews (${count})`,
                r.points.veryFew,
              ]
            : count < r.fewBelow
              ? [
                  "R.few_reviews",
                  `Fewer than ${r.fewBelow} reviews (${count})`,
                  r.points.few,
                ]
              : null;
      if (rule) {
        p.awarded += rule[2];
        p.contributions.push({
          ruleId: rule[0],
          label: rule[1],
          points: rule[2],
          findingKeys: keys,
        });
      }
    }
    if (rating !== undefined) {
      p.checked += ratingMax;
      notes.push(`rated ${rating.toFixed(1)}`);
      const rule: [string, string, number] | null =
        rating < r.lowRatingBelow
          ? [
              "R.rating_low",
              `Rating ${rating.toFixed(1)} is below ${r.lowRatingBelow}`,
              r.points.lowRating,
            ]
          : rating < r.belowRatingBelow
            ? [
                "R.rating_below",
                `Rating ${rating.toFixed(1)} is below ${r.belowRatingBelow}`,
                r.points.belowRating,
              ]
            : null;
      if (rule) {
        p.awarded += rule[2];
        p.contributions.push({
          ruleId: rule[0],
          label: rule[1],
          points: rule[2],
          findingKeys: keys,
        });
      }
    } else if (count === 0) {
      // No reviews means no rating: the rating rule is answered, not unknown.
      p.checked += ratingMax;
    }
    p.note = `${notes.join(", ")}. Thresholds: fewer than ${r.fewBelow} reviews, rating below ${r.belowRatingBelow}.`;
    reviews = p;
  }

  // --- 4. Google profile completeness (Google Places only) -----------------
  let profile: Partial_;
  const pr = config.profile;
  const profileRules: [string, string, string, number][] = [
    ["places.website", "P.no_website", "Google profile lists no website", pr.website],
    ["places.phone", "P.no_phone", "Google profile lists no phone number", pr.phone],
    ["places.hours", "P.no_hours", "Google profile has no opening hours", pr.hours],
    ["places.photos", "P.no_photos", "Google profile has no photos", pr.photos],
  ];
  {
    const p: Partial_ = { awarded: 0, checked: 0, contributions: [], note: "" };
    for (const [key, rule, label, pts] of profileRules) {
      const st = status(key);
      if (st !== "present" && st !== "missing") continue;
      p.checked += pts;
      if (st === "missing") {
        p.awarded += pts;
        p.contributions.push({ ruleId: rule, label, points: pts, findingKeys: [key] });
      }
    }
    p.note = p.checked
      ? p.contributions.length
        ? `Missing from the Google listing: ${p.contributions.map((c) => c.label.replace(/^Google profile (lists no|has no) /, "")).join(", ")}.`
        : "The Google listing has a website, phone, hours and photos."
      : "Not checked: this business did not come from Google Places (or its Google data has expired).";
    profile = p;
  }

  // --- 5. Search basics -----------------------------------------------------
  let search: Partial_ | null = null;
  if ((NO_OWN_SITE.includes(ws) || ws === "link_in_bio") && wKey && has(wKey)) {
    search = {
      awarded: W.search,
      checked: W.search,
      contributions: [
        {
          ruleId: "S.no_own_site",
          label: "No website of its own for search engines to rank",
          points: W.search,
          findingKeys: [wKey],
        },
      ],
      note: "Search engines have no website of the business's own to rank.",
    };
  } else if (ws === "unreachable" && has("website.reachable")) {
    search = {
      awarded: W.search,
      checked: W.search,
      contributions: [
        {
          ruleId: "S.broken",
          label: "A broken website cannot rank",
          points: W.search,
          findingKeys: ["website.reachable"],
        },
      ],
      note: "Search engines drop pages that do not load.",
    };
  } else if (ws === "ok") {
    const s = config.search;
    const p: Partial_ = { awarded: 0, checked: 0, contributions: [], note: "" };
    const rules: [string, string, string, number][] = [
      ["site.title", "S.title", "Missing or weak page title", s.title],
      ["site.meta_description", "S.meta", "No meta description", s.meta],
      [
        "site.structured_data",
        "S.structured_data",
        "No structured data",
        s.structuredData,
      ],
      ["site.https", "S.https", "No HTTPS", s.https],
    ];
    for (const [key, rule, label, pts] of rules) {
      const st = status(key);
      if (st === undefined || st === "not_checked" || st === "blocked") continue;
      p.checked += pts;
      if (st === "missing" || st === "not_found") {
        p.awarded += pts;
        p.contributions.push({ ruleId: rule, label, points: pts, findingKeys: [key] });
      }
    }
    p.note = p.contributions.length
      ? `Gaps: ${p.contributions.map((c) => c.label.toLowerCase()).join(", ")}.`
      : "Title, description, structured data and HTTPS are all in place.";
    search = p;
  }

  // --- 6. Social presence and freshness -----------------------------------
  let social: Partial_ | null = null;
  if (ws === "ok") {
    const s = config.social;
    const p: Partial_ = { awarded: 0, checked: 0, contributions: [], note: "" };
    const links = status("site.social_links");
    if (links === "present" || links === "not_found") {
      p.checked += s.noLinks;
      if (links === "not_found") {
        p.awarded += s.noLinks;
        p.contributions.push({
          ruleId: "SF.no_social_links",
          label: "No links to social profiles",
          points: s.noLinks,
          findingKeys: ["site.social_links"],
        });
      }
    }
    const fresh = status("site.copyright");
    if (fresh === "present" || fresh === "missing") {
      p.checked += s.stale;
      if (fresh === "missing") {
        p.awarded += s.stale;
        p.contributions.push({
          ruleId: "SF.stale",
          label: "Website looks unmaintained (old copyright year)",
          points: s.stale,
          findingKeys: ["site.copyright"],
        });
      }
    }
    p.note =
      fresh === "not_checked"
        ? "Freshness not judged: no static copyright year on the homepage."
        : "";
    social = p;
  } else if (ws === "social_only" && has("website.social_only")) {
    social = {
      awarded: 0,
      checked: config.social.noLinks,
      contributions: [],
      note: "Has a social page (it is their website). Freshness not checked: social pages are never fetched.",
    };
  }

  const components = [
    component("website", W.website, website),
    component("conversion", W.conversion, conversion),
    component("reviews", W.reviews, reviews),
    component("profile", W.profile, profile),
    component("search", W.search, search),
    component("social", W.social, social),
  ];
  // checkedMax: exactly the points whose rules were evaluated.
  const checkedOf = (p: Partial_ | null, max: number) =>
    p ? Math.min(max, p.checked) : 0;
  const checkedMax =
    checkedOf(website, W.website) +
    checkedOf(conversion, W.conversion) +
    checkedOf(reviews, W.reviews) +
    checkedOf(profile, W.profile) +
    checkedOf(search, W.search) +
    checkedOf(social, W.social);
  const total = Math.max(
    0,
    Math.min(
      100,
      components.reduce((s, c) => s + c.awarded, 0),
    ),
  );
  return { version: config.version, total, checkedMax, components };
}

/** The three biggest contributions, for the Lead Board and the export. */
export function topFindings(score: OpportunityScore, n = 3): string[] {
  return score.components
    .flatMap((c) => c.contributions)
    .sort((a, b) => b.points - a.points || a.ruleId.localeCompare(b.ruleId))
    .slice(0, n)
    .map((c) => `${c.label} (+${c.points})`);
}

/** Configuration sanity: weights sum to 100 and no rule outweighs its component. */
export function validateConfig(c: ScoringConfig): string[] {
  const errors: string[] = [];
  const sum = Object.values(c.weights).reduce((s, w) => s + w, 0);
  if (sum !== 100) errors.push(`component weights sum to ${sum}, not 100`);
  for (const [k, v] of Object.entries(c.website))
    if (typeof v === "number" && v > c.weights.website)
      errors.push(`website.${k} (${v}) exceeds the website weight`);
  const p = c.profile;
  if (p.website + p.phone + p.hours + p.photos > c.weights.profile)
    errors.push("profile rules exceed the profile weight");
  const s = c.search;
  if (s.title + s.meta + s.structuredData + s.https > c.weights.search)
    errors.push("search rules exceed the search weight");
  if (c.social.noLinks + c.social.stale > c.weights.social)
    errors.push("social rules exceed the social weight");
  const r = c.reviews.points;
  if (
    Math.max(r.none, r.veryFew, r.few) + Math.max(r.lowRating, r.belowRating) >
    c.weights.reviews
  )
    errors.push("review rules exceed the reviews weight");
  for (const v of Object.values(VERTICALS)) {
    const t = Object.values(v.conversion).reduce((a, b) => a + b, 0);
    if (t !== c.weights.conversion)
      errors.push(`${v.key} conversion rules sum to ${t}, not ${c.weights.conversion}`);
  }
  return errors;
}
