/**
 * The application pipeline: decisions, stages, the frozen submission archive,
 * interviews, follow-ups and the dashboard figures.
 *
 * Three rules are enforced here rather than in the UI:
 *
 *   - Generating documents moves an opportunity to Documents Ready. Only the
 *     subscriber confirming a submission, with a date, moves it to Applied.
 *   - Stage changes follow a transition table. A free-text status cannot be
 *     smuggled in through a form.
 *   - A submission is created once from deep copies of the exact documents and
 *     hashed. Nothing in this module (or the app) updates it afterwards.
 */

import { createHash } from "node:crypto";

import { buildExportDocument } from "../export/document.ts";
import { renderPlainText } from "../export/plain.ts";
import { newId, now } from "../text.ts";
import type { ApplicationStatus, CoverLetter, GeneratedResume } from "../types.ts";
import { isIsoDate } from "./intake.ts";
import type {
  FollowUp,
  InterviewRound,
  Opportunity,
  Stage,
  Submission,
} from "./types.ts";

export const STAGE_LABELS: Readonly<Record<Stage, string>> = {
  new_match: "New Matches",
  saved: "Saved",
  pursuing: "Pursuing",
  documents_ready: "Documents Ready",
  applied: "Applied",
  recruiter_screen: "Recruiter Screen",
  interviewing: "Interviewing",
  final_interview: "Final Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  closed: "Closed",
  passed: "Passed",
};

const AFTER_APPLIED: readonly Stage[] = [
  "recruiter_screen",
  "interviewing",
  "final_interview",
  "offer",
  "rejected",
  "withdrawn",
  "closed",
];

/**
 * Allowed manual moves. `applied` is absent everywhere: the only way in is
 * `confirmSubmission`. `documents_ready` is reached by generating documents.
 */
export const TRANSITIONS: Readonly<Record<Stage, readonly Stage[]>> = {
  new_match: ["saved", "pursuing", "passed"],
  saved: ["pursuing", "passed", "new_match"],
  pursuing: ["saved", "passed", "withdrawn"],
  documents_ready: ["pursuing", "passed", "withdrawn"],
  applied: AFTER_APPLIED,
  recruiter_screen: AFTER_APPLIED.filter((s) => s !== "recruiter_screen"),
  interviewing: AFTER_APPLIED.filter(
    (s) => s !== "interviewing" && s !== "recruiter_screen",
  ),
  final_interview: ["offer", "rejected", "withdrawn", "closed", "interviewing"],
  offer: ["closed", "withdrawn", "rejected"],
  rejected: ["closed"],
  withdrawn: ["closed"],
  closed: [],
  passed: ["saved", "new_match"],
};

export const POST_SUBMISSION: ReadonlySet<Stage> = new Set<Stage>([
  "applied",
  ...AFTER_APPLIED,
]);

/**
 * How the new stages map onto the ATS optimizer's existing
 * `ats.application_status` enum, for anything that still reads it.
 * New Matches / Saved / Pursuing / Passed have no legacy equivalent and
 * map to `researching`.
 */
export const LEGACY_STATUS: Readonly<Record<Stage, ApplicationStatus>> = {
  new_match: "researching",
  saved: "researching",
  pursuing: "researching",
  documents_ready: "resume_created",
  applied: "applied",
  recruiter_screen: "recruiter_screen",
  interviewing: "interviewing",
  final_interview: "final_interview",
  offer: "offer",
  rejected: "rejected",
  withdrawn: "withdrawn",
  closed: "closed",
  passed: "closed",
};

export class PipelineError extends Error {}

function move(o: Opportunity, stage: Stage, note?: string): Opportunity {
  const at = now();
  return {
    ...o,
    stage,
    history: [
      ...o.history,
      { stage, at, ...(note === undefined || note === "" ? {} : { note }) },
    ],
    updatedAt: at,
  };
}

export function changeStage(o: Opportunity, to: string, note?: string): Opportunity {
  const target = to as Stage;
  if (!(target in STAGE_LABELS)) throw new PipelineError(`"${to}" is not a stage.`);
  if (target === "applied")
    throw new PipelineError(
      "An application is marked Applied only when you confirm you submitted it, with the date.",
    );
  if (target === "documents_ready")
    throw new PipelineError("Documents Ready is set by generating documents.");
  if (!TRANSITIONS[o.stage].includes(target))
    throw new PipelineError(
      `Cannot move from ${STAGE_LABELS[o.stage]} to ${STAGE_LABELS[target]}.`,
    );
  return move(o, target, note);
}

export function decide(
  o: Opportunity,
  decision: "pursue" | "pass" | "save",
  reasons: readonly string[] = [],
): Opportunity {
  const to: Stage =
    decision === "pursue" ? "pursuing" : decision === "pass" ? "passed" : "saved";
  if (o.stage === to) return o;
  const next = changeStage(o, to);
  return decision === "pass"
    ? { ...next, passReasons: reasons.filter((r) => r.trim().length > 0) }
    : next;
}

/** Record freshly generated drafts. Never touches a submission. */
export function attachDrafts(
  o: Opportunity,
  drafts: { resumeId?: string; coverLetterId?: string; outreach?: string },
): Opportunity {
  const updated: Opportunity = {
    ...o,
    draftResumeIds:
      drafts.resumeId === undefined
        ? o.draftResumeIds
        : [...o.draftResumeIds, drafts.resumeId],
    draftCoverLetterIds:
      drafts.coverLetterId === undefined
        ? o.draftCoverLetterIds
        : [...o.draftCoverLetterIds, drafts.coverLetterId],
    outreachDrafts:
      drafts.outreach === undefined
        ? o.outreachDrafts
        : [...o.outreachDrafts, drafts.outreach],
    updatedAt: now(),
  };
  // Generation means Documents Ready — never Applied. After submission the
  // stage is left exactly where it is.
  if (o.stage === "pursuing" || o.stage === "saved" || o.stage === "new_match")
    return move(updated, "documents_ready");
  return updated;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashSubmission(s: Omit<Submission, "contentHash">): string {
  return createHash("sha256")
    .update(
      canonical({
        opportunityId: s.opportunityId,
        submittedOn: s.submittedOn,
        submittedVia: s.submittedVia,
        postingSnapshot: s.postingSnapshot,
        resume: s.resume,
        resumeText: s.resumeText,
        coverLetter: s.coverLetter ?? null,
        coverLetterText: s.coverLetterText ?? null,
      }),
    )
    .digest("hex");
}

export function verifySubmission(s: Submission): boolean {
  const { contentHash, ...rest } = s;
  return hashSubmission(rest) === contentHash;
}

export function coverLetterText(letter: CoverLetter): string {
  const exportable = letter.paragraphs.filter(
    (p) => p.validation === "verified" || p.validation === "user_confirmed",
  );
  return [letter.greeting, "", ...exportable.map((p) => p.text), "", letter.closing]
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Validate a submission date: a real calendar date, not in the future, not absurdly old. */
export function validateSubmissionDate(
  value: string,
  today = now().slice(0, 10),
): string | null {
  if (!isIsoDate(value))
    return "Enter the date you submitted, as a real calendar date.";
  if (value > today) return "The submission date cannot be in the future.";
  if (value < "2000-01-01") return "That date is too far in the past.";
  return null;
}

/**
 * Confirm the subscriber submitted this application.
 *
 * Takes deep copies of the exact resume and cover letter versions they chose,
 * renders the resume text exactly as the export would (unsupported lines
 * dropped), hashes the lot, and moves the opportunity to Applied.
 */
export function confirmSubmission(input: {
  readonly opportunity: Opportunity;
  readonly resume: GeneratedResume;
  readonly coverLetter?: CoverLetter;
  readonly submittedOn: string;
  readonly submittedVia: string;
  readonly today?: string;
}): { opportunity: Opportunity; submission: Submission } {
  const { opportunity } = input;
  if (opportunity.submissionId !== undefined)
    throw new PipelineError(
      "This application was already submitted. Its archived package cannot be replaced.",
    );
  if (opportunity.stage !== "documents_ready" && opportunity.stage !== "pursuing")
    throw new PipelineError(
      "Choose Pursue and prepare documents before confirming a submission.",
    );
  if (!opportunity.draftResumeIds.includes(input.resume.id))
    throw new PipelineError("That resume was not prepared for this opportunity.");
  if (
    input.coverLetter !== undefined &&
    !opportunity.draftCoverLetterIds.includes(input.coverLetter.id)
  )
    throw new PipelineError("That cover letter was not prepared for this opportunity.");
  const dateError = validateSubmissionDate(input.submittedOn, input.today);
  if (dateError !== null) throw new PipelineError(dateError);
  const via = input.submittedVia.trim();
  if (via.length === 0 || via.length > 200)
    throw new PipelineError("Say where you submitted the application.");

  const resume = structuredClone(input.resume);
  const coverLetter =
    input.coverLetter === undefined ? undefined : structuredClone(input.coverLetter);
  const timestamp = now();
  const base: Omit<Submission, "contentHash"> = {
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    profileId: opportunity.profileId,
    opportunityId: opportunity.id,
    submittedOn: input.submittedOn,
    submittedVia: via,
    employer: opportunity.employer,
    title: opportunity.title,
    postingSnapshot: opportunity.descriptionSnapshot,
    resume,
    resumeText: renderPlainText(buildExportDocument(resume).document),
    ...(coverLetter === undefined
      ? {}
      : { coverLetter, coverLetterText: coverLetterText(coverLetter) }),
  };
  const submission: Submission = deepFreeze({
    ...base,
    contentHash: hashSubmission(base),
  });
  const moved = move(
    opportunity,
    "applied",
    `Submitted via ${via} on ${input.submittedOn}`,
  );
  return {
    opportunity: { ...moved, submissionId: submission.id, submittedVia: via },
    submission,
  };
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Interviews and follow-ups
// ---------------------------------------------------------------------------

export function addInterview(
  o: Opportunity,
  input: { label: string; date: string; format?: string },
): Opportunity {
  if (!isIsoDate(input.date))
    throw new PipelineError("Enter the interview date as a real calendar date.");
  if (input.label.trim().length === 0)
    throw new PipelineError("Name the interview round, e.g. 'Phone screen'.");
  const round: InterviewRound = {
    id: newId(),
    label: input.label.trim().slice(0, 80),
    date: input.date,
    ...(input.format === undefined || input.format.trim() === ""
      ? {}
      : { format: input.format.trim().slice(0, 80) }),
    notes: "",
  };
  return { ...o, interviews: [...o.interviews, round], updatedAt: now() };
}

export function updateInterviewNotes(
  o: Opportunity,
  roundId: string,
  notes: string,
): Opportunity {
  return {
    ...o,
    interviews: o.interviews.map((r) =>
      r.id === roundId ? { ...r, notes: notes.slice(0, 5000) } : r,
    ),
    updatedAt: now(),
  };
}

export function thankYouDraft(
  o: Opportunity,
  round: InterviewRound,
  name: string,
): string {
  const who = o.contacts[0]?.name;
  return [
    `Dear ${who ?? "[interviewer's name]"},`,
    "",
    `Thank you for taking the time to speak with me ${round.label.toLowerCase().includes("interview") ? "in the" : "during the"} ${round.label} for the ${o.title} role at ${o.employer}.`,
    "[One specific thing you discussed that you want to follow up on — in your own words.]",
    `I remain interested in the role and would welcome the next step.`,
    "",
    "Best regards,",
    name || "[Your name]",
  ].join("\n");
}

export function addFollowUp(o: Opportunity, due: string, action: string): Opportunity {
  if (!isIsoDate(due))
    throw new PipelineError("Enter the follow-up date as a real calendar date.");
  if (action.trim().length === 0) throw new PipelineError("Say what the follow-up is.");
  const item: FollowUp = {
    id: newId(),
    due,
    action: action.trim().slice(0, 200),
    done: false,
  };
  return { ...o, followUps: [...o.followUps, item], updatedAt: now() };
}

export function completeFollowUp(o: Opportunity, id: string): Opportunity {
  return {
    ...o,
    followUps: o.followUps.map((f) => (f.id === id ? { ...f, done: true } : f)),
    updatedAt: now(),
  };
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface PipelineSummary {
  readonly byStage: Readonly<Record<Stage, number>>;
  readonly total: number;
  readonly applied: number;
  readonly interviewsUpcoming: { opportunity: Opportunity; round: InterviewRound }[];
  readonly followUpsDue: { opportunity: Opportunity; followUp: FollowUp }[];
  readonly outcomesBySource: {
    source: string;
    found: number;
    applied: number;
    interviews: number;
    offers: number;
  }[];
}

export function summarize(
  opportunities: readonly Opportunity[],
  today = now().slice(0, 10),
): PipelineSummary {
  const byStage = Object.fromEntries(
    Object.keys(STAGE_LABELS).map((s) => [s, 0]),
  ) as Record<Stage, number>;
  const sources = new Map<
    string,
    { found: number; applied: number; interviews: number; offers: number }
  >();
  const upcoming: { opportunity: Opportunity; round: InterviewRound }[] = [];
  const due: { opportunity: Opportunity; followUp: FollowUp }[] = [];
  for (const o of opportunities) {
    byStage[o.stage]++;
    const key = o.foundVia;
    const s = sources.get(key) ?? { found: 0, applied: 0, interviews: 0, offers: 0 };
    s.found++;
    if (o.submissionId !== undefined) s.applied++;
    if (
      o.history.some(
        (h) =>
          h.stage === "interviewing" ||
          h.stage === "final_interview" ||
          h.stage === "recruiter_screen",
      ) ||
      o.interviews.length > 0
    )
      s.interviews++;
    if (o.history.some((h) => h.stage === "offer")) s.offers++;
    sources.set(key, s);
    for (const r of o.interviews)
      if (r.date >= today) upcoming.push({ opportunity: o, round: r });
    for (const f of o.followUps)
      if (!f.done && f.due <= today) due.push({ opportunity: o, followUp: f });
  }
  return {
    byStage,
    total: opportunities.length,
    applied: opportunities.filter((o) => o.submissionId !== undefined).length,
    interviewsUpcoming: upcoming.sort((a, b) =>
      a.round.date.localeCompare(b.round.date),
    ),
    followUpsDue: due.sort((a, b) => a.followUp.due.localeCompare(b.followUp.due)),
    outcomesBySource: [...sources.entries()]
      .map(([source, v]) => ({ source, ...v }))
      .sort((a, b) => b.found - a.found),
  };
}
