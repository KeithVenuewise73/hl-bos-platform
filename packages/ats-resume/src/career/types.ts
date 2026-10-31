/**
 * The HLG Career Platform domain model.
 *
 * These records extend the ATS Resume Optimizer rather than replacing it. The
 * optimizer already owns the evidence corpus (`CareerFact`), the analysis and
 * the tailored-resume generator; the career platform adds what surrounds
 * them: who the subscriber is looking for, the opportunities they find, the
 * decisions they make, and — the part with legal and personal weight — the
 * exact documents they actually sent.
 *
 * Two rules shape this file:
 *
 *   1. Employment SITUATION and search ACTIVITY are stored, but neither is an
 *      input to any fit or qualification score. `SearchCriteria` is the type
 *      the scorer accepts, and it omits both by construction.
 *   2. A `Submission` is a frozen historical record. Nothing in the platform
 *      updates one after it is created; regenerating or editing documents
 *      creates new drafts and leaves the submission untouched.
 */

import type {
  CoverLetter,
  EducationEntry,
  FactCategory,
  GeneratedResume,
  RecordMeta,
  Timestamp,
  UUID,
  ValidationStatus,
} from "../types.ts";

// ---------------------------------------------------------------------------
// 1. Intake
// ---------------------------------------------------------------------------

export const EMPLOYMENT_SITUATIONS = [
  "employed_full_time",
  "employed_part_time",
  "self_employed",
  "unemployed",
  "student",
  "career_break",
  "prefer_not_to_say",
] as const;
export type EmploymentSituation = (typeof EMPLOYMENT_SITUATIONS)[number];

export const SEARCH_ACTIVITIES = [
  "actively_applying",
  "selectively_exploring",
  "passively_open",
  "preparing",
] as const;
export type SearchActivity = (typeof SEARCH_ACTIVITIES)[number];

export const CAREER_GOALS = [
  "advancement",
  "lateral",
  "industry_change",
  "return_to_work",
] as const;
export type CareerGoal = (typeof CAREER_GOALS)[number];

export const WORK_ARRANGEMENTS = ["remote", "hybrid", "on_site"] as const;
export type WorkArrangement = (typeof WORK_ARRANGEMENTS)[number];

export const EMPLOYMENT_TYPES = [
  "full_time",
  "part_time",
  "contract",
  "temporary",
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const SHIFT_LIMITS = [
  "no_overnight",
  "no_weekends",
  "no_rotating",
  "days_only",
] as const;
export type ShiftLimit = (typeof SHIFT_LIMITS)[number];

export const PAY_PERIODS = ["hour", "week", "month", "year"] as const;
export type PayPeriod = (typeof PAY_PERIODS)[number];

/**
 * One search criterion, plus whether the subscriber treats it as a firm
 * requirement or a preference. A firm criterion that fails blocks a match; a
 * preference that fails only lowers the preference score.
 */
export interface Criterion<T> {
  readonly value: T;
  readonly firm: boolean;
}

export interface SalaryExpectation {
  readonly minimum?: number;
  readonly target?: number;
  readonly currency: string;
  readonly period: PayPeriod;
  /** Firm means "do not show me roles that disclose less than the minimum". */
  readonly firm: boolean;
}

/** What the fit scorer is allowed to see. Situation and activity are absent. */
export interface SearchCriteria {
  readonly targetTitles: readonly string[];
  readonly relatedTitles: readonly string[];
  readonly keywords: readonly string[];
  readonly industries: readonly string[];
  readonly goals: readonly CareerGoal[];
  readonly locations: Criterion<readonly string[]>;
  readonly maxCommuteMiles?: Criterion<number>;
  readonly arrangements: Criterion<readonly WorkArrangement[]>;
  readonly willingToRelocate: boolean;
  readonly maxTravelPercent?: Criterion<number>;
  readonly shiftLimits: Criterion<readonly ShiftLimit[]>;
  readonly employmentTypes: Criterion<readonly EmploymentType[]>;
  readonly salary?: SalaryExpectation;
}

export interface SearchProfile extends RecordMeta, SearchCriteria {
  readonly profileId: UUID;
  readonly employmentSituation: EmploymentSituation;
  readonly searchActivity: SearchActivity;
  /** Confidential search: never contact the current employer; hide it in outreach. */
  readonly confidential: boolean;
  /** Desired start date (YYYY-MM-DD) or a notice period in words. */
  readonly availability: string;
}

// ---------------------------------------------------------------------------
// 2. Experience bank and base resume
// ---------------------------------------------------------------------------

export type InterpretationStatus = "pending" | "confirmed" | "rejected";

/**
 * Something the platform INFERRED rather than read or was told.
 *
 * Interpretations are deliberately not `CareerFact`s. They become evidence
 * only when the subscriber confirms them, at which point a `user_confirmed`
 * fact is created and linked here. Until then nothing can cite them.
 */
export interface Interpretation extends RecordMeta {
  readonly profileId: UUID;
  readonly category: FactCategory;
  readonly proposedText: string;
  readonly context?: string;
  /** The facts this was inferred from, quoted so the subscriber can judge. */
  readonly basisFactIds: readonly UUID[];
  readonly basisText: readonly string[];
  readonly reason: string;
  readonly status: InterpretationStatus;
  readonly confirmedFactId?: UUID;
  readonly engine: string;
}

export type QuestionTopic =
  | "scope"
  | "metrics"
  | "systems"
  | "credentials"
  | "transferable"
  | "examples"
  | "history";

/** A targeted question that uncovers evidence the resume does not state. */
export interface ExperienceQuestion {
  readonly id: string;
  readonly topic: QuestionTopic;
  readonly prompt: string;
  readonly hint: string;
  readonly category: FactCategory;
  readonly context?: string;
}

export interface BaseResumeLine {
  readonly text: string;
  readonly factIds: readonly UUID[];
  readonly validation: ValidationStatus;
  readonly notes: readonly string[];
}

export interface BaseResumeRole {
  readonly title: string;
  readonly employer: string;
  readonly location?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly current: boolean;
  readonly bullets: readonly BaseResumeLine[];
}

export type BaseResumeStatus = "draft" | "approved" | "superseded";

/**
 * The subscriber-approved base resume. Versions are never edited in place:
 * an edit produces a new draft, and approving it supersedes the previous one.
 */
export interface BaseResume extends RecordMeta {
  readonly profileId: UUID;
  readonly versionNumber: number;
  readonly sourceResumeId: UUID;
  readonly status: BaseResumeStatus;
  readonly fullName: string;
  readonly headline: string;
  readonly summary: readonly BaseResumeLine[];
  readonly skills: readonly string[];
  readonly roles: readonly BaseResumeRole[];
  readonly education: readonly EducationEntry[];
  readonly certifications: readonly string[];
  /** Facts in the bank but left out of this version — still kept, still usable. */
  readonly omittedFactIds: readonly UUID[];
  readonly approvedAt?: Timestamp;
  /** The master resume record created on approval, used by the tailoring engine. */
  readonly masterResumeId?: UUID;
}

// ---------------------------------------------------------------------------
// 3. Discovery
// ---------------------------------------------------------------------------

export type SourceId = "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "manual";

export interface SourceDescriptor {
  readonly id: SourceId;
  readonly name: string;
  readonly kind: "employer_ats_feed" | "manual_import";
  readonly status: "supported" | "manual";
  readonly coverage: string;
}

/** An employer job board the subscriber has asked the platform to watch. */
export interface EmployerBoard extends RecordMeta {
  readonly profileId: UUID;
  readonly employer: string;
  readonly source: Exclude<SourceId, "manual">;
  readonly boardToken: string;
  readonly lastCheckedAt?: Timestamp;
  readonly lastResult?: "ok" | "failed";
  readonly lastError?: string;
  readonly lastCount?: number;
}

export type CheckResult = "pass" | "fail" | "unknown";

export interface FitCheck {
  readonly criterion: string;
  readonly firm: boolean;
  readonly result: CheckResult;
  readonly detail: string;
}

export interface FitAssessment {
  readonly label: "strong" | "possible" | "blocked";
  readonly preferenceScore: number;
  readonly qualificationScore?: number;
  readonly checks: readonly FitCheck[];
  readonly reasons: readonly string[];
  readonly gaps: readonly string[];
  readonly uncertain: readonly string[];
  readonly assessedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// 4–6. Pipeline, submissions, interviews
// ---------------------------------------------------------------------------

export const STAGES = [
  "new_match",
  "saved",
  "pursuing",
  "documents_ready",
  "applied",
  "recruiter_screen",
  "interviewing",
  "final_interview",
  "offer",
  "rejected",
  "withdrawn",
  "closed",
  "passed",
] as const;
export type Stage = (typeof STAGES)[number];

export interface StageEvent {
  readonly stage: Stage;
  readonly at: Timestamp;
  readonly note?: string;
}

export interface Contact {
  readonly id: UUID;
  readonly name: string;
  readonly role?: string;
  readonly email?: string;
  readonly phone?: string;
}

export interface InterviewRound {
  readonly id: UUID;
  readonly label: string;
  readonly date: string;
  readonly format?: string;
  readonly notes: string;
  readonly thankYouDraft?: string;
}

export interface FollowUp {
  readonly id: UUID;
  readonly due: string;
  readonly action: string;
  readonly done: boolean;
}

export interface SightingRecord {
  readonly source: SourceId;
  readonly url?: string;
  readonly location?: string;
  readonly seenAt: Timestamp;
}

export interface Opportunity extends RecordMeta {
  readonly profileId: UUID;
  readonly source: SourceId;
  readonly boardId?: UUID;
  readonly externalId?: string;
  readonly employer: string;
  readonly title: string;
  readonly location?: string;
  readonly salaryText?: string;
  readonly url?: string;
  readonly postedAt?: string;
  readonly retrievedAt: Timestamp;
  /** The posting text as it was when retrieved. Never refreshed in place. */
  readonly descriptionSnapshot: string;
  readonly alsoSeen: readonly SightingRecord[];
  readonly expiredAt?: Timestamp;
  readonly stage: Stage;
  readonly history: readonly StageEvent[];
  readonly passReasons: readonly string[];
  readonly fit?: FitAssessment;
  /** Where the opportunity was found — the source label shown to the user. */
  readonly foundVia: string;
  /** Where the application was submitted — set only on confirmed submission. */
  readonly submittedVia?: string;
  readonly jobPostingId?: UUID;
  readonly analysisId?: UUID;
  readonly draftResumeIds: readonly UUID[];
  readonly draftCoverLetterIds: readonly UUID[];
  readonly outreachDrafts: readonly string[];
  readonly submissionId?: UUID;
  readonly contacts: readonly Contact[];
  readonly interviews: readonly InterviewRound[];
  readonly followUps: readonly FollowUp[];
  readonly notes: string;
  readonly outcome?: string;
}

/**
 * The exact package the subscriber confirmed they sent. Frozen: nothing in
 * the platform modifies one, and `contentHash` lets anyone prove it.
 */
export interface Submission extends RecordMeta {
  readonly profileId: UUID;
  readonly opportunityId: UUID;
  readonly submittedOn: string;
  readonly submittedVia: string;
  readonly employer: string;
  readonly title: string;
  readonly postingSnapshot: string;
  readonly resume: GeneratedResume;
  readonly resumeText: string;
  readonly coverLetter?: CoverLetter;
  readonly coverLetterText?: string;
  readonly contentHash: string;
}

export interface PracticeAttempt {
  readonly id: UUID;
  readonly questionId: string;
  readonly answer: string;
  readonly feedback: AnswerFeedback;
  readonly at: Timestamp;
}

export interface AnswerFeedback {
  readonly score: number;
  readonly star: {
    readonly situation: boolean;
    readonly task: boolean;
    readonly action: boolean;
    readonly result: boolean;
  };
  readonly wordCount: number;
  readonly strengths: readonly string[];
  readonly improvements: readonly string[];
  /** Figures in the answer that are not in the experience bank. */
  readonly unverifiedFigures: readonly string[];
}

export interface PracticeQuestion {
  readonly id: string;
  readonly kind: "introduction" | "behavioral" | "technical" | "gap" | "motivation";
  readonly question: string;
  readonly why: string;
  /** Lines from the SUBMITTED resume worth drawing on. */
  readonly useThese: readonly string[];
  readonly evidenceFactIds: readonly UUID[];
}

export interface PracticeSession extends RecordMeta {
  readonly profileId: UUID;
  readonly opportunityId: UUID;
  readonly submissionId: UUID;
  readonly round: string;
  readonly briefing: readonly string[];
  readonly questions: readonly PracticeQuestion[];
  readonly askThem: readonly string[];
  readonly attempts: readonly PracticeAttempt[];
}

// ---------------------------------------------------------------------------
// 7. LinkedIn
// ---------------------------------------------------------------------------

export type LinkedInItemKind = "headline" | "about" | "experience" | "skills" | "post";

export interface LinkedInItem extends RecordMeta {
  readonly profileId: UUID;
  readonly kind: LinkedInItemKind;
  readonly label: string;
  readonly text: string;
  readonly factIds: readonly UUID[];
  readonly validation: ValidationStatus;
  readonly notes: readonly string[];
  readonly status:
    "suggested" | "accepted" | "dismissed" | "draft" | "ready" | "published_manually";
  readonly scheduledFor?: string;
}

// ---------------------------------------------------------------------------
// 8. Plans and usage
// ---------------------------------------------------------------------------

export type MeteredAction =
  | "resume_upload"
  | "base_resume_draft"
  | "discovery_run"
  | "job_import"
  | "package_generation"
  | "practice_answer"
  | "linkedin_generation";

export interface UsageEvent extends RecordMeta {
  readonly profileId: UUID;
  readonly action: MeteredAction;
  readonly engine: string;
  readonly estimatedCostUsd: number;
}
