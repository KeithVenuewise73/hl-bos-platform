/**
 * HLVS Public Pain Point engine — what are people publicly asking someone to
 * solve?
 *
 * This file IS the definition: the phrasings we search for, the themes we
 * cluster into, and the rule that assigns a signal to a theme. All of it in
 * source control, so a pain point can be re-derived rather than believed.
 *
 * ---------------------------------------------------------------------------
 * THE HARD RULE
 * ---------------------------------------------------------------------------
 * Never manufacture public demand. Every pain-point claim must be traceable to
 * evidence a person can open and read. That is why:
 *
 *   * a signal is only ever recorded WITH its public URL (the database
 *     enforces this with a NOT NULL, non-empty CHECK);
 *   * a cluster's counts are DERIVED from its signals, never typed in;
 *   * a cluster carries human_review_required = true until someone looks;
 *   * nothing here estimates market size, revenue, willingness to pay or
 *     number of affected users. Those are NOT YET RESEARCHED, and the schema
 *     has nowhere to put a guess.
 *
 * ---------------------------------------------------------------------------
 * WHY GITHUB ISSUES FIRST
 * ---------------------------------------------------------------------------
 * The directive lists many legitimate public sources — Reddit, forums, product
 * discussions, reviews, search interest. GitHub issues are the source this
 * platform can reach today, legitimately and without scraping: a public API,
 * public data, clear terms. Collecting from one real source and saying so
 * beats collecting from none and describing an architecture, and beats
 * claiming coverage we do not have. The SOURCE column exists precisely so the
 * next source slots in beside this one rather than replacing it.
 */

/** Bump when phrasings, themes or the assignment rule change. */
export const PAIN_ENGINE_VERSION = "2026-08-20-v1" as const;

/** The source key written to vstudio.pain_signals.source. */
export const PAIN_SOURCE_GITHUB_ISSUE = "github_issue" as const;

/**
 * The phrasings people actually use when they are asking for something that
 * does not exist. Taken from the CEO's brief and kept verbatim, because the
 * point is to find the CEO's signal, not a paraphrase of it.
 *
 * Each becomes a GitHub issue search. Quoted so the phrase matches as a
 * phrase — unquoted, "why isn't there an app" would match any issue containing
 * the word "app".
 */
export interface PainPhrase {
  id: string;
  /** The exact phrase, as a person would type it. */
  phrase: string;
  /** What kind of unmet need this phrasing tends to signal. */
  intent: "missing_product" | "missing_feature" | "manual_toil" | "cost" | "quality";
}

export const PAIN_PHRASES: readonly PainPhrase[] = [
  { id: "no-app", phrase: "why isn't there an app", intent: "missing_product" },
  { id: "no-app-2", phrase: "why is there no app", intent: "missing_product" },
  { id: "wish-app", phrase: "I wish this app would", intent: "missing_feature" },
  {
    id: "wish-there-was",
    phrase: "I wish there was a way to",
    intent: "missing_feature",
  },
  {
    id: "anyone-know",
    phrase: "does anyone know software that",
    intent: "missing_product",
  },
  {
    id: "anyone-know-2",
    phrase: "is there any software that",
    intent: "missing_product",
  },
  {
    id: "hate-manual",
    phrase: "I hate having to do this manually",
    intent: "manual_toil",
  },
  {
    id: "manually-every",
    phrase: "have to do this manually every",
    intent: "manual_toil",
  },
  { id: "better-way", phrase: "is there a better way to", intent: "quality" },
  { id: "why-not", phrase: "why does this software not", intent: "missing_feature" },
  { id: "costs-too-much", phrase: "this costs too much", intent: "cost" },
  { id: "too-expensive", phrase: "way too expensive for", intent: "cost" },
  { id: "need-something", phrase: "I need something that", intent: "missing_product" },
  { id: "tools-dont", phrase: "the existing tools don't", intent: "quality" },
  {
    id: "no-good-tool",
    phrase: "there is no good tool for",
    intent: "missing_product",
  },
  { id: "cant-find", phrase: "I can't find a tool that", intent: "missing_product" },
  { id: "workaround", phrase: "I have to use a workaround", intent: "manual_toil" },
  { id: "copy-paste", phrase: "copy and paste every time", intent: "manual_toil" },
  {
    id: "spreadsheet",
    phrase: "we still use a spreadsheet for",
    intent: "manual_toil",
  },
  {
    id: "frustrating",
    phrase: "this is really frustrating because",
    intent: "quality",
  },
];

/**
 * Build the GitHub issue-search query for one phrasing.
 *
 * Scoped to issues (not pull requests) and to a fixed date floor rather than a
 * relative one, so re-running the collector a month from now searches the same
 * window and the corpus stays comparable — the same rule the discovery matrix
 * follows.
 */
export const PAIN_SEARCH_FLOOR = "2024-01-01" as const;

export function painSearchQuery(p: PainPhrase): string {
  return `"${p.phrase}" type:issue created:>${PAIN_SEARCH_FLOOR}`;
}

export const PAIN_QUERIES: readonly { id: string; query: string; intent: string }[] =
  PAIN_PHRASES.map((p) => ({ id: p.id, query: painSearchQuery(p), intent: p.intent }));

// ---------------------------------------------------------------------------
// Clustering
// ---------------------------------------------------------------------------

/**
 * A pain THEME. Clustering here is deterministic keyword assignment against
 * this source-controlled list, not a model.
 *
 * That is a deliberate trade. A language model would produce more elegant
 * cluster names, and no way to check them: the CEO would be reading a
 * paraphrase and taking its accuracy on trust. This way every cluster's
 * membership rule is visible, re-runnable, and arguable. `title` and
 * `problemStatement` describe the theme we went looking for — they are never
 * generated from, or presented as a summary of, the evidence found.
 */
export interface PainTheme {
  key: string;
  title: string;
  problemStatement: string;
  keywords: readonly string[];
}

export const PAIN_THEMES: readonly PainTheme[] = [
  {
    key: "schedule-fragmentation",
    title: "Schedules live in closed systems that will not talk to each other",
    problemStatement:
      "People coordinating a household, a team or a small business keep the same schedule in several places because the systems holding it do not exchange data.",
    keywords: [
      "calendar",
      "schedule",
      "scheduling",
      "ical",
      "sync",
      "google calendar",
      "outlook",
      "availability",
      "booking",
      "reminder",
    ],
  },
  {
    key: "manual-data-entry",
    title: "Work that is still retyped by hand between systems",
    problemStatement:
      "Data exists in one system and is needed in another, and a person moves it manually because no integration exists.",
    keywords: [
      "manually",
      "copy paste",
      "re-enter",
      "retype",
      "spreadsheet",
      "csv",
      "export",
      "import",
      "data entry",
      "by hand",
    ],
  },
  {
    key: "integration-gaps",
    title: "Products that will not integrate with the tools already in use",
    problemStatement:
      "A tool solves its own problem but cannot be connected to the rest of the stack, so it becomes another island.",
    keywords: [
      "integration",
      "webhook",
      "api",
      "zapier",
      "connector",
      "plugin",
      "third party",
      "oauth",
      "sso",
    ],
  },
  {
    key: "pricing-pressure",
    title: "Pricing that puts a category out of reach for small operators",
    problemStatement:
      "The capable products are priced for enterprises, and smaller operators either go without or assemble something themselves.",
    keywords: [
      "expensive",
      "pricing",
      "price",
      "subscription",
      "per seat",
      "paywall",
      "licence",
      "license cost",
      "afford",
      "free tier",
    ],
  },
  {
    key: "self-hosting-control",
    title: "People want to run it themselves and cannot",
    problemStatement:
      "Users want data residency, offline capability or independence from a vendor, and the product is cloud-only.",
    keywords: [
      "self-hosted",
      "self host",
      "on-premise",
      "on premise",
      "offline",
      "local first",
      "docker",
      "privacy",
      "data ownership",
      "vendor lock",
    ],
  },
  {
    key: "reporting-visibility",
    title: "No usable view of what is actually happening",
    problemStatement:
      "Operational data is captured but cannot be seen: no report, no dashboard, no export that answers the question being asked.",
    keywords: [
      "report",
      "reporting",
      "dashboard",
      "analytics",
      "metrics",
      "visibility",
      "audit",
      "history",
      "log",
      "insight",
    ],
  },
  {
    key: "mobile-gap",
    title: "Desktop-only tools used by people who are not at a desk",
    problemStatement:
      "The work happens in the field, in a vehicle or on a sideline, and the software assumes a keyboard and a screen.",
    keywords: [
      "mobile",
      "android",
      "ios",
      "phone",
      "tablet",
      "app store",
      "responsive",
      "on the go",
      "field",
    ],
  },
  {
    key: "collaboration-permissions",
    title: "Tools built for one person, used by a group",
    problemStatement:
      "Several people need to work on the same thing with different levels of access, and the product has no model for it.",
    keywords: [
      "multi user",
      "multi-user",
      "permission",
      "role",
      "team",
      "share",
      "collaborate",
      "invite",
      "access control",
      "multi tenant",
    ],
  },
  {
    key: "notification-noise",
    title: "Alerting that is either silent or unbearable",
    problemStatement:
      "Notifications cannot be tuned, so people either miss what matters or turn everything off.",
    keywords: [
      "notification",
      "alert",
      "email digest",
      "push",
      "spam",
      "too many emails",
      "unsubscribe",
      "mute",
      "reminder",
    ],
  },
  {
    key: "migration-lockin",
    title: "Getting data out is harder than getting it in",
    problemStatement:
      "Users want to leave, consolidate or back up, and the export is missing, partial or unusable.",
    keywords: [
      "migrate",
      "migration",
      "export",
      "backup",
      "restore",
      "lock in",
      "lock-in",
      "leave",
      "portability",
      "archive",
    ],
  },
  {
    key: "setup-complexity",
    title: "Capable software that almost nobody can install",
    problemStatement:
      "The product would solve the problem, but reaching a working installation defeats the people who need it.",
    keywords: [
      "install",
      "setup",
      "configuration",
      "documentation",
      "getting started",
      "complicated",
      "steep learning",
      "onboarding",
      "tutorial",
    ],
  },
  {
    key: "performance-scale",
    title: "Works in a demo, fails at real volume",
    problemStatement:
      "The tool is adequate for a sample and unusable at the size of the actual data.",
    keywords: [
      "slow",
      "performance",
      "timeout",
      "memory",
      "large dataset",
      "scale",
      "hangs",
      "freezes",
      "crash",
    ],
  },
];

import { containsTerm } from "./portfolios";

/**
 * How many theme keywords a signal must match before it joins that theme.
 *
 * ONE is not enough. A note about music playing "automatically" matched
 * schedule-fragmentation on the single word "sync"; a font-rendering request
 * matched reporting-visibility on "log". The keyword lists are ordinary
 * English, so one hit is a coincidence and two is a subject — the same lesson
 * the portfolio matcher learned, applied here before the CEO reads the output
 * rather than after.
 */
export const MIN_KEYWORDS_PER_ASSIGNMENT = 2;

export interface PainSignalSubject {
  title: string;
  bodyExcerpt: string;
  labels: readonly string[];
}

export interface ThemeAssignment {
  theme: string | null;
  matchedKeywords: string[];
  /** How the assignment was reached, recorded on the signal. */
  basis: string;
}

/**
 * Assign one signal to at most one theme: the theme it shares the most
 * keywords with, ties broken by declaration order so the result is stable.
 *
 * A signal matching only ONE keyword is left unclustered too: one ordinary
 * word in common is a coincidence, not a shared subject.
 *
 * Anything unassigned is NULL rather than forced into the nearest bucket.
 * Those are counted and shown — an unclustered pile the CEO can see is honest;
 * quietly filing them under the closest-looking heading is not.
 */
export function assignTheme(subject: PainSignalSubject): ThemeAssignment {
  const haystack = [subject.title, subject.bodyExcerpt, ...(subject.labels ?? [])]
    .join(" ")
    .toLowerCase();

  let best: { theme: PainTheme; hits: string[] } | null = null;
  for (const theme of PAIN_THEMES) {
    // Word boundaries, not substrings. "ical" is a real calendar keyword and
    // also sits inside "automatically"; "log" sits inside "dialog". Without
    // this, ordinary prose matches almost every theme.
    const hits = theme.keywords.filter((k) => containsTerm(haystack, k));
    if (hits.length === 0) continue;
    if (!best || hits.length > best.hits.length) best = { theme, hits };
  }

  if (!best) {
    return {
      theme: null,
      matchedKeywords: [],
      basis:
        "matched no theme keywords — left unclustered rather than forced into the nearest bucket",
    };
  }
  if (best.hits.length < MIN_KEYWORDS_PER_ASSIGNMENT) {
    return {
      theme: null,
      matchedKeywords: best.hits,
      basis: `only "${best.hits[0]}" matched — one ordinary word in common is a coincidence, not a shared subject`,
    };
  }
  return {
    theme: best.theme.key,
    matchedKeywords: best.hits,
    basis: `matched ${best.hits.length} keyword${best.hits.length === 1 ? "" : "s"} for ${best.theme.key}: ${best.hits.slice(0, 5).join(", ")}`,
  };
}

/**
 * How many signals a theme needs before it is presented as a pain point.
 *
 * A single complaint is a person having a bad day. The whole premise is
 * RECURRENCE — "what are people, plural, publicly asking someone to solve" —
 * so a theme below this bar is kept and counted but not promoted.
 */
export const MIN_SIGNALS_PER_CLUSTER = 5;

/**
 * Engagement on a public complaint is itself evidence: an issue others reacted
 * to and replied to represents more people than one nobody answered. Used to
 * choose which signals to keep when a phrasing returns more than we store, and
 * recorded so the selection rule is inspectable rather than arbitrary.
 */
export function engagementWeight(
  reactions: number | null,
  comments: number | null,
): number {
  return (reactions ?? 0) + 2 * (comments ?? 0);
}

/** Fields a pain cluster cannot answer from collected evidence alone. */
export const NOT_YET_RESEARCHED_FOR_PAIN = [
  "market_size",
  "affected_audience_size",
  "willingness_to_pay",
  "existing_solution_pricing",
  "competitive_landscape",
  "revenue_potential",
] as const;
