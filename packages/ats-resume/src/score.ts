/**
 * The internal match score.
 *
 * READ THIS BEFORE CHANGING THE NUMBERS. This score is ours, not the
 * employer's. We do not know which ATS they run, how it is configured, which
 * knock-out questions sit in front of it, or what a human does with the result.
 * Anything in the UI that shows this number says so, and nothing in this
 * package may describe it as a prediction of an outcome.
 *
 * What it IS: a consistent measure of how well this resume, as written, lines
 * up with this posting — useful because it moves when you improve the resume,
 * and because the breakdown tells you where to spend the next ten minutes.
 *
 * Weights are the product owner's, documented in the README:
 *   Qualification alignment 35 | Relevant experience 25 |
 *   Skills and keyword coverage 20 | Quantified accomplishments 10 |
 *   ATS structure and formatting 10
 */

import { keywordCoverage, projectedKeywordCoverage } from "./keywords.ts";
import type {
  AtsFormatFinding,
  KeywordAnalysis,
  MatchScore,
  ParsedResume,
  RequirementMatch,
  ScoreBreakdown,
} from "./types.ts";

export const SCORE_WEIGHTS: ScoreBreakdown = {
  qualificationAlignment: 35,
  relevantExperience: 25,
  skillsAndKeywords: 20,
  quantifiedAccomplishments: 10,
  atsStructure: 10,
};

export const SCORE_DISCLAIMER =
  "Internal optimization score. This is our own measure of how well this resume lines up with this posting — it is not the employer's ATS score, and it does not predict whether you will be contacted.";

const IMPORTANCE_WEIGHT: Record<RequirementMatch["importance"], number> = {
  critical: 3,
  important: 2,
  preferred: 1,
  informational: 0,
};

const STATUS_CREDIT: Record<RequirementMatch["status"], number> = {
  strong_match: 1,
  terminology_match: 0.75,
  partial_match: 0.5,
  not_evidenced: 0,
};

/** Credit a match would earn after the recommended, supported rewrite. */
const PROJECTED_STATUS_CREDIT: Record<RequirementMatch["status"], number> = {
  strong_match: 1,
  // A terminology rewrite is fully supported work stated in the job's words.
  terminology_match: 1,
  // Expanding an existing bullet with detail already on file closes some,
  // not all, of a partial match. Assuming it closes fully would be a promise.
  partial_match: 0.7,
  // Never improves by itself. Only the user adding real evidence moves this.
  not_evidenced: 0,
};

function weightedRequirementCredit(
  matches: readonly RequirementMatch[],
  credit: Record<RequirementMatch["status"], number>,
  kinds?: (m: RequirementMatch) => boolean,
): number {
  const rows = kinds === undefined ? matches : matches.filter(kinds);
  let total = 0;
  let earned = 0;
  for (const row of rows) {
    const weight = IMPORTANCE_WEIGHT[row.importance];
    if (weight === 0) continue;
    total += weight;
    earned += weight * (credit[row.status] ?? 0);
  }
  return total === 0 ? 0 : earned / total;
}

function quantifiedRatio(resume: ParsedResume): number {
  const bullets = resume.experience.flatMap((e) => e.bullets);
  if (bullets.length === 0) return 0;
  const quantified = bullets.filter((b) => /\d/.test(b)).length;
  // Half of bullets carrying a number is a strong resume; scale to that.
  return Math.min(1, quantified / Math.max(1, bullets.length * 0.5));
}

function structureScore(findings: readonly AtsFormatFinding[]): number {
  const risks = findings.filter((f) => f.severity === "risk").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;
  return Math.max(0, 1 - risks * 0.25 - warnings * 0.1);
}

export interface ScoreInput {
  readonly matches: readonly RequirementMatch[];
  readonly keywords: KeywordAnalysis;
  readonly resume: ParsedResume;
  readonly formatFindings: readonly AtsFormatFinding[];
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

function build(
  qualification: number,
  experience: number,
  keywords: number,
  quantified: number,
  structure: number,
  explanation: readonly string[],
): MatchScore {
  const breakdown: ScoreBreakdown = {
    qualificationAlignment: round(qualification * SCORE_WEIGHTS.qualificationAlignment),
    relevantExperience: round(experience * SCORE_WEIGHTS.relevantExperience),
    skillsAndKeywords: round(keywords * SCORE_WEIGHTS.skillsAndKeywords),
    quantifiedAccomplishments: round(
      quantified * SCORE_WEIGHTS.quantifiedAccomplishments,
    ),
    atsStructure: round(structure * SCORE_WEIGHTS.atsStructure),
  };
  const overall = round(
    breakdown.qualificationAlignment +
      breakdown.relevantExperience +
      breakdown.skillsAndKeywords +
      breakdown.quantifiedAccomplishments +
      breakdown.atsStructure,
  );
  return { overall, breakdown, weights: SCORE_WEIGHTS, explanation };
}

const isQualification = (m: RequirementMatch): boolean =>
  m.importance === "critical" || m.importance === "preferred";

const isExperience = (m: RequirementMatch): boolean => m.importance === "important";

export function scoreResume(input: ScoreInput): MatchScore {
  const qualification = weightedRequirementCredit(
    input.matches,
    STATUS_CREDIT,
    isQualification,
  );
  const experience = weightedRequirementCredit(
    input.matches,
    STATUS_CREDIT,
    isExperience,
  );
  const keywords = keywordCoverage(input.keywords);
  const quantified = quantifiedRatio(input.resume);
  const structure = structureScore(input.formatFindings);

  const notEvidencedCritical = input.matches.filter(
    (m) => m.status === "not_evidenced" && m.importance === "critical",
  ).length;

  const explanation = [
    `${input.matches.filter((m) => m.status === "strong_match").length} of ${input.matches.length} weighted requirements are a strong match.`,
    `${Math.round(keywords * 100)}% of the posting's weighted keywords already appear in the resume.`,
    notEvidencedCritical > 0
      ? `${notEvidencedCritical} critical requirement${notEvidencedCritical === 1 ? " is" : "s are"} not evidenced anywhere in your profile. Nothing in this app will write them for you.`
      : "Every critical requirement has at least partial evidence.",
  ];

  return build(qualification, experience, keywords, quantified, structure, explanation);
}

/**
 * The score after applying every SUPPORTED revision — terminology rewrites,
 * reordering, surfacing evidence that is already on file, and fixing the
 * format findings we can fix.
 *
 * Unevidenced requirements contribute nothing here. That is the point: the
 * projected score is a promise the app can actually keep.
 */
export function projectScore(input: ScoreInput): MatchScore {
  const qualification = weightedRequirementCredit(
    input.matches,
    PROJECTED_STATUS_CREDIT,
    isQualification,
  );
  const experience = weightedRequirementCredit(
    input.matches,
    PROJECTED_STATUS_CREDIT,
    isExperience,
  );
  const keywords = projectedKeywordCoverage(input.keywords);
  const quantified = quantifiedRatio(input.resume);
  // The generator emits a single-column, standard-heading document, so the
  // structural findings it can fix are fixed. It cannot invent missing content.
  const structure = 1;

  const stillMissing = input.matches.filter((m) => m.status === "not_evidenced").length;
  const explanation = [
    "Projected after accepting every supported revision: terminology rewrites, reordering, and surfacing evidence already in your profile.",
    stillMissing > 0
      ? `${stillMissing} requirement${stillMissing === 1 ? "" : "s"} stay unevidenced and are excluded from this projection — they only move if you add real evidence.`
      : "No unevidenced requirements remain.",
    SCORE_DISCLAIMER,
  ];

  return build(qualification, experience, keywords, quantified, structure, explanation);
}
