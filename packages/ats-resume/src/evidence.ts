/**
 * EvidenceMatcher — the evidence matrix, and the terminology opportunities
 * that fall out of building it.
 *
 * The matrix is the centre of the product. Every row answers one question
 * honestly: for this requirement, what has the candidate actually done, where
 * does that come from, and how far does it go? A row with no evidence says so
 * in plain words and is never quietly upgraded by a keyword appearing
 * somewhere else in the document.
 *
 * Two rules are enforced here rather than left to the caller:
 *
 *   1. Credential-shaped requirements (certifications, licences, degrees,
 *      named software) require a LITERAL hit. Token overlap is not allowed to
 *      conjure a PMP or a CDL out of the word "management".
 *   2. A terminology match is not a match on the job's words — it is a match
 *      on the candidate's work, reported in the job's words, and only when the
 *      candidate's own material contains the underlying evidence.
 */

import {
  ABBREVIATION_EXPANSIONS,
  ADJACENT_CONCEPTS,
  CERTIFICATION_VOCAB,
  SOFTWARE_VOCAB,
  TERMINOLOGY_GROUPS,
  findVocabulary,
  type AdjacentConcept,
  type TerminologyGroup,
} from "./vocabulary.ts";
import {
  coverage as coverageOf,
  newId,
  normalize,
  stem,
  tokenize,
  unique,
} from "./text.ts";
import type {
  CareerFact,
  JobRequirement,
  MatchStatus,
  RequirementMatch,
  SectionKind,
  TerminologyOpportunity,
} from "./types.ts";

// Tuned against the demo dataset after the first end-to-end run: at 0.6/0.3
// over EVERY token of a requirement sentence, nothing scored as a strong match,
// because a long requirement sentence is mostly connective text. Coverage is
// now measured over the requirement's distinctive terms only.
const STRONG_THRESHOLD = 0.5;
const PARTIAL_THRESHOLD = 0.25;

/**
 * Words that appear in every job posting ever written. They carry no matching
 * signal, and including them in the denominator made real matches look weak.
 */
const GENERIC_REQUIREMENT_TERMS: ReadonlySet<string> = new Set(
  [
    "experience",
    "experienced",
    "year",
    "years",
    "ability",
    "able",
    "strong",
    "work",
    "working",
    "knowledge",
    "demonstrated",
    "proven",
    "related",
    "field",
    "plus",
    "minimum",
    "required",
    "requirement",
    "preferred",
    "excellent",
    "solid",
    "track",
    "record",
    "including",
    "include",
    "across",
    "within",
    "team",
    "teams",
    "role",
    "level",
    "high",
    "detail",
    "oriented",
    "environment",
    "fast",
    "paced",
    "paces",
    "responsible",
    "responsibilities",
    "skill",
    "skills",
    "understanding",
    "familiarity",
    "candidate",
    "position",
    "company",
    "business",
    "support",
    "new",
    "day",
    "daily",
    "must",
    "help",
  ].map(stem),
);

interface FactIndexEntry {
  readonly fact: CareerFact;
  readonly stems: Set<string>;
  readonly normalized: string;
}

export interface EvidenceIndex {
  readonly entries: readonly FactIndexEntry[];
  /** Every fact's text, normalised and concatenated — for literal lookups. */
  readonly corpus: string;
}

export function buildEvidenceIndex(facts: readonly CareerFact[]): EvidenceIndex {
  const entries = facts.map((fact) => {
    const tokens = tokenize(`${fact.text} ${fact.context ?? ""}`);
    const stems = new Set(tokens.map(stem));
    // Same fact, different letters: "B.S." is a bachelor's degree.
    for (const token of tokens) {
      // "B.S." arrives as "b.s." — look the bare letters up as well.
      const bare = token.replace(/\./g, "");
      const expansions =
        ABBREVIATION_EXPANSIONS.get(token) ?? ABBREVIATION_EXPANSIONS.get(bare) ?? [];
      for (const expansion of expansions) stems.add(stem(expansion));
    }
    return {
      fact,
      stems,
      normalized: normalize(`${fact.text} ${fact.context ?? ""}`),
    };
  });
  return {
    entries,
    corpus: ` ${entries.map((e) => e.normalized).join(" | ")} `,
  };
}

/** Does the corpus literally contain this phrase? */
export function corpusContains(index: EvidenceIndex, phrase: string): boolean {
  const needle = normalize(phrase);
  if (needle.length === 0) return false;
  return index.corpus.includes(` ${needle} `) || index.corpus.includes(`${needle} `);
}

/**
 * The terms a requirement is really about.
 *
 * If stripping the generic words leaves too little to judge on, the full term
 * list is used instead — a short requirement like "CDL required" is all signal.
 */
function keyTerms(requirement: JobRequirement): Set<string> {
  const distinctive = requirement.terms.filter(
    (t) => t.length > 2 && !GENERIC_REQUIREMENT_TERMS.has(t),
  );
  const fallback = requirement.terms.filter((t) => t.length > 2);
  return new Set(distinctive.length >= 2 ? distinctive : fallback);
}

/** Requirements whose satisfaction cannot be inferred, only evidenced. */
function literalTermsRequired(requirement: JobRequirement): string[] {
  if (requirement.kind === "certification") {
    return findVocabulary(requirement.text, CERTIFICATION_VOCAB);
  }
  if (requirement.kind === "software") {
    return findVocabulary(requirement.text, SOFTWARE_VOCAB);
  }
  return [];
}

function terminologyGroupsFor(requirement: JobRequirement): TerminologyGroup[] {
  const text = normalize(requirement.text);
  return TERMINOLOGY_GROUPS.filter((group) =>
    group.job.some((phrase) => text.includes(normalize(phrase))),
  );
}

/**
 * An adjacent concept fires when the posting asks for X, the candidate can
 * evidence something NEAR X, and X itself is nowhere in their material. That
 * is precisely the situation in which a rewrite would inflate a claim, so the
 * matrix reports it as partial and says exactly what the difference is.
 */
function adjacentConceptFor(
  requirement: JobRequirement,
  index: EvidenceIndex,
): { readonly concept: AdjacentConcept; readonly entry: FactIndexEntry } | undefined {
  const text = normalize(requirement.text);
  for (const concept of ADJACENT_CONCEPTS) {
    const asked = concept.job.some((phrase) => text.includes(normalize(phrase)));
    if (!asked) continue;
    // If the candidate can evidence the thing itself, this is not adjacency.
    if (concept.job.some((phrase) => corpusContains(index, phrase))) continue;
    const entry = index.entries.find((e) =>
      concept.evidence.some((phrase) => e.normalized.includes(normalize(phrase))),
    );
    if (entry !== undefined) return { concept, entry };
  }
  return undefined;
}

function evidenceForGroup(
  index: EvidenceIndex,
  group: TerminologyGroup,
): { readonly entry: FactIndexEntry; readonly hits: number } | undefined {
  let best: { entry: FactIndexEntry; hits: number } | undefined;
  for (const entry of index.entries) {
    const hits = group.evidence.filter((phrase) =>
      entry.normalized.includes(normalize(phrase)),
    ).length;
    if (hits === 0) continue;
    if (best === undefined || hits > best.hits) best = { entry, hits };
  }
  return best;
}

/**
 * Rewrite a real bullet in the job's terminology.
 *
 * The construction is a LABEL, not a splice: the posting's phrasing is placed
 * in front of the candidate's own sentence, which survives word for word.
 *
 * An earlier version spliced the phrase in after the leading verb — "Managed
 * fleet and transportation operations, including drivers and 85 daily routes"
 * — which reads well when it works. Run against real bullets it produced
 * "Cut warehouse and distribution operations, including dock dwell time by
 * 27%" and "Built third-party and contractor management, including and ran
 * multi-site delivery networks". Grafting a noun phrase onto an arbitrary verb
 * is a grammar problem, not a resume problem, and getting it wrong puts broken
 * English in front of a recruiter. The label form is correct for every verb,
 * leads with the keyword an ATS is scanning for, and — the part that matters —
 * cannot change what the sentence claims.
 */
export function rewriteWithTerminology(
  original: string,
  group: TerminologyGroup,
): string {
  const trimmed = original.replace(/\s+/g, " ").trim().replace(/\.$/, "");
  if (!shouldRewrite(trimmed, group)) return `${trimmed}.`;
  return `${capitalizeFirst(group.preferred)} — ${lowerFirst(trimmed)}.`;
}

/**
 * False when the bullet already says it.
 *
 * Relabelling "Rebuilt the safety program after a 2020 audit" as "Safety
 * program management — rebuilt the safety program after a 2020 audit" adds
 * nothing but repetition, so the original is left alone.
 */
export function shouldRewrite(original: string, group: TerminologyGroup): boolean {
  const originalStems = new Set(tokenize(original).map(stem));
  const preferredStems = tokenize(group.preferred).map(stem);
  if (preferredStems.length === 0) return false;
  const present = preferredStems.filter((t) => originalStems.has(t)).length;
  return present / preferredStems.length < 0.67;
}

function lowerFirst(text: string): string {
  if (text.length === 0) return text;
  const first = text[0] ?? "";
  // Leave acronyms and proper nouns alone.
  if (text.length > 1 && text.slice(0, 2) === text.slice(0, 2).toUpperCase())
    return text;
  return first.toLowerCase() + text.slice(1);
}

function capitalizeFirst(text: string): string {
  if (text.length === 0) return text;
  return (text[0] ?? "").toUpperCase() + text.slice(1);
}

function placementFor(requirement: JobRequirement, status: MatchStatus): SectionKind[] {
  if (status === "not_evidenced") return [];
  switch (requirement.kind) {
    case "certification":
      return ["certifications", "skills"];
    case "education":
      return ["education"];
    case "software":
      return ["skills", "experience"];
    case "leadership":
    case "scope":
      return ["summary", "experience"];
    case "soft_skill":
      return ["experience"];
    case "responsibility":
      return ["experience"];
    default:
      return ["experience", "skills"];
  }
}

function actionFor(
  requirement: JobRequirement,
  status: MatchStatus,
  group: TerminologyGroup | undefined,
): string {
  switch (status) {
    case "strong_match":
      return requirement.importance === "critical"
        ? "Keep and lead with it — surface this in the summary and the top bullet of the most relevant role."
        : "Keep. Mirror the posting's wording where your own bullet already says the same thing.";
    case "terminology_match":
      return group === undefined
        ? "Rewrite using the posting's wording; the underlying experience is already on the resume."
        : `Rewrite using "${group.preferred}" wording — the experience is evidenced, the phrasing is not.`;
    case "partial_match":
      return "Expand the existing bullet with the specifics you already have (scope, volume, result). Do not add anything new.";
    case "not_evidenced":
      return requirement.importance === "critical"
        ? "Not evidenced. If you have this experience, add it to your profile as a confirmed fact — it will not be written for you."
        : "Not evidenced. Leave it out of the resume; be ready to speak to it if asked.";
    default:
      return "";
  }
}

export interface EvidenceResult {
  readonly matches: readonly RequirementMatch[];
  readonly terminology: readonly TerminologyOpportunity[];
}

export function matchRequirements(
  requirements: readonly JobRequirement[],
  facts: readonly CareerFact[],
): EvidenceResult {
  const index = buildEvidenceIndex(facts);
  const matches: RequirementMatch[] = [];
  const opportunities = new Map<string, TerminologyOpportunity>();

  for (const requirement of requirements) {
    if (requirement.importance === "informational") continue;

    const need = keyTerms(requirement);
    let best: { entry: FactIndexEntry; score: number } | undefined;
    for (const entry of index.entries) {
      const score = coverageOf(need, entry.stems);
      if (best === undefined || score > best.score) best = { entry, score };
    }

    const literals = literalTermsRequired(requirement);
    const literalsPresent =
      literals.length === 0 || literals.some((term) => corpusContains(index, term));

    // The strongest terminology group wins, not the first one declared — an
    // earlier version relabelled a middle-mile bullet as "KPI management"
    // simply because that group happened to be checked first.
    const requirementText = normalize(requirement.text);
    const scoredGroups = terminologyGroupsFor(requirement)
      .map((group) => ({
        group,
        hit: evidenceForGroup(index, group),
        // Where the posting's own phrase appears. A requirement is about its
        // head noun phrase: "Own FLEET MANAGEMENT ... across four distribution
        // centers" is a fleet requirement, not a warehouse one, and ranking by
        // evidence hits alone picked the wrong group for exactly that line.
        position: Math.min(
          ...group.job.map((phrase) => {
            const at = requirementText.indexOf(normalize(phrase));
            return at < 0 ? Number.MAX_SAFE_INTEGER : at;
          }),
        ),
      }))
      .filter(
        (
          g,
        ): g is {
          group: TerminologyGroup;
          hit: { entry: FactIndexEntry; hits: number };
          position: number;
        } => g.hit !== undefined,
      )
      .sort((a, b) =>
        a.position !== b.position ? a.position - b.position : b.hit.hits - a.hit.hits,
      );
    const firedGroup = scoredGroups[0]?.group;
    const groupEntry = scoredGroups[0]?.hit.entry;

    const adjacent = adjacentConceptFor(requirement, index);
    const rawScore = best?.score ?? 0;

    // A short requirement has no room for partial credit. "Proven fleet
    // management experience" reduces to {fleet, manage}, and half of that is
    // the word "managed" — which was enough to call it a strong match until
    // this rule was added. Short requirements must be covered completely.
    const strongThreshold = need.size <= 3 ? 1 : STRONG_THRESHOLD;

    let status: MatchStatus;
    if (!literalsPresent) {
      status = "not_evidenced";
    } else if (adjacent !== undefined && rawScore < strongThreshold) {
      // Adjacency outranks a terminology rewrite on purpose: where the two
      // disagree, the safer reading wins.
      status = "partial_match";
    } else if (rawScore >= strongThreshold) {
      status = "strong_match";
    } else if (firedGroup !== undefined) {
      status = "terminology_match";
    } else if (rawScore >= PARTIAL_THRESHOLD) {
      status = "partial_match";
    } else {
      status = "not_evidenced";
    }

    const isAdjacent = status === "partial_match" && adjacent !== undefined;
    const chosen = isAdjacent
      ? adjacent.entry
      : status === "terminology_match"
        ? groupEntry
        : best?.entry;
    const useEvidence = status !== "not_evidenced" && chosen !== undefined;

    matches.push({
      id: newId(),
      requirementId: requirement.id,
      requirement: requirement.text,
      importance: requirement.importance,
      evidence: useEvidence ? chosen.fact.text : "",
      evidenceSource: useEvidence
        ? describeSource(chosen.fact)
        : "No supporting evidence found",
      evidenceFactIds: useEvidence ? [chosen.fact.id] : [],
      status,
      recommendedAction: isAdjacent
        ? adjacent.concept.warning
        : actionFor(requirement, status, firedGroup),
      suggestedPlacement: placementFor(requirement, status),
      coverage:
        status === "not_evidenced" ? 0 : Math.max(rawScore, firedGroup ? 0.5 : 0),
    });

    if (
      !isAdjacent &&
      firedGroup !== undefined &&
      groupEntry !== undefined &&
      shouldRewrite(groupEntry.fact.text, firedGroup)
    ) {
      const existing = opportunities.get(firedGroup.id);
      if (existing === undefined) {
        opportunities.set(firedGroup.id, {
          id: newId(),
          resumeWording: groupEntry.fact.text,
          jobWording: firedGroup.job[0] ?? firedGroup.preferred,
          recommendedRewrite: rewriteWithTerminology(groupEntry.fact.text, firedGroup),
          evidenceFactIds: [groupEntry.fact.id],
          requirementIds: [requirement.id],
        });
      } else {
        opportunities.set(firedGroup.id, {
          ...existing,
          requirementIds: unique([...existing.requirementIds, requirement.id]),
        });
      }
    }
  }

  return { matches, terminology: [...opportunities.values()] };
}

export function describeSource(fact: CareerFact): string {
  const origin =
    fact.source === "resume"
      ? "Resume"
      : fact.source === "user_confirmed"
        ? "User confirmed"
        : "Generated wording";
  return fact.context === undefined ? origin : `${origin} — ${fact.context}`;
}

/** Group the matrix by status, in the order the UI presents them. */
export function groupByStatus(
  matches: readonly RequirementMatch[],
): Record<MatchStatus, RequirementMatch[]> {
  const out: Record<MatchStatus, RequirementMatch[]> = {
    strong_match: [],
    partial_match: [],
    terminology_match: [],
    not_evidenced: [],
  };
  for (const match of matches) out[match.status].push(match);
  return out;
}
