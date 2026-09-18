import "server-only";

/**
 * Driving a job from one stage to the next.
 *
 * Every stage saves before it starts the next one, which is what makes "leave
 * the page and come back" true rather than aspirational: a process that dies
 * mid-pipeline loses at most the stage it was running, and the user returns to
 * a job that knows exactly where it got to.
 *
 * Failures are recorded on the job, never thrown away. A user coming back an
 * hour later has no log to read; the record is what tells them which stage
 * broke and whether trying again is worth anything.
 */

import {
  advanceJob,
  detectAndTrack,
  failJob,
  identifyAndDetectEvents,
  planClips,
  preprocess,
  selectProvider,
  type ProcessingJob,
  type VisionProvider,
} from "@hl-bos/hockey-highlights";

import { config } from "./config.ts";
import { updateWorkspace } from "./store.ts";
import { jobFor, mediaFor, projectById } from "./workspace.ts";

export function visionProvider(): VisionProvider {
  return selectProvider({ serviceUrl: config().visionServiceUrl });
}

/**
 * Run the whole analysis for one project.
 *
 * Returns the job as it ended up. It is deliberately not a background worker:
 * this phase runs the pipeline in one request and persists after every stage,
 * so the state is durable even though the execution is not resumable. A real
 * queue is the next step, and the state machine is already shaped for it —
 * `retryJob` resumes at the stage that failed.
 */
export async function runAnalysis(projectId: string): Promise<ProcessingJob> {
  const provider = visionProvider();

  // Refuse before starting rather than failing three stages in. A user should
  // be told "there is no analysis service" before they wait.
  const availability = await provider.availability();
  if (!availability.available) {
    return record(projectId, (job, now) =>
      failJob(
        job,
        {
          code: "vision_unavailable",
          detail: availability.detail,
          retryable: false,
        },
        now,
      ),
    );
  }

  const context = await readContext(projectId);
  if (context === null) {
    throw new Error("That project does not exist.");
  }

  // --- preprocess ----------------------------------------------------------
  await record(projectId, (job, now) => advanceJob(job, "preprocessing", { now }));
  const prepared = await preprocess(provider, context.originalKey);
  if (!prepared.ok) {
    return record(projectId, (job, now) =>
      failJob(
        job,
        { code: prepared.code, detail: prepared.detail, retryable: prepared.retryable },
        now,
      ),
    );
  }

  await updateWorkspace((workspace) => {
    const asset = workspace.media.find(
      (m) => m.projectId === projectId && m.role === "original",
    );
    if (asset !== undefined) {
      Object.assign(asset, {
        durationSeconds: prepared.probe.durationSeconds,
        width: prepared.probe.width,
        height: prepared.probe.height,
        frameRate: prepared.probe.frameRate,
        sizeBytes: prepared.probe.sizeBytes,
      });
    }
    workspace.media = workspace.media.filter(
      (m) => !(m.projectId === projectId && m.role === "proxy"),
    );
    workspace.media.push({
      id: `proxy-${projectId}`,
      projectId,
      role: "proxy",
      storageKey: prepared.proxyStorageKey,
      filename: "analysis-copy.mp4",
      contentType: "video/mp4",
      sizeBytes: null,
      durationSeconds: prepared.probe.durationSeconds,
      width: null,
      height: null,
      frameRate: prepared.probe.frameRate,
      createdAt: new Date().toISOString(),
    });
  });

  // --- detect + track ------------------------------------------------------
  await record(projectId, (job, now) => advanceJob(job, "player_detection", { now }));
  await record(projectId, (job, now) => advanceJob(job, "player_tracking", { now }));
  const tracked = await detectAndTrack(provider, {
    proxyStorageKey: prepared.proxyStorageKey,
    athlete: context.athlete,
    frameRate: prepared.probe.frameRate,
  });
  if (!tracked.ok) {
    return record(projectId, (job, now) =>
      failJob(
        job,
        { code: tracked.code, detail: tracked.detail, retryable: tracked.retryable },
        now,
      ),
    );
  }

  await updateWorkspace((workspace) => {
    workspace.tracks = workspace.tracks.filter((t) => t.projectId !== projectId);
    workspace.tracks.push({
      projectId,
      detectionSource: tracked.detectionSource,
      frameWidth: tracked.frameWidth,
      frameHeight: tracked.frameHeight,
      usedReferencePhoto: tracked.usedReferencePhoto,
      notes: tracked.notes,
      tracks: tracked.tracks,
    });
  });

  // --- identity + events ---------------------------------------------------
  await record(projectId, (job, now) => advanceJob(job, "event_detection", { now }));
  const found = identifyAndDetectEvents({
    projectId,
    athlete: context.athlete,
    tracks: tracked.tracks,
    detectionSource: tracked.detectionSource,
    frameHeight: tracked.frameHeight,
  });

  // --- clips ---------------------------------------------------------------
  await record(projectId, (job, now) => advanceJob(job, "clip_generation", { now }));
  const clips = planClips(found.events, prepared.probe.durationSeconds);

  await updateWorkspace((workspace) => {
    workspace.segments = workspace.segments.filter((s) => s.projectId !== projectId);
    workspace.events = workspace.events.filter((e) => e.projectId !== projectId);
    workspace.clips = workspace.clips.filter((c) => c.projectId !== projectId);
    workspace.segments.push(...found.segments);
    workspace.events.push(...found.events);
    workspace.clips.push(...clips);
    const stored = workspace.tracks.find((t) => t.projectId === projectId);
    if (stored !== undefined) {
      // Notes from identification join the ones from the vision service, so an
      // empty review screen always explains itself.
      Object.assign(stored, { notes: [...stored.notes, ...found.notes] });
    }
  });

  return record(projectId, (job, now) =>
    advanceJob(job, "review_ready", {
      now,
      note: `${found.segments.length} candidate segments, ${clips.length} clips.`,
    }),
  );
}

interface Context {
  readonly originalKey: string;
  readonly athlete: import("@hl-bos/hockey-highlights").Athlete;
}

async function readContext(projectId: string): Promise<Context | null> {
  return updateWorkspace((workspace) => {
    const project = projectById(workspace, projectId);
    const original = mediaFor(workspace, projectId, "original");
    if (project === undefined || original === undefined) return null;
    return { originalKey: original.storageKey, athlete: project.athlete };
  });
}

/** Apply a transition and persist it. */
async function record(
  projectId: string,
  mutate: (job: ProcessingJob, now: string) => ProcessingJob,
): Promise<ProcessingJob> {
  return updateWorkspace((workspace) => {
    const job = jobFor(workspace, projectId);
    if (job === undefined) throw new Error("That project has no processing job.");
    const now = new Date().toISOString();
    const next = mutate(job, now);
    workspace.jobs = workspace.jobs.map((j) => (j.id === next.id ? next : j));
    return next;
  });
}
