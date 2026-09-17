/**
 * The analysis pipeline.
 *
 * One function, run in one order, producing one auditable artifact:
 *
 *   requirements -> evidence matrix -> keyword buckets -> terminology
 *   -> format findings -> score now -> score after supported revisions
 *
 * Every stage takes the previous stage's output as data. Nothing reaches back
 * into the raw text to "check again", which is what makes an analysis
 * reproducible: the same resume and the same posting always produce the same
 * matrix and the same score.
 */

import { analyzeKeywords } from "./keywords.ts";
import { matchRequirements } from "./evidence.ts";
import { newId, now } from "./text.ts";
import { projectScore, scoreResume } from "./score.ts";
import { validateAtsFormat } from "./ats-format.ts";
import type {
  CareerFact,
  JobAnalysis,
  JobPosting,
  MasterResume,
  RequirementMatch,
  UUID,
} from "./types.ts";

export interface AnalyzeInput {
  readonly profileId: UUID;
  readonly resume: MasterResume;
  readonly facts: readonly CareerFact[];
  readonly job: JobPosting;
  readonly engine?: string;
  readonly isSample?: boolean;
}

function buildRecommendations(
  matches: readonly RequirementMatch[],
  analysis: {
    readonly terminologyCount: number;
    readonly supportedKeywordCount: number;
    readonly unsupportedKeywordCount: number;
  },
): string[] {
  const out: string[] = [];

  const criticalGaps = matches.filter(
    (m) => m.status === "not_evidenced" && m.importance === "critical",
  );
  if (criticalGaps.length > 0) {
    out.push(
      `${criticalGaps.length} critical requirement${criticalGaps.length === 1 ? "" : "s"} have no evidence in your profile. If you have done this work, add it under Candidate Profile as a confirmed fact — the app will not write it for you.`,
    );
  }

  const partials = matches.filter((m) => m.status === "partial_match");
  if (partials.length > 0) {
    out.push(
      `${partials.length} requirement${partials.length === 1 ? " is a" : "s are"} partial match${partials.length === 1 ? "" : "es"}. Expand those bullets with scope and results you already have on file rather than adding new claims.`,
    );
  }

  if (analysis.terminologyCount > 0) {
    out.push(
      `${analysis.terminologyCount} terminology rewrite${analysis.terminologyCount === 1 ? "" : "s"} available: work you have already done, stated in this posting's words.`,
    );
  }

  if (analysis.supportedKeywordCount > 0) {
    out.push(
      `${analysis.supportedKeywordCount} keyword${analysis.supportedKeywordCount === 1 ? "" : "s"} from the posting are supported by your evidence but missing from the resume. These are safe to add.`,
    );
  }

  if (analysis.unsupportedKeywordCount > 0) {
    out.push(
      `${analysis.unsupportedKeywordCount} keyword${analysis.unsupportedKeywordCount === 1 ? " is" : "s are"} not evidenced anywhere in your profile. They are listed separately and will not be inserted into your resume.`,
    );
  }

  const strong = matches.filter(
    (m) => m.status === "strong_match" && m.importance === "critical",
  );
  if (strong.length > 0) {
    out.push(
      `Lead with your ${strong.length} strongest critical match${strong.length === 1 ? "" : "es"}: move ${strong.length === 1 ? "it" : "them"} into the summary and the first bullets of your most recent role.`,
    );
  }

  return out;
}

export function analyzeJob(input: AnalyzeInput): JobAnalysis {
  const { matches, terminology } = matchRequirements(
    input.job.requirements,
    input.facts,
  );
  const keywords = analyzeKeywords(input.job.keywords, input.facts);
  const formatFindings = validateAtsFormat(input.resume.rawText, input.resume.parsed);

  const scoreInput = {
    matches,
    keywords,
    resume: input.resume.parsed,
    formatFindings,
  };

  const timestamp = now();
  return {
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    profileId: input.profileId,
    resumeId: input.resume.id,
    jobPostingId: input.job.id,
    matches,
    keywords,
    terminology,
    scoreBefore: scoreResume(scoreInput),
    scoreProjected: projectScore(scoreInput),
    formatFindings,
    recommendations: buildRecommendations(matches, {
      terminologyCount: terminology.length,
      supportedKeywordCount: keywords.supportedMissing.length,
      unsupportedKeywordCount: keywords.unsupported.length,
    }),
    engine: input.engine ?? "rules-engine",
    ...(input.isSample === true ? { isSample: true } : {}),
  };
}

/** Headline counts the analysis page shows above the matrix. */
export function analysisSummary(analysis: JobAnalysis): {
  readonly total: number;
  readonly strong: number;
  readonly partial: number;
  readonly terminology: number;
  readonly missing: number;
  readonly criticalMissing: number;
} {
  const matches = analysis.matches;
  return {
    total: matches.length,
    strong: matches.filter((m) => m.status === "strong_match").length,
    partial: matches.filter((m) => m.status === "partial_match").length,
    terminology: matches.filter((m) => m.status === "terminology_match").length,
    missing: matches.filter((m) => m.status === "not_evidenced").length,
    criticalMissing: matches.filter(
      (m) => m.status === "not_evidenced" && m.importance === "critical",
    ).length,
  };
}
