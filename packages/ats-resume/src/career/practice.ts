/**
 * Interview practice — a working text loop, built on the SUBMITTED package.
 *
 * Preparation material (the briefing, the questions, what to draw on) and the
 * interactive part (answer, get feedback, try again) are separate on purpose,
 * and the UI labels them separately. Feedback is deterministic: it checks the
 * structure of an answer and whether any figure in it is something the
 * experience bank does not contain. It does not pretend to be a human coach.
 *
 * Voice is not implemented: there is no speech service in this platform that
 * has been verified, so no recording consent flow is needed or offered.
 */

import { allLines } from "../optimizer.ts";
import { generateInterviewPrep } from "../interview-prep.ts";
import { extractNumbers, newId, now } from "../text.ts";
import type { CareerFact, JobAnalysis, JobPosting, UUID } from "../types.ts";
import type {
  AnswerFeedback,
  PracticeAttempt,
  PracticeQuestion,
  PracticeSession,
  Submission,
} from "./types.ts";

export function buildPracticeSession(input: {
  readonly submission: Submission;
  readonly job: JobPosting;
  readonly analysis: JobAnalysis;
  readonly facts: readonly CareerFact[];
  readonly round: string;
}): PracticeSession {
  const { submission, job, analysis } = input;
  const prep = generateInterviewPrep({
    profileId: submission.profileId,
    job,
    analysis,
    facts: input.facts,
  });

  // Only what was actually sent: lines of the frozen resume that cleared the validator.
  const sentLines = allLines(submission.resume).filter(
    (l) => l.validation === "verified" || l.validation === "user_confirmed",
  );
  const linesFor = (factIds: readonly UUID[]): string[] => {
    const hits = sentLines
      .filter((l) => l.evidenceFactIds.some((id) => factIds.includes(id)))
      .map((l) => l.text);
    return [...new Set(hits)].slice(0, 3);
  };

  const strongest = sentLines
    .filter((l) => l.section === "experience")
    .slice(0, 3)
    .map((l) => l.text);
  const questions: PracticeQuestion[] = [
    {
      id: "intro",
      kind: "introduction",
      question: `Tell me about yourself, and why the ${job.title} role at ${job.company}?`,
      why: "Almost every interview opens this way. Aim for 60–90 seconds: who you are professionally, two results from the resume you sent, and why this role.",
      useThese: strongest,
      evidenceFactIds: [],
    },
    ...prep.questions.map((q, i) => ({
      id: `q${i}`,
      kind: q.kind === "technical" ? ("technical" as const) : ("behavioral" as const),
      question: q.question,
      why: q.why,
      useThese: linesFor(q.evidenceFactIds),
      evidenceFactIds: q.evidenceFactIds,
    })),
    ...prep.explainThese.map((q, i) => ({
      id: `gap${i}`,
      kind: "gap" as const,
      question: q.question,
      why: q.why,
      useThese: linesFor(q.evidenceFactIds),
      evidenceFactIds: q.evidenceFactIds,
    })),
  ];

  const critical = analysis.matches.filter(
    (m) => m.importance === "critical" || m.importance === "important",
  );
  const briefing = [
    `${job.title} at ${job.company}${job.location === undefined ? "" : `, ${job.location}`}.`,
    `You applied on ${submission.submittedOn} via ${submission.submittedVia}, using the resume and ${submission.coverLetter === undefined ? "no cover letter" : "cover letter"} archived with this application.`,
    `${critical.length} key requirement(s) in the posting: ${critical.filter((m) => m.status === "strong_match" || m.status === "terminology_match").length} strongly evidenced, ${critical.filter((m) => m.status === "partial_match").length} partly, ${critical.filter((m) => m.status === "not_evidenced").length} not evidenced.`,
    ...(job.facets.compensation === undefined
      ? []
      : [`Posted compensation: ${job.facets.compensation}.`]),
  ];

  const askThem = [
    "What would success look like in this role after the first 90 days?",
    "What is the biggest operational challenge the team is facing right now?",
    ...(job.facets.responsibilities[0] === undefined
      ? []
      : [
          `The posting mentions "${job.facets.responsibilities[0].slice(0, 90)}" — how is that measured today?`,
        ]),
    "How is the team structured, and who would I work with most closely?",
    "What are the next steps in the process, and the timeline?",
  ];

  const timestamp = now();
  return {
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    profileId: submission.profileId,
    opportunityId: submission.opportunityId,
    submissionId: submission.id,
    round: input.round,
    briefing,
    questions,
    askThem,
    attempts: [],
  };
}

const SITUATION =
  /\b(when i|at my|in my (last|previous|current)|we were|the (team|site|warehouse|facility|company) (was|had)|there was|our)\b/i;
const TASK =
  /\b(i was (responsible|tasked|asked)|my (job|role|goal|responsibility) was|needed to|had to|the goal)\b/i;
const ACTION =
  /\b(i (led|built|created|implemented|introduced|changed|trained|organized|negotiated|redesigned|set up|started|decided|worked|ran|managed|coached|reduced|improved))\b/i;
const RESULT =
  /\b(result|as a result|which (cut|reduced|improved|increased|saved)|we (cut|reduced|improved|increased|saved|hit|achieved)|ended up|%|percent|saved|on-time)\b/i;

/** Deterministic, explainable feedback on one practice answer. */
export function assessAnswer(
  question: PracticeQuestion,
  answer: string,
  facts: readonly CareerFact[],
): AnswerFeedback {
  const text = answer.trim();
  const wordCount = text.length === 0 ? 0 : text.split(/\s+/).length;
  const star = {
    situation: SITUATION.test(text),
    task: TASK.test(text),
    action: ACTION.test(text),
    result: RESULT.test(text),
  };
  const bankNumbers = new Set(facts.flatMap((f) => f.numbers));
  const unverifiedFigures = extractNumbers(text).filter((n) => !bankNumbers.has(n));

  const strengths: string[] = [];
  const improvements: string[] = [];
  if (star.action) strengths.push("You describe what you personally did.");
  else
    improvements.push(
      'Say what YOU did, in first person: "I reorganised…", "I trained…".',
    );
  if (star.result) strengths.push("You state an outcome.");
  else
    improvements.push(
      "Finish with the result — what changed, ideally with a number from your resume.",
    );
  if (!star.situation && question.kind !== "introduction")
    improvements.push(
      "Open with one sentence of context: where you were and what was happening.",
    );
  if (!star.task && question.kind !== "introduction")
    improvements.push("Name what you were accountable for, and the constraint.");
  if (wordCount < 60)
    improvements.push(
      "This is short for a spoken answer. Aim for roughly 120–250 words (about 1–2 minutes).",
    );
  else if (wordCount > 350)
    improvements.push(
      "This runs long. Cut to the one example that best fits the question.",
    );
  else strengths.push("A good length for a spoken answer.");
  if (question.kind === "gap") {
    if (
      /\b(i have not|i haven't|not directly|no direct|closest|adjacent)\b/i.test(text)
    )
      strengths.push(
        "You are candid about the gap, which is stronger than stretching.",
      );
    else
      improvements.push(
        "For a gap question, say plainly what you have not done, then what is closest and how you would close it.",
      );
  }
  if (
    question.useThese.length > 0 &&
    !question.useThese.some(
      (l) =>
        extractNumbers(l).some((n) => text.includes(n)) ||
        l
          .split(" ")
          .slice(0, 4)
          .join(" ")
          .toLowerCase()
          .split(" ")
          .every((w) => text.toLowerCase().includes(w)),
    )
  ) {
    improvements.push(
      "Draw on the lines from the resume you sent — the interviewer has that page in front of them.",
    );
  }
  if (unverifiedFigures.length > 0) {
    improvements.push(
      `These figures are not in your experience bank: ${unverifiedFigures.join(", ")}. If they are accurate, add them to your bank; if not, do not use them.`,
    );
  }
  const starCount = Object.values(star).filter(Boolean).length;
  const score = Math.max(
    1,
    Math.min(
      5,
      Math.round(
        starCount +
          (wordCount >= 60 && wordCount <= 350 ? 1 : 0) -
          (unverifiedFigures.length > 0 ? 1 : 0),
      ),
    ),
  );
  return { score, star, wordCount, strengths, improvements, unverifiedFigures };
}

export function recordAttempt(
  session: PracticeSession,
  questionId: string,
  answer: string,
  facts: readonly CareerFact[],
): PracticeSession {
  const question = session.questions.find((q) => q.id === questionId);
  if (question === undefined)
    throw new Error("That question is not part of this practice session.");
  if (answer.trim().length === 0) throw new Error("Write an answer to get feedback.");
  if (answer.length > 6000) throw new Error("Answers are limited to 6,000 characters.");
  const attempt: PracticeAttempt = {
    id: newId(),
    questionId,
    answer: answer.trim(),
    feedback: assessAnswer(question, answer, facts),
    at: now(),
  };
  return { ...session, attempts: [...session.attempts, attempt], updatedAt: now() };
}
