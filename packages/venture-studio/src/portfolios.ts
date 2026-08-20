/**
 * HLVS portfolio definitions — which opportunities belong in which Top-100.
 *
 * A portfolio is a SAVED RANKED VIEW over the full discovery universe. It
 * selects; it never replaces. Nothing here removes, hides or rewrites a
 * corpus record: the 62,250 rows stay browsable in the Discovery Universe
 * whether or not they ever qualify for anything.
 *
 * The term lists below are the CEO's own vocabulary from the Phase 2
 * directive, kept verbatim where possible so the definition of "logistics" is
 * inspectable rather than buried in a query. `scripts/build-scoring-sql.mts`
 * generates the matching SQL from these arrays.
 *
 * MATCHING is deliberately simple and deterministic: a term matches if it
 * appears as a word in the category key, the repository name, the description
 * or the declared topics. No embeddings, no model, no judgement call — because
 * a ranking the CEO cannot re-derive is a ranking he cannot argue with.
 */

export interface PortfolioDefinition {
  key: string;
  label: string;
  /** Which score orders this list. Never a blend of the two. */
  rankBy: "popularity" | "suitability" | "pain";
  targetSize: number;
  /** Discovery categories that qualify outright. */
  categories: readonly string[];
  /**
   * Domain-DEFINING vocabulary. A record with none of these and no category
   * hit does not belong in the portfolio, however many supporting words it
   * happens to contain.
   */
  coreTerms: readonly string[];
  /**
   * Vocabulary that STRENGTHENS a match but cannot create one. "stats",
   * "streaming" and "schedule" appear in a media-server dashboard as readily
   * as in a sports product; on their own they are not evidence of a domain.
   */
  supportingTerms: readonly string[];
  /**
   * Existing HLG products this portfolio should be read against. Recorded so
   * an overlap is REPORTED, not resolved: overlap may mean reuse, integrate,
   * acquire, partner, improve — or pass. It never automatically means build.
   */
  hlgContext: readonly string[];
}

export const LOGISTICS: PortfolioDefinition = {
  key: "logistics",
  label: "Logistics, Supply Chain & Operations",
  rankBy: "suitability",
  targetSize: 100,
  categories: ["logistics", "fleet-management", "inventory", "manufacturing", "agriculture", "construction"],
  coreTerms: [
    "supply chain", "supply-chain", "logistics", "logistics-management", "transportation",
    "freight", "final mile", "last mile", "last-mile", "middle mile",
    "warehouse", "warehousing", "wms", "route optimization", "route planning",
    "routing", "dispatch", "dispatching", "fleet", "fleet management",
    "telematics", "delivery management", "courier", "shipment", "shipping",
    "3pl", "dsp", "procurement", "inventory", "stock management",
    "supplier", "field service", "field operations", "workforce management", "driver",
  ],
  supportingTerms: [
    "erp", "operations", "operational analytics", "scheduling", "tracking",
    "delivery", "purchasing", "vendor", "crew", "workforce",
  ],
  hlgContext: ["HSCS", "HL-BOS"],
};

export const TRANSFORMATION: PortfolioDefinition = {
  key: "transformation",
  label: "Business Transformation & Service Business",
  rankBy: "suitability",
  targetSize: 100,
  categories: [
    "crm", "erp", "marketing-automation", "email-marketing", "business-intelligence",
    "analytics-bi", "automation-workflow", "workflow-engine", "rpa", "no-code",
    "customer-support", "chat-messaging", "ecommerce", "point-of-sale",
    "accounting", "invoicing-billing", "subscription-billing", "saas-platforms",
    "hr-recruiting", "payroll", "project-management", "booking-appointments",
    "scheduling-calendars", "integration-ipaas",
  ],
  coreTerms: [
    "crm", "lead generation", "marketing automation", "email marketing", "customer communication",
    "workflow automation", "business process", "bpm", "rpa", "ai agent",
    "chatbot", "helpdesk", "ticketing", "customer service", "reputation",
    "business intelligence", "field service", "home services", "professional services", "vertical saas",
    "website builder", "site builder", "invoicing", "invoice", "billing",
    "quoting", "quote", "estimate", "booking", "appointment",
    "small business", "smb", "lms", "saas", "erp",
    "onboarding",
  ],
  supportingTerms: [
    "lead", "scheduling", "payments", "workflow", "agents",
    "analytics", "dashboard", "reporting", "reviews", "coaching",
    "course", "landing page",
  ],
  hlgContext: [
    "Herman Legacy Digital", "HLD Creative Studios",
    "Business Transformation Intelligence", "HL-BOS", "HSCS",
  ],
};

export const SPORTS: PortfolioDefinition = {
  key: "sports",
  label: "Sports, Youth Sports & Sports Media",
  rankBy: "suitability",
  targetSize: 100,
  categories: ["sports-technology", "sports-analytics", "esports", "fitness"],
  coreTerms: [
    "sports", "sport", "youth sports", "team management", "roster",
    "league", "league management", "tournament", "bracket", "fixture",
    "player development", "athlete", "recruiting", "scouting", "sports analytics",
    "game film", "video analysis", "performance tracking",
    "highlight", "highlights", "fan engagement", "field booking", "court booking",
    "soccer", "football", "basketball", "baseball", "hockey",
    "volleyball", "lacrosse", "softball", "wrestling", "gymnastics",
    "swimming",
  ],
  supportingTerms: [
    "schedule", "stats", "statistics", "broadcast", "broadcasting",
    "streaming", "sponsorship", "facility", "venue", "fan",
    "film", "track",
  ],
  hlgContext: [
    "HomeHuddle", "AthleteHuddle", "CoachesHuddle", "CoachAI",
    "BroadcastAI", "HighlightAI", "Venuewise", "5-Star Sports Media",
  ],
};

/**
 * Outside-core is defined by EXCLUSION and ranked on POPULARITY.
 *
 * Both choices are deliberate. Ranking it on HLG fit would recreate exactly
 * the tunnel vision the portfolio exists to break — the highest-fit outside
 * opportunities would be the ones that look most like what HLG already does.
 * Defining it by exclusion means it cannot quietly fill with logistics.
 */
export const OUTSIDE_CORE: PortfolioDefinition = {
  key: "outside-core",
  label: "Outside HLG Core Markets",
  rankBy: "popularity",
  targetSize: 100,
  categories: [],
  coreTerms: [],
  supportingTerms: [],
  hlgContext: [],
};

export const CORE_PORTFOLIOS: readonly PortfolioDefinition[] = [LOGISTICS, TRANSFORMATION, SPORTS];
export const ALL_PORTFOLIOS: readonly PortfolioDefinition[] = [
  LOGISTICS, TRANSFORMATION, SPORTS, OUTSIDE_CORE,
];

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

export interface MatchSubject {
  category: string | null;
  title: string;
  summary: string;
  topics: readonly string[];
}

export interface PortfolioMatch {
  /** 0-1 strength of the domain match; also feeds the suitability score. */
  value: number;
  /** Human-readable justification, stored on the member row. */
  basis: string;
  matchedTerms: string[];
  coreMatches: string[];
  categoryMatch: boolean;
}

/** Word-boundary containment, so "crm" does not match "scrmble". */
function containsTerm(haystack: string, term: string): boolean {
  const i = haystack.indexOf(term);
  if (i < 0) return false;
  const before = i === 0 ? " " : haystack[i - 1]!;
  const after = i + term.length >= haystack.length ? " " : haystack[i + term.length]!;
  const boundary = (c: string): boolean => !/[a-z0-9]/.test(c);
  return boundary(before) && boundary(after);
}

/** Every term a portfolio looks for, core and supporting together. */
export function allTerms(def: PortfolioDefinition): string[] {
  return [...def.coreTerms, ...def.supportingTerms];
}

/**
 * How strongly a corpus record belongs to a portfolio's domain.
 *
 * TWO KINDS OF EVIDENCE, and the distinction is what keeps the lists honest.
 * A discovery-category hit is PROVENANCE — the query that found the record was
 * itself a logistics query — so it qualifies on its own. Core vocabulary is
 * domain-defining and also qualifies. Supporting vocabulary only strengthens a
 * match that already exists.
 *
 * Without that rule a media-server dashboard matching "stats" and "streaming"
 * ranks first in Sports, which is exactly what the first build produced. A
 * Top-100 whose leader is obviously wrong discredits the ninety-nine below it,
 * so the fix is a qualification rule rather than a manual removal.
 *
 * Term hits saturate at four: a description mentioning "delivery" six times is
 * not four times more logistics than one mentioning it twice.
 */
export function matchPortfolio(
  subject: MatchSubject,
  def: PortfolioDefinition,
): PortfolioMatch {
  const category = (subject.category ?? "").toLowerCase();
  const categoryMatch = def.categories.includes(category);

  const haystack = [
    subject.title ?? "",
    subject.summary ?? "",
    ...(subject.topics ?? []),
  ]
    .join(" ")
    .toLowerCase()
    .replace(/[_/\\]+/g, " ");

  const coreMatches = def.coreTerms.filter((t) => containsTerm(haystack, t));
  const supporting = def.supportingTerms.filter((t) => containsTerm(haystack, t));
  const matchedTerms = [...coreMatches, ...supporting];

  // Supporting terms count half: present, but never sufficient.
  const strength = Math.min(4, coreMatches.length + 0.5 * supporting.length) / 4;

  let value: number;
  if (categoryMatch) {
    value = Math.min(1, 0.6 + 0.4 * strength);
  } else if (coreMatches.length >= MIN_CORE_TERMS_WITHOUT_CATEGORY) {
    value = Math.min(1, 0.35 + 0.65 * strength);
  } else {
    // Without provenance, one ordinary word is not a domain — and supporting
    // words alone certainly are not.
    value = 0;
  }

  let basis: string;
  if (categoryMatch) {
    basis =
      `discovery category "${category}" belongs to ${def.key}` +
      (matchedTerms.length ? `; also matched ${matchedTerms.slice(0, 5).join(", ")}` : "");
  } else if (coreMatches.length >= MIN_CORE_TERMS_WITHOUT_CATEGORY) {
    basis =
      `matched ${coreMatches.slice(0, 5).join(", ")}` +
      (supporting.length ? ` (supported by ${supporting.slice(0, 3).join(", ")})` : "");
  } else if (coreMatches.length) {
    basis = `only "${coreMatches[0]}" matched — one term is not a domain`;
  } else if (supporting.length) {
    basis = `only supporting terms matched (${supporting.slice(0, 4).join(", ")}) — not a domain match`;
  } else {
    basis = "no domain terms matched";
  }

  return {
    value,
    basis,
    matchedTerms: matchedTerms.slice(0, 12),
    coreMatches: coreMatches.slice(0, 12),
    categoryMatch,
  };
}

/**
 * The best core-domain match, used as the `domain_overlap` component of the
 * HLG suitability score. A record that looks like nothing HLG does scores low
 * here — which is correct, and is exactly why the outside-core portfolio ranks
 * on popularity instead.
 */
export function bestCoreMatch(subject: MatchSubject): {
  portfolio: string | null;
  value: number;
  basis: string;
} {
  let best: { portfolio: string | null; value: number; basis: string } = {
    portfolio: null,
    value: 0,
    basis: "no overlap with HLG's current domains",
  };
  for (const def of CORE_PORTFOLIOS) {
    const m = matchPortfolio(subject, def);
    if (m.value > best.value) best = { portfolio: def.key, value: m.value, basis: m.basis };
  }
  return best;
}

/** Minimum domain strength to qualify for a core portfolio at all. */
export const QUALIFICATION_THRESHOLD = 0.35;

/**
 * How many core terms a record needs when the discovery category gives no
 * provenance.
 *
 * ONE is not enough, and the first two builds showed why: an AI coding "coach"
 * kit topped Sports on the word coach; a data-"warehouse" query framework
 * ranked in Logistics; a salon POS qualified on "inventory". Each was a single
 * ordinary English word doing the work of a domain. Two independent
 * domain-defining terms is a far stronger signal and costs almost nothing in
 * recall, because a genuine logistics product says "warehouse" AND "inventory",
 * and a genuine sports product says "football" AND "league".
 *
 * A category hit is exempt: that is provenance from the discovery query
 * itself, not a guess made from prose.
 */
export const MIN_CORE_TERMS_WITHOUT_CATEGORY = 2;

/**
 * Outside-core qualification: strong enough to be interesting, and NOT already
 * claimed by a core domain. The threshold is the same one core portfolios use,
 * so a record is never in limbo — either it is core-domain enough to compete
 * there, or it is eligible here.
 */
export function qualifiesOutsideCore(subject: MatchSubject): boolean {
  return bestCoreMatch(subject).value < QUALIFICATION_THRESHOLD;
}
