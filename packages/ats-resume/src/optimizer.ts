/**
 * ResumeOptimizer.
 *
 * The strategy here is deliberate, and it is the opposite of keyword stuffing:
 *
 *   SELECT   — decide which of the candidate's real material is most relevant
 *              to this posting, and lead with it.
 *   REORDER  — put the bullets that answer critical requirements at the top of
 *              the role a recruiter reads first.
 *   RELABEL  — where the candidate's work matches a requirement but is written
 *              in different words, restate it in the posting's words, keeping
 *              the original detail inside the sentence.
 *   TRIM     — shorten older, less relevant roles instead of deleting them;
 *              a 2009 role still proves progression.
 *
 * What it never does is WRITE A NEW FACT. Every sentence it emits is either a
 * line the candidate already wrote, or that line relabelled using terminology
 * the analysis licensed. Every one of them then goes through the claim
 * validator anyway, because a generator that polices itself is not a control.
 *
 * Chronology is preserved. Roles stay in reverse-chronological order even when
 * an older role is more relevant, because re-sorting employment history by
 * relevance breaks date parsing in every ATS worth optimising for — and it
 * looks, to a human reader, like something is being hidden. Relevance is
 * expressed through bullet order and bullet count instead.
 */

import { isExportable, validateClaim } from "./claims.ts";
import { rewriteWithTerminology } from "./evidence.ts";
import { usableKeywords } from "./keywords.ts";
import {
  byScoreThenLabel,
  cleanLine,
  coverage as coverageOf,
  newId,
  normalize,
  now,
  stem,
  titleCase,
  tokenize,
  unique,
} from "./text.ts";
import { TERMINOLOGY_GROUPS } from "./vocabulary.ts";
import type {
  CandidateProfile,
  CareerFact,
  GeneratedExperience,
  GeneratedLine,
  GeneratedResume,
  JobAnalysis,
  JobPosting,
  MasterResume,
  RequirementMatch,
  SectionKind,
  UUID,
} from "./types.ts";

const MAX_COMPETENCIES = 12;
const MAX_SUMMARY_LINES = 4;
const TRIM_BULLETS_OLD_ROLE = 3;

export interface OptimizeInput {
  readonly profile: CandidateProfile;
  readonly resume: MasterResume;
  readonly facts: readonly CareerFact[];
  readonly job: JobPosting;
  readonly analysis: JobAnalysis;
  readonly engine?: string;
  readonly versionNumber?: number;
}

interface FactLookup {
  byId: Map<UUID, CareerFact>;
  byText: Map<string, CareerFact>;
}

function buildLookup(facts: readonly CareerFact[]): FactLookup {
  const byId = new Map<UUID, CareerFact>();
  const byText = new Map<string, CareerFact>();
  for (const fact of facts) {
    byId.set(fact.id, fact);
    byText.set(normalize(fact.text), fact);
  }
  return { byId, byText };
}

/**
 * Everything the generator is allowed to say that is not already a word in the
 * candidate's own material: keywords the resume already contains or that the
 * evidence supports, plus terminology whose underlying work is evidenced.
 */
function licensedTerms(analysis: JobAnalysis): string[] {
  const fromKeywords = usableKeywords(analysis.keywords);
  const fromTerminology = analysis.terminology.flatMap((opportunity) => {
    const group = TERMINOLOGY_GROUPS.find(
      (g) =>
        g.job.some((p) => normalize(p) === normalize(opportunity.jobWording)) ||
        normalize(g.preferred) === normalize(opportunity.jobWording),
    );
    return group === undefined
      ? [opportunity.jobWording]
      : [group.preferred, ...group.job];
  });
  return unique([...fromKeywords, ...fromTerminology]);
}

function matchesForFact(analysis: JobAnalysis, factId: UUID): RequirementMatch[] {
  return analysis.matches.filter((m) => m.evidenceFactIds.includes(factId));
}

const IMPORTANCE_RANK: Record<RequirementMatch["importance"], number> = {
  critical: 4,
  important: 3,
  preferred: 2,
  informational: 1,
};

function line(
  section: SectionKind,
  text: string,
  evidence: readonly CareerFact[],
  rationale: string,
  options: {
    readonly groupId?: string;
    readonly originalText?: string;
    readonly requirementIds?: readonly UUID[];
    readonly licensed: readonly string[];
  },
): GeneratedLine {
  const verdict = validateClaim(text, {
    evidence,
    licensedTerms: options.licensed,
  });
  const built: {
    id: UUID;
    section: SectionKind;
    groupId?: string;
    text: string;
    originalText?: string;
    evidenceFactIds: UUID[];
    evidenceText: string[];
    addressesRequirementIds: UUID[];
    rationale: string;
    validation: GeneratedLine["validation"];
    validationNotes: readonly string[];
  } = {
    id: newId(),
    section,
    text: text.trim(),
    evidenceFactIds: evidence.map((f) => f.id),
    evidenceText: evidence.map((f) => f.text),
    addressesRequirementIds: [...(options.requirementIds ?? [])],
    rationale,
    validation: verdict.status,
    validationNotes: verdict.notes,
  };
  if (options.groupId !== undefined) built.groupId = options.groupId;
  if (options.originalText !== undefined) built.originalText = options.originalText;
  return built;
}

// ---------------------------------------------------------------------------
// Headline
// ---------------------------------------------------------------------------

function buildHeadline(
  input: OptimizeInput,
  lookup: FactLookup,
  licensed: readonly string[],
): GeneratedLine {
  const headlineFact = input.facts.find((f) => f.category === "headline");
  const mostRecent = input.resume.parsed.experience[0];
  const base =
    headlineFact?.text ??
    (mostRecent === undefined ? input.profile.headline : mostRecent.title);

  const baseFact =
    headlineFact ??
    (mostRecent === undefined
      ? undefined
      : input.facts.find(
          (f) => f.category === "employment" && f.text.includes(mostRecent.title),
        ));

  // Two supported, high-priority phrases are added as positioning — each one
  // is a term the analysis has already proved the candidate can evidence.
  const additions = input.analysis.keywords.present
    .concat(input.analysis.keywords.supportedMissing)
    .filter((k) => k.priority === "high" && k.term.split(" ").length >= 2)
    .slice(0, 2)
    .map((k) => titleCase(k.term));

  const supportingFacts = unique(
    additions.flatMap((term) => {
      const needed = tokenize(term).map(stem);
      return input.facts.filter((f) =>
        needed.every((w) => new Set(tokenize(f.text).map(stem)).has(w)),
      );
    }),
  ).slice(0, 3);

  const evidence = [baseFact, ...supportingFacts].filter(
    (f): f is CareerFact => f !== undefined,
  );
  const text = additions.length === 0 ? base : `${base} | ${additions.join(" | ")}`;

  const headline = line("header", text, evidence, buildHeadlineRationale(additions), {
    licensed,
  });
  if (isExportable(headline)) return headline;

  // Fall back to the candidate's own headline rather than shipping a flagged
  // one: positioning is never worth a sentence the user has to defend.
  return line(
    "header",
    base,
    evidence.length > 0 ? evidence : lookupSelf(lookup, base),
    "Kept your own wording — the job-aligned version could not be fully traced to your evidence.",
    { licensed },
  );
}

function buildHeadlineRationale(additions: readonly string[]): string {
  if (additions.length === 0) {
    return "Your own headline, unchanged: nothing in the posting was supported well enough to add.";
  }
  return `Your headline plus ${additions.join(" and ")} — both are high-priority terms in the posting and both are supported by your own experience.`;
}

function lookupSelf(lookup: FactLookup, text: string): CareerFact[] {
  const fact = lookup.byText.get(normalize(text));
  return fact === undefined ? [] : [fact];
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function buildSummary(
  input: OptimizeInput,
  licensed: readonly string[],
): GeneratedLine[] {
  const jobStems = new Set(
    input.job.requirements
      .filter((r) => r.importance === "critical" || r.importance === "important")
      .flatMap((r) => r.terms),
  );

  const score = (fact: CareerFact): number => {
    const factStems = new Set(tokenize(fact.text).map(stem));
    const relevance = coverageOf(jobStems, factStems);
    const quantified = fact.numbers.length > 0 ? 0.15 : 0;
    return relevance + quantified;
  };

  const summaryFacts = input.facts.filter((f) => f.category === "summary");
  const accomplishments = input.facts.filter((f) => f.category === "accomplishment");

  const lines: GeneratedLine[] = [];

  // 1. The candidate's own summary sentence that best fits this posting.
  const bestSummary = [...summaryFacts].sort(byScoreThenLabel(score, (f) => f.text))[0];
  if (bestSummary !== undefined) {
    lines.push(
      line(
        "summary",
        bestSummary.text,
        [bestSummary],
        "Your own summary line, kept because it is the closest fit to this posting's critical requirements.",
        {
          licensed,
        },
      ),
    );
  }

  // 2. The strongest measurable accomplishment, promoted out of the role
  //    detail so a recruiter sees scale in the first six seconds.
  const bestAccomplishment = [...accomplishments].sort(
    byScoreThenLabel(score, (f) => f.text),
  )[0];
  if (bestAccomplishment !== undefined) {
    const requirementIds = matchesForFact(input.analysis, bestAccomplishment.id).map(
      (m) => m.requirementId,
    );
    lines.push(
      line(
        "summary",
        bestAccomplishment.text,
        [bestAccomplishment],
        "Promoted from your experience section: it is your strongest measurable result against what this posting asks for.",
        { requirementIds, licensed },
      ),
    );
  }

  // 3. One terminology rewrite, so the summary speaks the posting's language
  //    about work that is already evidenced.
  for (const opportunity of input.analysis.terminology.slice(0, 2)) {
    const evidence = opportunity.evidenceFactIds
      .map((id) => input.facts.find((f) => f.id === id))
      .filter((f): f is CareerFact => f !== undefined);
    if (evidence.length === 0) continue;
    if (lines.some((l) => l.evidenceFactIds.includes(evidence[0]?.id ?? ""))) continue;
    const candidate = line(
      "summary",
      opportunity.recommendedRewrite,
      evidence,
      `Your own experience restated in the posting's wording ("${opportunity.jobWording}"). The detail and the numbers are unchanged.`,
      {
        originalText: opportunity.resumeWording,
        requirementIds: opportunity.requirementIds,
        licensed,
      },
    );
    if (isExportable(candidate)) {
      lines.push(candidate);
      break;
    }
  }

  return lines.slice(0, MAX_SUMMARY_LINES);
}

// ---------------------------------------------------------------------------
// Competencies
// ---------------------------------------------------------------------------

/**
 * Single words that are noise in a competencies list.
 *
 * The first run produced "Experience | Transportation | Management | Cost |
 * Dot", which is what you get when you rank raw keyword frequency. A
 * competencies section is read by a human as well as parsed by a machine, and
 * a bare "Cost" tells neither of them anything.
 */
const COMPETENCY_NOISE: ReadonlySet<string> = new Set([
  "experience",
  "management",
  "operations",
  "transportation",
  "fleet",
  "cost",
  "team",
  "teams",
  "business",
  "company",
  "work",
  "years",
  "year",
  "skills",
  "knowledge",
  "ability",
  "leadership",
  "director",
  "manager",
  "support",
  "requirements",
  "qualifications",
  "responsibilities",
  "distribution",
]);

function buildCompetencies(input: OptimizeInput): string[] {
  const supported = usableKeywords(input.analysis.keywords);
  const fromResume = input.resume.parsed.skills;

  // Multi-word posting terms the candidate can evidence come first — that is
  // what the section is for — then their own skills, then single words only if
  // they are specific enough to mean something on their own.
  const ranked = unique([
    ...supported.filter((t) => t.split(" ").length >= 2).map(titleCase),
    ...fromResume,
    ...supported
      .filter((t) => t.split(" ").length === 1 && !COMPETENCY_NOISE.has(t))
      .map(titleCase),
  ]);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of ranked) {
    const key = normalize(item);
    if (key.length < 3 || seen.has(key)) continue;
    // "Lean Six Sigma" already covers "Six Sigma"; listing both wastes a slot
    // and reads like padding.
    if (
      out.some((kept) => normalize(kept).includes(key) || key.includes(normalize(kept)))
    ) {
      continue;
    }
    seen.add(key);
    out.push(item);
    if (out.length >= MAX_COMPETENCIES) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Experience
// ---------------------------------------------------------------------------

function buildExperience(
  input: OptimizeInput,
  lookup: FactLookup,
  licensed: readonly string[],
  /**
   * Sentences already promoted into the summary. A bullet that is byte-for-byte
   * identical to a summary line reads as an editing mistake, so the role drops
   * it — but only when the role still has enough bullets left to stand up.
   */
  promoted: readonly string[] = [],
): GeneratedExperience[] {
  const jobStems = new Set(input.job.requirements.flatMap((r) => r.terms));
  const terminologyByEvidence = new Map<
    string,
    (typeof input.analysis.terminology)[number]
  >();
  for (const opportunity of input.analysis.terminology) {
    for (const factId of opportunity.evidenceFactIds) {
      terminologyByEvidence.set(factId, opportunity);
    }
  }

  const entries = input.resume.parsed.experience.map((entry, entryIndex) => {
    const context = `${entry.employer} — ${entry.title}`.replace(/^ — | — $/, "");
    const entryStems = new Set(
      tokenize(`${entry.title} ${entry.employer} ${entry.bullets.join(" ")}`).map(stem),
    );
    const relevance = coverageOf(jobStems, entryStems);

    const bullets = entry.bullets.map((bulletText) => {
      const fact = lookup.byText.get(normalize(cleanLine(bulletText)));
      const evidence = fact === undefined ? [] : [fact];
      const requirementMatches =
        fact === undefined ? [] : matchesForFact(input.analysis, fact.id);
      const requirementIds = requirementMatches.map((m) => m.requirementId);
      const opportunity =
        fact === undefined ? undefined : terminologyByEvidence.get(fact.id);

      if (opportunity !== undefined && fact !== undefined) {
        const group = TERMINOLOGY_GROUPS.find(
          (g) =>
            g.job.some((p) => normalize(p) === normalize(opportunity.jobWording)) ||
            normalize(g.preferred) === normalize(opportunity.jobWording),
        );
        const rewritten =
          group === undefined
            ? opportunity.recommendedRewrite
            : rewriteWithTerminology(fact.text, group);
        const candidate = line(
          "experience",
          rewritten,
          evidence,
          `Relabelled in the posting's wording ("${opportunity.jobWording}"). Your original detail and figures are carried through unchanged.`,
          {
            groupId: entry.id,
            originalText: bulletText,
            requirementIds,
            licensed,
          },
        );
        if (isExportable(candidate)) return candidate;
      }

      return line(
        "experience",
        cleanLine(bulletText),
        evidence,
        requirementIds.length > 0
          ? `Kept as written — it already evidences ${requirementMatches.length} requirement${requirementMatches.length === 1 ? "" : "s"} in this posting.`
          : "Kept as written.",
        { groupId: entry.id, originalText: bulletText, requirementIds, licensed },
      );
    });

    // Bullets that answer critical requirements go first; measurable results
    // outrank unmeasured ones; original order breaks the remaining ties.
    const bulletScore = (l: GeneratedLine): number => {
      const importance = l.addressesRequirementIds
        .map((id) => input.analysis.matches.find((m) => m.requirementId === id))
        .reduce(
          (best, m) =>
            Math.max(best, m === undefined ? 0 : IMPORTANCE_RANK[m.importance]),
          0,
        );
      const quantified = /\d/.test(l.text) ? 0.5 : 0;
      return importance + quantified;
    };
    const ordered = bullets
      .map((l, index) => ({ l, index }))
      .sort((a, b) => {
        const d = bulletScore(b.l) - bulletScore(a.l);
        return d !== 0 ? d : a.index - b.index;
      })
      .map((x) => x.l);

    const promotedSet = new Set(promoted.map((t) => normalize(t)));
    const deduped =
      ordered.filter((l) => !promotedSet.has(normalize(l.text))).length >= 2
        ? ordered.filter((l) => !promotedSet.has(normalize(l.text)))
        : ordered;

    // Older, less relevant roles are shortened rather than dropped: the dates
    // still prove progression, and a truthful resume does not hide employers.
    const isOld = entryIndex >= 2;
    const kept =
      isOld && relevance < 0.15 ? deduped.slice(0, TRIM_BULLETS_OLD_ROLE) : deduped;
    const trimmed = ordered.length - kept.length;

    const built: GeneratedExperience = {
      entryId: entry.id,
      title: entry.title,
      employer: entry.employer,
      ...(entry.location === undefined ? {} : { location: entry.location }),
      ...(entry.startDate === undefined ? {} : { startDate: entry.startDate }),
      ...(entry.endDate === undefined ? {} : { endDate: entry.endDate }),
      current: entry.current,
      bullets: kept,
      relevance,
      relevanceNote: buildRelevanceNote(relevance, trimmed, context),
    };
    return built;
  });

  return entries;
}

function buildRelevanceNote(
  relevance: number,
  trimmed: number,
  context: string,
): string {
  const strength =
    relevance >= 0.3
      ? "Most relevant role for this posting — its bullets lead the document."
      : relevance >= 0.12
        ? "Partly relevant; the bullets that match this posting were moved to the top."
        : "Limited overlap with this posting, kept for continuity and progression.";
  const trimNote =
    trimmed > 0
      ? ` ${trimmed} lower-relevance bullet${trimmed === 1 ? "" : "s"} shortened out of this role — nothing was deleted from your master resume.`
      : "";
  return `${context}: ${strength}${trimNote}`;
}

// ---------------------------------------------------------------------------
// Section order
// ---------------------------------------------------------------------------

/**
 * Section order is a judgement about what this employer screens on first.
 * Certifications move above education when the posting makes a credential
 * critical; otherwise the conventional order is kept, because unusual order
 * is itself an ATS risk.
 */
export function chooseSectionOrder(analysis: JobAnalysis): SectionKind[] {
  const certificationIsCritical = analysis.matches.some(
    (m) =>
      m.importance === "critical" && m.suggestedPlacement.includes("certifications"),
  );
  const base: SectionKind[] = ["header", "summary", "skills", "experience"];
  return certificationIsCritical
    ? [...base, "certifications", "education", "additional"]
    : [...base, "education", "certifications", "additional"];
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function generateTailoredResume(input: OptimizeInput): GeneratedResume {
  const lookup = buildLookup(input.facts);
  const licensed = licensedTerms(input.analysis);
  const timestamp = now();
  const summary = buildSummary(input, licensed);

  const resume: GeneratedResume = {
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    profileId: input.profile.id,
    analysisId: input.analysis.id,
    resumeId: input.resume.id,
    jobPostingId: input.job.id,
    versionNumber: input.versionNumber ?? 1,
    company: input.job.company,
    jobTitle: input.job.title,
    fullName: input.profile.fullName,
    contact: input.profile.contact,
    headline: buildHeadline(input, lookup, licensed),
    summary,
    competencies: buildCompetencies(input),
    experience: buildExperience(
      input,
      lookup,
      licensed,
      summary.map((l) => l.text),
    ),
    education: input.resume.parsed.education,
    certifications: input.resume.parsed.certifications,
    additional: input.resume.parsed.additional,
    sectionOrder: chooseSectionOrder(input.analysis),
    engine: input.engine ?? "rules-engine",
    ...(input.profile.isSample === true ? { isSample: true } : {}),
  };
  return resume;
}

/** Every generated line in the document, in render order. */
export function allLines(resume: GeneratedResume): GeneratedLine[] {
  return [
    resume.headline,
    ...resume.summary,
    ...resume.experience.flatMap((e) => e.bullets),
  ];
}
