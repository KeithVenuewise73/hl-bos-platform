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
  /** Terms matched against name, description and topics. */
  terms: readonly string[];
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
  terms: [
    "supply chain", "supply-chain", "logistics", "transportation", "freight",
    "final mile", "last mile", "last-mile", "middle mile", "warehouse",
    "warehousing", "wms", "routing", "route optimization", "route planning",
    "dispatch", "fleet", "fleet management", "telematics", "delivery",
    "delivery management", "courier", "shipping", "shipment", "tracking",
    "inventory", "stock management", "procurement", "purchasing", "vendor",
    "supplier", "3pl", "dsp", "driver", "crew", "scheduling", "dispatching",
    "field operations", "field service", "workforce", "workforce management",
    "operations", "operational analytics", "erp", "logistics-management",
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
  terms: [
    "crm", "lead", "lead generation", "marketing automation", "email marketing",
    "customer communication", "scheduling", "appointment", "booking", "quoting",
    "quote", "estimate", "invoice", "invoicing", "billing", "payments",
    "workflow", "workflow automation", "business process", "bpm", "rpa",
    "ai agent", "agents", "chatbot", "customer service", "helpdesk",
    "ticketing", "reputation", "reviews", "business intelligence", "analytics",
    "dashboard", "reporting", "field service", "home services", "professional services",
    "coaching", "course", "lms", "website builder", "site builder", "landing page",
    "vertical saas", "saas", "small business", "smb", "erp", "onboarding",
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
  terms: [
    "sports", "sport", "youth sports", "team management", "roster", "league",
    "league management", "tournament", "bracket", "fixture", "schedule",
    "coach", "coaching", "player development", "athlete", "recruiting",
    "scouting", "film", "video analysis", "game film", "sports analytics",
    "performance tracking", "stats", "statistics", "highlight", "highlights",
    "broadcast", "broadcasting", "streaming", "sponsorship", "fan",
    "fan engagement", "facility", "venue", "field booking", "court booking",
    "soccer", "football", "basketball", "baseball", "hockey", "volleyball",
    "lacrosse", "softball", "track", "swimming", "wrestling", "gymnastics",
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
  terms: [],
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

/**
 * How strongly a corpus record belongs to a portfolio's domain.
 *
 * A category hit is worth more than a term hit because the category was
 * assigned by the discovery query itself — it is provenance, not inference.
 * Term hits saturate at four: a description that mentions "delivery" six times
 * is not four times more logistics than one that mentions it twice.
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

  const matchedTerms = def.terms.filter((t) => containsTerm(haystack, t));
  const termValue = Math.min(matchedTerms.length, 4) / 4;
  const value = categoryMatch ? Math.min(1, 0.6 + 0.4 * termValue) : 0.7 * termValue;

  const basis = categoryMatch
    ? `discovery category "${category}" belongs to ${def.key}` +
      (matchedTerms.length ? `; also matched ${matchedTerms.slice(0, 5).join(", ")}` : "")
    : matchedTerms.length
      ? `matched ${matchedTerms.slice(0, 5).join(", ")}`
      : "no domain terms matched";

  return { value, basis, matchedTerms: matchedTerms.slice(0, 12), categoryMatch };
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
 * Outside-core qualification: strong enough to be interesting, and NOT already
 * claimed by a core domain. The threshold is the same one core portfolios use,
 * so a record is never in limbo — either it is core-domain enough to compete
 * there, or it is eligible here.
 */
export function qualifiesOutsideCore(subject: MatchSubject): boolean {
  return bestCoreMatch(subject).value < QUALIFICATION_THRESHOLD;
}
