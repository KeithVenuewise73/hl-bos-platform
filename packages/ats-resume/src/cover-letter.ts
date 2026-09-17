/**
 * CoverLetterGenerator.
 *
 * Same guardrails as the resume, and one extra that is specific to letters:
 * the app will not invent ENTHUSIASM. A cover letter that claims the candidate
 * has "long admired the company's commitment to sustainability" is fabricating
 * a personal state of mind, and it is the single most common way an AI letter
 * embarrasses the person who signs it.
 *
 * So: motivation is either supplied by the user, or the letter does without
 * it. Nothing here writes a feeling, a connection, or knowledge of a company
 * that the user did not provide.
 */

import { isExportable, validateClaim } from "./claims.ts";
import { makeFact } from "./career-facts.ts";
import { newId, now, unique } from "./text.ts";
import type {
  CareerFact,
  CoverLetter,
  GeneratedLine,
  JobAnalysis,
  JobPosting,
  CandidateProfile,
  UUID,
} from "./types.ts";

export interface CoverLetterInput {
  readonly profile: CandidateProfile;
  readonly job: JobPosting;
  readonly analysis: JobAnalysis;
  readonly facts: readonly CareerFact[];
  /** In the user's own words. Absent means the letter states no motivation. */
  readonly motivation?: string;
  readonly recipientName?: string;
  readonly engine?: string;
}

function paragraph(
  text: string,
  evidence: readonly CareerFact[],
  rationale: string,
  licensed: readonly string[],
  requirementIds: readonly UUID[] = [],
): GeneratedLine {
  const verdict = validateClaim(text, { evidence, licensedTerms: licensed });
  return {
    id: newId(),
    section: "summary",
    text,
    evidenceFactIds: evidence.map((f) => f.id),
    evidenceText: evidence.map((f) => f.text),
    addressesRequirementIds: [...requirementIds],
    rationale,
    validation: verdict.status,
    validationNotes: verdict.notes,
  };
}

export function generateCoverLetter(input: CoverLetterInput): CoverLetter {
  const { profile, job, analysis } = input;
  const timestamp = now();

  // The posting itself is a fact the user entered — it licenses the company
  // name, the job title and the fact that they are applying. Nothing more.
  const applicationFact = makeFact(profile.id, {
    category: "other",
    text: `Applying for the ${job.title} position at ${job.company}.`,
    source: "user_confirmed",
  });

  const licensed = unique([
    job.company,
    job.title,
    "position",
    "application",
    "applying",
    "attached",
    "resume",
    "discuss",
    "available",
    "interview",
    "consideration",
    "background",
    "brings",
    "directly",
    ...(input.motivation === undefined ? [] : [input.motivation]),
  ]);

  const paragraphs: GeneratedLine[] = [];

  // --- Opening -------------------------------------------------------------
  const motivationFact =
    input.motivation === undefined || input.motivation.trim().length === 0
      ? undefined
      : makeFact(profile.id, {
          category: "other",
          text: input.motivation.trim(),
          source: "user_confirmed",
        });

  paragraphs.push(
    paragraph(
      `I am applying for the ${job.title} position at ${job.company}.`,
      [applicationFact],
      "States the application. The company and role come from the posting you entered.",
      licensed,
    ),
  );

  if (motivationFact !== undefined) {
    paragraphs.push(
      paragraph(
        motivationFact.text,
        [motivationFact],
        "Your own words about why this role interests you. The app does not write motivation — an invented reason is the fastest way to lose a conversation you would otherwise have won.",
        licensed,
      ),
    );
  }

  // --- Evidence paragraphs -------------------------------------------------
  const strongest = analysis.matches
    .filter((m) => m.status === "strong_match" || m.status === "terminology_match")
    .sort((a, b) => {
      const rank = {
        critical: 3,
        important: 2,
        preferred: 1,
        informational: 0,
      } as const;
      const d = rank[b.importance] - rank[a.importance];
      return d !== 0 ? d : b.coverage - a.coverage;
    })
    .slice(0, 3);

  for (const match of strongest) {
    const evidence = match.evidenceFactIds
      .map((id) => input.facts.find((f) => f.id === id))
      .filter((f): f is CareerFact => f !== undefined);
    if (evidence.length === 0) continue;
    const candidate = paragraph(
      evidence.map((f) => f.text.replace(/\.$/, "")).join(". ") + ".",
      evidence,
      `Answers "${match.requirement}" with the evidence from your resume, quoted rather than rephrased.`,
      licensed,
      [match.requirementId],
    );
    if (isExportable(candidate)) paragraphs.push(candidate);
  }

  // --- Close ---------------------------------------------------------------
  paragraphs.push(
    paragraph(
      "My resume is attached. I am available to discuss the role at your convenience.",
      [applicationFact],
      "A neutral close. It claims no availability date, no notice period and no salary expectation, because you have not told the app any of those.",
      licensed,
    ),
  );

  return {
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    profileId: profile.id,
    analysisId: analysis.id,
    company: job.company,
    jobTitle: job.title,
    greeting:
      input.recipientName === undefined || input.recipientName.trim().length === 0
        ? "Dear Hiring Manager,"
        : `Dear ${input.recipientName.trim()},`,
    paragraphs,
    closing: `Sincerely,\n${profile.fullName}`,
    engine: input.engine ?? "rules-engine",
    ...(profile.isSample === true ? { isSample: true } : {}),
  };
}
