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
}

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
  };
}
