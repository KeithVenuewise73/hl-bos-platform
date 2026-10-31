/**
 * The shape of everything one account owns.
 *
 * A pure type module with no `server-only` marker and no imports that carry
 * one, so the planner and the mappers that work on this shape can be unit
 * tested. The stores that read and write it are server-only; the description
 * of what they move is not.
 */

import type {
  Application,
  CandidateProfile,
  CareerFact,
  CoverLetter,
  GeneratedResume,
  InterviewPrep,
  JobAnalysis,
  JobPosting,
  MasterResume,
} from "@hl-bos/ats-resume";
import type {
  BaseResume,
  EmployerBoard,
  Interpretation,
  LinkedInItem,
  Opportunity,
  PracticeSession,
  SearchProfile,
  Submission,
  UsageEvent,
} from "@hl-bos/ats-resume";

export interface Workspace {
  readonly version: 1;
  readonly userId: string;
  // Mutable by design: `updateWorkspace` hands a copy to a mutator and
  // persists the difference between that copy and the snapshot it loaded.
  profiles: CandidateProfile[];
  facts: CareerFact[];
  resumes: MasterResume[];
  jobs: JobPosting[];
  analyses: JobAnalysis[];
  generated: GeneratedResume[];
  applications: Application[];
  coverLetters: CoverLetter[];
  interviewPreps: InterviewPrep[];
  // HLG Career Platform. Persisted in PostgreSQL as `ats.career_records`
  // (migration 0053), one row per record, discriminated by kind.
  searchProfiles: SearchProfile[];
  interpretations: Interpretation[];
  baseResumes: BaseResume[];
  employerBoards: EmployerBoard[];
  opportunities: Opportunity[];
  /** Frozen. Created once on confirmed submission; never updated. */
  submissions: Submission[];
  practiceSessions: PracticeSession[];
  linkedinItems: LinkedInItem[];
  usageEvents: UsageEvent[];
}

/** Career collections and the `kind` each is stored under. */
export const CAREER_KINDS = {
  searchProfiles: "search_profile",
  interpretations: "interpretation",
  baseResumes: "base_resume",
  employerBoards: "employer_board",
  opportunities: "opportunity",
  submissions: "submission",
  practiceSessions: "practice_session",
  linkedinItems: "linkedin_item",
  usageEvents: "usage_event",
} as const;
export type CareerCollection = keyof typeof CAREER_KINDS;

export function emptyWorkspace(userId: string): Workspace {
  return {
    version: 1,
    userId,
    profiles: [],
    facts: [],
    resumes: [],
    jobs: [],
    analyses: [],
    generated: [],
    applications: [],
    coverLetters: [],
    interviewPreps: [],
    searchProfiles: [],
    interpretations: [],
    baseResumes: [],
    employerBoards: [],
    opportunities: [],
    submissions: [],
    practiceSessions: [],
    linkedinItems: [],
    usageEvents: [],
  };
}
