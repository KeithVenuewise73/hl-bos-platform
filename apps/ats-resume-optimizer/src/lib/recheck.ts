/**
 * The export-time claim check.
 *
 * Lives here rather than in the route so it can be unit tested, which for this
 * function is not a nicety: it is the last thing standing between a stored
 * verdict and a document somebody sends to an employer.
 *
 * No `server-only` marker and no I/O — it is a pure function of a resume and
 * the workspace it belongs to.
 */

import {
  validateClaim,
  type CareerFact,
  type GeneratedLine,
  type GeneratedResume,
  type JobAnalysis,
} from "@hl-bos/ats-resume";

import { licensedTermsFor } from "./analysis-helpers.ts";

/** Only the parts of a workspace this needs, so a test can build one by hand. */
export interface RecheckContext {
  readonly facts: readonly CareerFact[];
  readonly analyses: readonly JobAnalysis[];
}

/**
 * Re-run the claim validator over every sentence in a generated resume.
 *
 * Deliberately identical in substance to what `editGeneratedLine` does when a
 * user changes a sentence: same evidence lookup, same licensed terms. A line
 * that cannot be verified here is downgraded before the export sees it, so a
 * verdict stored optimistically cannot survive contact with this route.
 */
export function recheckClaims(
  resume: GeneratedResume,
  workspace: RecheckContext,
): GeneratedResume {
  const analysis = workspace.analyses.find((a) => a.id === resume.analysisId);
  const facts = workspace.facts.filter((f) => f.profileId === resume.profileId);
  const factsById = new Map(facts.map((f) => [f.id, f]));
  const licensedTerms = analysis === undefined ? [] : licensedTermsFor(analysis);

  const check = (line: GeneratedLine): GeneratedLine => {
    const evidence = line.evidenceFactIds
      .map((id) => factsById.get(id))
      .filter((f): f is CareerFact => f !== undefined);
    const verdict = validateClaim(line.text, { evidence, licensedTerms });
    // Never upgrade. A line the user must still confirm stays that way even if
    // the validator would now pass it; only downgrades are applied here.
    if (verdict.status === line.validation) return line;
    if (verdict.status === "verified") return line;
    return { ...line, validation: verdict.status, validationNotes: verdict.notes };
  };

  return {
    ...resume,
    headline: check(resume.headline),
    summary: resume.summary.map(check),
    experience: resume.experience.map((entry) => ({
      ...entry,
      bullets: entry.bullets.map(check),
    })),
  };
}
