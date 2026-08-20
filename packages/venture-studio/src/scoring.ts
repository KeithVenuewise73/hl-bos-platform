/**
 * HLVS Level-1 deterministic triage — the two scores.
 *
 * This file IS the scoring definition. Every weight, every normalization and
 * every threshold lives here so a ranking can be explained, argued with and
 * reproduced. `scripts/build-scoring-sql.mts` GENERATES the SQL that runs over
 * the corpus from these same constants, so the numbers the database computes
 * and the numbers these functions compute cannot drift apart.
 *
 * ---------------------------------------------------------------------------
 * WHY TWO SCORES AND NEVER ONE
 * ---------------------------------------------------------------------------
 * Popularity asks "is there evidence people care about this?".
 * HLG suitability asks "is Herman Legacy Group particularly positioned to do
 * something commercially useful with it?".
 *
 * A single blended number destroys the four answers that actually matter:
 *
 *   high popularity + high fit  -> strongest immediate candidates
 *   high popularity + low fit   -> strong OUTSIDE-CORE opportunities
 *   low popularity  + high fit  -> niche/strategic, worth a look
 *   low popularity  + low fit   -> archive/watch — never deleted
 *
 * Averaged, the second and third rows collapse into an indistinguishable
 * middle. So there is no combined score here, and no column in the database
 * to put one in.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS MEASURED AND WHAT IS INFERRED
 * ---------------------------------------------------------------------------
 * POPULARITY is `measured`: every component comes from a number GitHub
 * reported about a real repository.
 *
 * SUITABILITY is `estimated`, always — never `measured`. It is a structured
 * inference from observable properties (domain vocabulary, stack, licence,
 * scale, discovery pattern). Calling it measured would be a lie about its
 * epistemic status, and the database CHECK that ties score to status is what
 * keeps that lie unavailable.
 *
 * Neither score licenses any claim about market size, revenue, customers,
 * downloads, pricing or competitors. Those are NOT YET RESEARCHED until
 * someone researches them.
 */

/** Bump when any weight, threshold or term list below changes. */
export const SCORING_VERSION = "2026-08-20-v1" as const;

/** Every score in this module is an integer percentage. */
export type Score = number;

export interface ScoreComponent {
  component: string;
  /** Normalized 0-1 value of this component before weighting. */
  value: number;
  /** Weight out of 100. */
  weight: number;
  /** value * weight, rounded for display. */
  contribution: number;
  /** Where the value came from, in plain language. */
  basis: string;
}

/** The measured facts a Level-1 score is computed from. */
export interface ScoringInput {
  stars: number | null;
  forks: number | null;
  openIssues: number | null;
  pushedAt: string | null;
  archived: boolean;
  topics: readonly string[];
  license: string | null;
  language: string | null;
  category: string | null;
  searchPattern: string | null;
  /** Percentile of this repo's stars within its own category, 0-1. */
  starsPercentileInCategory: number | null;
  /** Percentile of this repo's forks within its own category, 0-1. */
  forksPercentileInCategory: number | null;
  /** Reference date for recency, so scoring is reproducible. */
  asOf: string;
}

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

export const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Log normalization. Stars are power-law distributed: the gap between 10 and
 * 1,000 stars means far more than the gap between 200,000 and 201,000, and a
 * linear scale would make every category a referendum on whichever repository
 * happens to be the most famous.
 */
export function logNormalize(value: number | null, ceiling: number): number {
  if (value === null || value < 0) return 0;
  return clamp01(Math.log10(value + 1) / Math.log10(ceiling + 1));
}

/**
 * Blend a global log scale with the repository's rank inside its own category.
 *
 * The CEO's instruction was explicit: one giant repository must not dominate
 * every category merely because it has the most lifetime stars. The global
 * half keeps a 200,000-star project ahead of a 200-star one; the
 * within-category half means a category's best is visible even when that
 * category's ceiling is lower. Neither half alone gets this right — a pure
 * global scale buries every small category, and a pure percentile makes the
 * top of a nine-row category look identical to the top of a 3,737-row one.
 */
export function blendGlobalAndCategory(
  global: number,
  percentileInCategory: number | null,
): number {
  if (percentileInCategory === null) return clamp01(global);
  return clamp01(0.5 * global + 0.5 * clamp01(percentileInCategory));
}

/**
 * Recency of the last push, decaying to zero over three years. Not a cliff:
 * a repository that went quiet 13 months ago is less current than one pushed
 * yesterday, but it is not worthless — the ABANDONED pattern exists precisely
 * because a stalled project with real users is an opportunity.
 */
export const RECENCY_HORIZON_DAYS = 1095;

export function recencyValue(
  pushedAt: string | null,
  asOf: string,
): { value: number; days: number | null } {
  if (!pushedAt) return { value: 0, days: null };
  const then = Date.parse(pushedAt);
  const now = Date.parse(asOf);
  if (Number.isNaN(then) || Number.isNaN(now)) return { value: 0, days: null };
  const days = Math.max(0, (now - then) / 86_400_000);
  return { value: clamp01(1 - days / RECENCY_HORIZON_DAYS), days };
}

// ---------------------------------------------------------------------------
// POPULARITY / MARKET EVIDENCE
// ---------------------------------------------------------------------------

export const POPULARITY_WEIGHTS = {
  stars: 35,
  forks: 20,
  issueActivity: 10,
  recency: 30,
  topicBreadth: 5,
} as const;

/** Ceilings for log normalization, set above the largest values in the corpus. */
export const POPULARITY_CEILINGS = {
  stars: 500_000,
  forks: 100_000,
  openIssues: 10_000,
  topics: 10,
} as const;

export interface ScoreResult {
  score: Score | null;
  status: "measured" | "estimated" | "unknown";
  components: ScoreComponent[];
}

const component = (
  name: string,
  value: number,
  weight: number,
  basis: string,
): ScoreComponent => ({
  component: name,
  value: Number(value.toFixed(4)),
  weight,
  contribution: Number((value * weight).toFixed(2)),
  basis,
});

/**
 * Popularity is only computable where the metrics exist. The 36 opportunities
 * captured before discovery ran carry no repository metrics at all, and they
 * score `null` / `unknown` rather than zero — a research note is not an
 * unpopular repository, and scoring it 0 would rank it below genuinely dead
 * projects on evidence we never had.
 */
export function popularityScore(input: ScoringInput): ScoreResult {
  const measurable =
    input.stars !== null || input.forks !== null || input.openIssues !== null;
  if (!measurable) {
    return { score: null, status: "unknown", components: [] };
  }

  const starsGlobal = logNormalize(input.stars, POPULARITY_CEILINGS.stars);
  const stars = blendGlobalAndCategory(starsGlobal, input.starsPercentileInCategory);

  const forksGlobal = logNormalize(input.forks, POPULARITY_CEILINGS.forks);
  const forks = blendGlobalAndCategory(forksGlobal, input.forksPercentileInCategory);

  const issues = logNormalize(input.openIssues, POPULARITY_CEILINGS.openIssues);
  const { value: recency, days } = recencyValue(input.pushedAt, input.asOf);
  const topics = clamp01((input.topics?.length ?? 0) / POPULARITY_CEILINGS.topics);

  const components: ScoreComponent[] = [
    component(
      "stars",
      stars,
      POPULARITY_WEIGHTS.stars,
      `${input.stars ?? 0} stars — log-normalized and blended with rank inside ${input.category ?? "its category"}`,
    ),
    component(
      "forks",
      forks,
      POPULARITY_WEIGHTS.forks,
      `${input.forks ?? 0} forks — people copying it to build on it`,
    ),
    component(
      "issue_activity",
      issues,
      POPULARITY_WEIGHTS.issueActivity,
      `${input.openIssues ?? 0} open issues — traffic and unmet need, not defect count`,
    ),
    component(
      "recency",
      recency,
      POPULARITY_WEIGHTS.recency,
      days === null
        ? "no push date recorded"
        : `last pushed ${Math.round(days)} days ago, decaying over ${RECENCY_HORIZON_DAYS}`,
    ),
    component(
      "topic_breadth",
      topics,
      POPULARITY_WEIGHTS.topicBreadth,
      `${input.topics?.length ?? 0} declared topics`,
    ),
  ];

  const total = components.reduce((a, c) => a + c.value * c.weight, 0);
  return { score: Math.round(clamp01(total / 100) * 100), status: "measured", components };
}

// ---------------------------------------------------------------------------
// HLG SUITABILITY
// ---------------------------------------------------------------------------

export const SUITABILITY_WEIGHTS = {
  domainOverlap: 35,
  stackReuse: 15,
  licenceCommercial: 15,
  buildability: 10,
  maintenanceOpening: 10,
  monetizationSurface: 15,
} as const;

/**
 * Licences, graded by whether HLG could commercialize work derived from the
 * project. This is a legal-shape signal, not legal advice, and it is one
 * input among six.
 */
export const PERMISSIVE_LICENCES = [
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "0BSD",
  "Unlicense",
  "MPL-2.0",
  "Zlib",
  "BSL-1.0",
  "PostgreSQL",
  "Artistic-2.0",
  "CC0-1.0",
] as const;

/** Copyleft licences constrain commercial derivation; they do not forbid study. */
export const COPYLEFT_LICENCES = [
  "GPL-2.0",
  "GPL-3.0",
  "AGPL-3.0",
  "LGPL-2.1",
  "LGPL-3.0",
  "EUPL-1.2",
  "OSL-3.0",
  "CC-BY-SA-4.0",
] as const;

export function licenceValue(license: string | null): { value: number; basis: string } {
  if (!license || license === "NOASSERTION") {
    return { value: 0.25, basis: "no clear licence declared — reuse terms unknown" };
  }
  if ((PERMISSIVE_LICENCES as readonly string[]).includes(license)) {
    return { value: 1, basis: `${license} — permissive, derived work can be commercialized` };
  }
  if ((COPYLEFT_LICENCES as readonly string[]).includes(license)) {
    return { value: 0.3, basis: `${license} — copyleft, constrains commercial derivation` };
  }
  return { value: 0.5, basis: `${license} — non-standard terms, needs review` };
}

/** Languages and runtimes HL-BOS already builds and operates in. */
export const HLG_STACK = [
  "TypeScript",
  "JavaScript",
  "SQL",
  "PLpgSQL",
  "Python",
  "Shell",
  "HTML",
  "CSS",
] as const;

export function stackValue(language: string | null): { value: number; basis: string } {
  if (!language) return { value: 0.3, basis: "no primary language reported" };
  if ((HLG_STACK as readonly string[]).includes(language)) {
    return { value: 1, basis: `${language} — the stack HL-BOS already runs` };
  }
  return { value: 0.35, basis: `${language} — outside the HL-BOS stack, adds operating surface` };
}

/**
 * Buildability. A 300,000-star platform is not something HLG builds a
 * competitor to in a quarter; a 40-star weekend script has proved nothing.
 * The sweet spot is a project with demonstrated traction at a scale a small
 * team could match or better, so this peaks in the middle rather than
 * rewarding either extreme.
 */
export const BUILDABILITY_PEAK_STARS = 3_000;

export function buildabilityValue(stars: number | null): { value: number; basis: string } {
  if (stars === null) return { value: 0.3, basis: "scale unknown" };
  const s = Math.log10(stars + 1);
  const peak = Math.log10(BUILDABILITY_PEAK_STARS + 1);
  // Triangular around the peak on the log scale, floored so nothing is zeroed
  // out purely for being large — a giant is still worth understanding.
  const distance = Math.abs(s - peak) / peak;
  return {
    value: clamp01(1 - 0.7 * distance),
    basis: `${stars} stars — proven-but-matchable scale peaks near ${BUILDABILITY_PEAK_STARS}`,
  };
}

/**
 * A stalled or thin project that people still use is the clearest opening
 * HLG has: take it over, improve it, or build the maintained alternative.
 * That is what the ABANDONED and UNDERDEVELOPED patterns were searching for,
 * so the pattern that found a record is itself evidence.
 */
export function maintenanceValue(
  pattern: string | null,
  archived: boolean,
  stars: number | null,
): { value: number; basis: string } {
  const traction = clamp01(logNormalize(stars, 20_000));
  if (archived) {
    return { value: clamp01(0.6 + 0.4 * traction), basis: "archived upstream with existing users" };
  }
  if (pattern === "ABANDONED") {
    return { value: clamp01(0.5 + 0.5 * traction), basis: "found by the ABANDONED pattern" };
  }
  if (pattern === "UNDERDEVELOPED") {
    return { value: clamp01(0.35 + 0.5 * traction), basis: "found by the UNDERDEVELOPED pattern" };
  }
  if (pattern === "ALTERNATIVES") {
    return { value: clamp01(0.3 + 0.4 * traction), basis: "positioned as an alternative to an incumbent" };
  }
  return { value: 0.15 * (1 + traction), basis: `pattern ${pattern ?? "unknown"} — actively maintained` };
}

/** Topics that indicate a shape someone already charges money for. */
export const MONETIZABLE_TOPICS = [
  "saas", "self-hosted", "selfhosted", "crm", "erp", "billing", "invoicing",
  "subscription", "payments", "booking", "scheduling", "marketplace",
  "analytics", "dashboard", "automation", "workflow", "api", "b2b",
  "multi-tenant", "multitenant", "enterprise", "no-code", "low-code",
] as const;

export function monetizationValue(
  topics: readonly string[],
  pattern: string | null,
): { value: number; basis: string } {
  const lower = (topics ?? []).map((t) => t.toLowerCase());
  const hits = (MONETIZABLE_TOPICS as readonly string[]).filter((t) => lower.includes(t));
  const patternBoost = pattern === "SELF-HOSTED" || pattern === "ALTERNATIVES" ? 0.3 : 0;
  const value = clamp01(hits.length / 4 + patternBoost);
  return {
    value,
    basis:
      hits.length > 0
        ? `commercial-shape topics: ${hits.slice(0, 6).join(", ")}`
        : patternBoost > 0
          ? `found by the ${pattern} pattern, which targets paid-alternative shapes`
          : "no commercial-shape topics declared",
  };
}

/**
 * HLG suitability. `domainOverlap` is supplied by the portfolio matcher (see
 * ./portfolios) because "does this look like logistics?" is the same question
 * portfolio qualification asks, and answering it twice differently would let
 * a record rank into a portfolio it does not belong in.
 *
 * The status is ALWAYS `estimated`. This is a structured inference from
 * observable properties, and pretending otherwise would be the exact kind of
 * invention the brief forbids.
 */
export function suitabilityScore(
  input: ScoringInput,
  domainOverlap: { value: number; basis: string },
): ScoreResult {
  const licence = licenceValue(input.license);
  const stack = stackValue(input.language);
  const build = buildabilityValue(input.stars);
  const maintenance = maintenanceValue(input.searchPattern, input.archived, input.stars);
  const money = monetizationValue(input.topics, input.searchPattern);

  const components: ScoreComponent[] = [
    component("domain_overlap", clamp01(domainOverlap.value), SUITABILITY_WEIGHTS.domainOverlap, domainOverlap.basis),
    component("stack_reuse", stack.value, SUITABILITY_WEIGHTS.stackReuse, stack.basis),
    component("licence_commercial", licence.value, SUITABILITY_WEIGHTS.licenceCommercial, licence.basis),
    component("buildability", build.value, SUITABILITY_WEIGHTS.buildability, build.basis),
    component("maintenance_opening", maintenance.value, SUITABILITY_WEIGHTS.maintenanceOpening, maintenance.basis),
    component("monetization_surface", money.value, SUITABILITY_WEIGHTS.monetizationSurface, money.basis),
  ];

  const total = components.reduce((a, c) => a + c.value * c.weight, 0);
  return {
    score: Math.round(clamp01(total / 100) * 100),
    // Never "measured". See the file header.
    status: "estimated",
    components,
  };
}

/**
 * The executive-card fields Level-1 triage does NOT and CANNOT answer. The UI
 * renders these as NOT YET RESEARCHED rather than leaving a suggestive blank,
 * because a blank field reads as "nothing to report" and these are "nobody has
 * looked yet" — a difference the CEO has to be able to see.
 */
export const NOT_YET_RESEARCHED_AT_LEVEL_1 = [
  "problem_solved",
  "target_customer",
  "why_users_care",
  "competitive_landscape",
  "existing_hlg_components_reusable",
  "estimated_mvp_effort",
  "monetization_paths",
  "likely_pricing_model",
  "acquisition_potential",
  "partnership_potential",
  "build_and_sell_potential",
  "principal_risks",
  "recommended_action",
] as const;
