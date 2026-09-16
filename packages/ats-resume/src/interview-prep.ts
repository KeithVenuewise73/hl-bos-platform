/**
 * InterviewPrepGenerator.
 *
 * Interview prep is where the gaps stop being a score penalty and start being
 * a conversation the candidate has to have. So this generator is built around
 * the parts of the analysis that are uncomfortable: partial matches, and
 * requirements with no evidence at all.
 *
 * It does NOT write answers. It writes the question, why it is likely to be
 * asked, and STAR scaffolding pointing at the candidate's real experience.
 * A scripted answer to "tell me about a time you..." is both obvious in the
 * room and, if the app made it up, untrue.
 */

import { newId, now } from "./text.ts";
import type {
  CareerFact,
  InterviewPrep,
  InterviewQuestion,
  JobAnalysis,
  JobPosting,
  RequirementMatch,
  UUID,
} from "./types.ts";

export interface InterviewPrepInput {
  readonly profileId: UUID;
  readonly job: JobPosting;
  readonly analysis: JobAnalysis;
  readonly facts: readonly CareerFact[];
  readonly engine?: string;
}

const STAR_SCAFFOLD = (evidence: string): string[] => [
  `Situation — set the scene for: "${evidence}". Where were you, when, and what was the state of things?`,
  "Task — what specifically were you accountable for, and what was the constraint (time, budget, headcount, safety)?",
  "Action — the two or three decisions you personally made. Name them in first person.",
  "Result — the number you already have on your resume, plus what changed for the team or the customer.",
];

function question(
  kind: InterviewQuestion["kind"],
  text: string,
  why: string,
  starPrompts: readonly string[],
  evidenceFactIds: readonly UUID[],
  requirementIds: readonly UUID[],
): InterviewQuestion {
  return {
    id: newId(),
    kind,
    question: text,
    why,
    starPrompts: [...starPrompts],
    evidenceFactIds: [...evidenceFactIds],
    requirementIds: [...requirementIds],
  };
}

function rank(match: RequirementMatch): number {
  const importance = {
    critical: 3,
    important: 2,
    preferred: 1,
    informational: 0,
  } as const;
  return importance[match.importance] * 10 + match.coverage;
}

export function generateInterviewPrep(input: InterviewPrepInput): InterviewPrep {
  const { analysis, job } = input;
  const timestamp = now();
  const questions: InterviewQuestion[] = [];
  const explainThese: InterviewQuestion[] = [];

  // --- Strengths: the matches worth rehearsing because they will be probed --
  const strengths = analysis.matches
    .filter((m) => m.status === "strong_match" || m.status === "terminology_match")
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, 5);

  for (const match of strengths) {
    const kind: InterviewQuestion["kind"] =
      /\b(lead|manage|team|supervis|direct report)/i.test(match.requirement)
        ? "leadership"
        : /\b(system|software|tool|platform|data|report)/i.test(match.requirement)
          ? "technical"
          : "strength";
    questions.push(
      question(
        kind,
        `Walk me through your experience with ${shorten(match.requirement)}.`,
        `This is a ${match.importance} requirement in the posting and your strongest evidence for it. Expect it early and expect follow-up on the numbers.`,
        STAR_SCAFFOLD(match.evidence),
        match.evidenceFactIds,
        [match.requirementId],
      ),
    );
  }

  // --- Behavioural, anchored to real accomplishments -----------------------
  const quantified = input.facts
    .filter((f) => f.category === "accomplishment" && f.numbers.length > 0)
    .slice(0, 2);
  for (const fact of quantified) {
    questions.push(
      question(
        "behavioural",
        "Tell me about a result you are proud of and how you got there.",
        "A standard opener. Use the accomplishment already on your resume so the interviewer can follow it on the page in front of them.",
        STAR_SCAFFOLD(fact.text),
        [fact.id],
        [],
      ),
    );
  }

  // --- The uncomfortable half: partials and gaps ---------------------------
  const partials = analysis.matches
    .filter((m) => m.status === "partial_match")
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, 5);

  for (const match of partials) {
    explainThese.push(
      question(
        "gap",
        `How much direct experience do you have with ${shorten(match.requirement)}?`,
        `Your evidence covers part of this requirement, not all of it. Be ready to say which part is direct experience and which is adjacent — the honest version is stronger than a stretch that unravels under one follow-up question.`,
        [
          `What you can evidence: "${match.evidence}"`,
          "Name the part you have done directly, in one sentence.",
          "Name the part you have not, and what is closest to it in your background.",
          "Say what you would need in the first 90 days to close the difference.",
        ],
        match.evidenceFactIds,
        [match.requirementId],
      ),
    );
  }

  const gaps = analysis.matches
    .filter((m) => m.status === "not_evidenced")
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, 5);

  for (const match of gaps) {
    explainThese.push(
      question(
        "gap",
        `This role asks for ${shorten(match.requirement)}. Where does that sit in your background?`,
        `Nothing in your profile evidences this${match.importance === "critical" ? ", and the posting treats it as required" : ""}. Prepare a truthful answer: what is closest, what you would do to get up to speed, and why the rest of your record makes that credible.`,
        [
          "Do not claim it. An invented answer here is the one that gets checked.",
          "What is the nearest thing you have genuinely done?",
          "What would your first 30 days on this specific gap look like?",
        ],
        [],
        [match.requirementId],
      ),
    );
  }

  // --- One question about the company's own framing ------------------------
  if (job.facets.responsibilities.length > 0) {
    const first = job.facets.responsibilities[0] ?? "";
    questions.push(
      question(
        "behavioural",
        `The posting leads with "${shorten(first)}". What would your first 90 days look like against that?`,
        "Posting language is usually the hiring manager's own priority list. Answering in their words shows you read it.",
        [
          "First 30 days: what you would learn and from whom.",
          "Days 31–60: the first thing you would change, and why that one.",
          "Days 61–90: what you would expect to be measurably different.",
        ],
        [],
        [],
      ),
    );
  }

  return {
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    profileId: input.profileId,
    analysisId: analysis.id,
    questions,
    explainThese,
    engine: input.engine ?? "rules-engine",
    ...(analysis.isSample === true ? { isSample: true } : {}),
  };
}

function shorten(text: string): string {
  const cleaned = text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.:;]$/, "");
  return cleaned.length <= 110 ? cleaned : `${cleaned.slice(0, 107)}...`;
}
