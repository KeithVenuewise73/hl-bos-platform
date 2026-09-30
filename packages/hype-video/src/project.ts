/**
 * Project lifecycle: status, consent and readiness.
 *
 * Pure functions over a plain record, so the same rules hold whether the
 * project lives in the app's local store or, later, in `hype.hype_projects`.
 */

import { findTemplate } from "./templates.ts";
import type {
  Accent,
  AthleteDetails,
  CreatorRole,
  GenerationRecord,
  MediaKind,
  OutputType,
  ProjectStatus,
  TemplateKey,
  Tone,
  Visibility,
} from "./types.ts";
import { validateDetails } from "./validation.ts";

export interface MediaItem {
  readonly id: string;
  readonly kind: MediaKind;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly originalName: string;
  readonly uploadedAt: string;
}

/**
 * What the person creating the project stated. Recorded, not verified: the
 * product cannot check that someone is a parent, and nothing in the code or
 * the copy may claim that it did.
 */
export interface ConsentRecord {
  /** "I have the right to use this media and permission from anyone shown in it." */
  readonly mediaRightsConfirmed: boolean;
  /** Whether the athlete (or anyone featured) is under 18. Defaults to yes. */
  readonly featuresMinor: boolean;
  /** Required when featuresMinor: "I am the parent/guardian, or have their consent." */
  readonly guardianConsentConfirmed: boolean;
  /** Required when featuresMinor. The adult who gave consent. */
  readonly guardianName: string;
  readonly confirmedAt: string | null;
}

export interface HypeProject {
  readonly id: string;
  readonly name: string;
  readonly creatorRole: CreatorRole;
  readonly template: TemplateKey;
  readonly tone: Tone;
  readonly outputTypes: readonly OutputType[];
  readonly accent: Accent;
  readonly visibility: Visibility;
  readonly status: ProjectStatus;
  readonly consent: ConsentRecord;
  readonly details: AthleteDetails | null;
  readonly media: readonly MediaItem[];
  /** Newest first. Every generation is kept, so a regenerate never loses work. */
  readonly generations: readonly GenerationRecord[];
  /** True once details change after the latest generation. */
  readonly packageStale: boolean;
  readonly exportedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const RANK: Readonly<Record<ProjectStatus, number>> = {
  draft: 0,
  media_uploaded: 1,
  details_complete: 2,
  generated: 3,
  exported: 4,
  paid_download_pending: 5,
};

/**
 * Move a project forward. Status only ever rises: uploading another photo to
 * a generated project does not make it a draft again.
 *
 * `paid_download_pending` cannot be reached in this version. Payments are not
 * connected, and a status that implies a customer is part-way through paying
 * must not exist until one can be.
 */
export function advanceStatus(
  current: ProjectStatus,
  target: ProjectStatus,
): ProjectStatus {
  if (target === "paid_download_pending") {
    throw new Error(
      "Payments are not connected, so no project can be awaiting payment.",
    );
  }
  return RANK[target] > RANK[current] ? target : current;
}

export interface ConsentProblems {
  readonly ok: boolean;
  readonly problems: readonly string[];
}

export function checkConsent(consent: ConsentRecord): ConsentProblems {
  const problems: string[] = [];
  if (!consent.mediaRightsConfirmed) {
    problems.push(
      "Confirm you have the right to use this media and permission from everyone shown in it.",
    );
  }
  if (consent.featuresMinor) {
    if (!consent.guardianConsentConfirmed) {
      problems.push(
        "This project features someone under 18. Confirm you are their parent or guardian, or have their parent or guardian's consent.",
      );
    }
    if (consent.guardianName.trim().length === 0) {
      problems.push("Enter the name of the parent or guardian who gave consent.");
    }
  }
  return { ok: problems.length === 0, problems };
}

export interface Readiness {
  readonly canGenerate: boolean;
  /** Plain-English list of what is still missing, in the order to fix it. */
  readonly missing: readonly string[];
}

export function readiness(project: HypeProject): Readiness {
  const missing: string[] = [...checkConsent(project.consent).problems];
  if (project.details === null) {
    missing.push("Enter the athlete details.");
  } else {
    const v = validateDetails(project.details, project.template);
    missing.push(...Object.values(v.problems));
  }
  if (findTemplate(project.template) === undefined) missing.push("Choose a template.");
  // Media is encouraged, not required: a birthday post can be text-first,
  // and the video prompt says plainly that there was no footage.
  return { canGenerate: missing.length === 0, missing };
}

export function latestGeneration(project: HypeProject): GenerationRecord | null {
  return project.generations[0] ?? null;
}
