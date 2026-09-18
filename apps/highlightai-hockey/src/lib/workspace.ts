/**
 * The shape of everything one account owns.
 *
 * A pure type module with no `server-only` marker, so the things that operate
 * on this shape can be unit tested. The stores that read and write it are
 * server-only; the description of what they move is not.
 */

import type {
  CandidateEvent,
  Clip,
  HighlightProject,
  HighlightReel,
  MediaAsset,
  PlayerSegment,
  PlayerTrack,
  ProcessingJob,
} from "@hl-bos/hockey-highlights";

export interface StoredTracks {
  readonly projectId: string;
  readonly detectionSource: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly usedReferencePhoto: boolean;
  readonly notes: readonly string[];
  readonly tracks: readonly PlayerTrack[];
}

export interface Workspace {
  readonly version: 1;
  readonly userId: string;
  projects: HighlightProject[];
  media: MediaAsset[];
  jobs: ProcessingJob[];
  tracks: StoredTracks[];
  segments: PlayerSegment[];
  events: CandidateEvent[];
  clips: Clip[];
  reels: HighlightReel[];
}

export function emptyWorkspace(userId: string): Workspace {
  return {
    version: 1,
    userId,
    projects: [],
    media: [],
    jobs: [],
    tracks: [],
    segments: [],
    events: [],
    clips: [],
    reels: [],
  };
}

export function projectById(
  workspace: Workspace,
  id: string,
): HighlightProject | undefined {
  return workspace.projects.find((p) => p.id === id);
}

export function jobFor(
  workspace: Workspace,
  projectId: string,
): ProcessingJob | undefined {
  return workspace.jobs.find((j) => j.projectId === projectId);
}

export function mediaFor(
  workspace: Workspace,
  projectId: string,
  role: MediaAsset["role"],
): MediaAsset | undefined {
  return workspace.media.find((m) => m.projectId === projectId && m.role === role);
}

export function clipsFor(workspace: Workspace, projectId: string): Clip[] {
  return workspace.clips
    .filter((c) => c.projectId === projectId)
    .sort((a, b) => a.order - b.order);
}

export function segmentsFor(workspace: Workspace, projectId: string): PlayerSegment[] {
  return workspace.segments
    .filter((s) => s.projectId === projectId)
    .sort((a, b) => b.confidence - a.confidence);
}

export function eventsFor(workspace: Workspace, projectId: string): CandidateEvent[] {
  return workspace.events.filter((e) => e.projectId === projectId);
}

export function latestReel(
  workspace: Workspace,
  projectId: string,
): HighlightReel | undefined {
  return workspace.reels
    .filter((r) => r.projectId === projectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}
