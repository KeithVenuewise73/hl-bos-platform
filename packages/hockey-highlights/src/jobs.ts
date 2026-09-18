/**
 * The processing job state machine.
 *
 * The product requirement is one sentence — "users must be able to leave the
 * page and return without losing job state" — and it has one real consequence:
 * **progress lives in the store, not in the browser.** So a job is a record
 * that is advanced by explicit transitions, each of which is legal or is
 * refused. There is no `setStatus`, because a function that can put a job into
 * any state is a function that will eventually put a job into the wrong one.
 *
 * The second requirement — "record processing errors and retry information" —
 * is why `failure` is part of the record rather than a log line. When a user
 * comes back to a failed job an hour later, the log is gone; the record is what
 * tells them which stage broke and whether trying again is worth it.
 */

/**
 * Every state a job can be in.
 *
 * Ordered as the pipeline runs them, which is what lets progress be computed
 * rather than stored — a stored percentage is a second source of truth and
 * drifts from the first one.
 */
export type JobStatus =
  | "uploaded"
  | "preprocessing"
  | "player_detection"
  | "player_tracking"
  | "event_detection"
  | "clip_generation"
  | "review_ready"
  | "rendering"
  | "completed"
  | "failed";

/** The happy path, in order. `failed` is reachable from any of these. */
export const PIPELINE_ORDER: readonly JobStatus[] = [
  "uploaded",
  "preprocessing",
  "player_detection",
  "player_tracking",
  "event_detection",
  "clip_generation",
  "review_ready",
  "rendering",
  "completed",
];

/**
 * What each stage is, in the user's language.
 *
 * These strings are the ones the status panel shows. They live next to the
 * state machine so a new stage cannot be added without someone writing the
 * sentence that explains it.
 */
const STAGE_COPY: Readonly<Record<JobStatus, { label: string; detail: string }>> = {
  uploaded: {
    label: "Uploaded",
    detail: "Your game video is stored. Processing has not started yet.",
  },
  preprocessing: {
    label: "Preparing the video",
    detail:
      "Reading the file and making a smaller copy for analysis. Your original is untouched — the reel is cut from it at the end.",
  },
  player_detection: {
    label: "Finding players",
    detail: "Looking through the video for every player on the ice.",
  },
  player_tracking: {
    label: "Following players",
    detail:
      "Joining those sightings into paths, so one player skating up the ice is one path and not a thousand separate sightings.",
  },
  event_detection: {
    label: "Finding your player's moments",
    detail:
      "Matching the paths against the jersey you described, then picking out the stretches where that player is doing something worth watching.",
  },
  clip_generation: {
    label: "Cutting clips",
    detail: "Turning each moment into a clip you can watch and judge.",
  },
  review_ready: {
    label: "Ready for your review",
    detail:
      "The clips are waiting for you. Nothing goes into the reel until you approve it.",
  },
  rendering: {
    label: "Building the reel",
    detail: "Stitching your approved clips together from the original video.",
  },
  completed: {
    label: "Finished",
    detail: "Your highlight reel is ready to watch, download and share.",
  },
  failed: {
    label: "Stopped",
    detail: "Something went wrong. The details are below, along with what to try.",
  },
};

export function describeStatus(status: JobStatus): { label: string; detail: string } {
  return STAGE_COPY[status];
}

/**
 * A job stage failed, and what is known about it.
 *
 * `retryable` is the engine's judgement, and it is deliberately conservative:
 * a stage that failed because the video could not be decoded will fail the same
 * way next time, and offering a Try Again button for it is a control that does
 * not control anything.
 */
export interface JobFailure {
  /** Which stage was running when it broke. */
  readonly stage: JobStatus;
  /** Stable code, for translation into plain English. */
  readonly code: string;
  /** Technical detail, kept for the engineer. */
  readonly detail: string;
  readonly retryable: boolean;
  readonly failedAt: string;
}

export interface ProcessingJob {
  readonly id: string;
  readonly projectId: string;
  readonly status: JobStatus;
  /** Bumped every time the job is retried. Zero on the first attempt. */
  readonly attempt: number;
  readonly failure: JobFailure | null;
  /** Set once the job leaves `uploaded`. Null before that. */
  readonly startedAt: string | null;
  /** Set on reaching `completed` or `failed`. */
  readonly finishedAt: string | null;
  readonly updatedAt: string;
  /**
   * Every transition this job has made, oldest first. This is what makes a job
   * auditable after the fact rather than merely current.
   */
  readonly history: readonly JobHistoryEntry[];
}

export interface JobHistoryEntry {
  readonly status: JobStatus;
  readonly at: string;
  readonly note: string | null;
}

/**
 * Which moves are legal.
 *
 * Every stage may go to `failed`, and `review_ready` may go back to `rendering`
 * as many times as the reviewer likes — approving three more clips and
 * rebuilding is a normal thing to do, not an error. `completed` can also return
 * to `review_ready`: a finished reel is not a reason to stop editing.
 */
const TRANSITIONS: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  uploaded: ["preprocessing", "failed"],
  preprocessing: ["player_detection", "failed"],
  player_detection: ["player_tracking", "failed"],
  player_tracking: ["event_detection", "failed"],
  event_detection: ["clip_generation", "failed"],
  clip_generation: ["review_ready", "failed"],
  review_ready: ["rendering", "failed"],
  rendering: ["completed", "review_ready", "failed"],
  completed: ["review_ready", "rendering"],
  // A failed job never silently resumes. It is retried, which is a distinct
  // operation that records an attempt — see `retryJob`.
  failed: [],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminal(status: JobStatus): boolean {
  return status === "completed" || status === "failed";
}

/** Where this job is on the happy path, as a fraction. `failed` reports zero. */
export function progressFraction(status: JobStatus): number {
  const index = PIPELINE_ORDER.indexOf(status);
  if (index < 0) return 0;
  return index / (PIPELINE_ORDER.length - 1);
}

export function newJob(input: {
  readonly id: string;
  readonly projectId: string;
  readonly now: string;
}): ProcessingJob {
  return {
    id: input.id,
    projectId: input.projectId,
    status: "uploaded",
    attempt: 0,
    failure: null,
    startedAt: null,
    finishedAt: null,
    updatedAt: input.now,
    history: [{ status: "uploaded", at: input.now, note: null }],
  };
}

export class IllegalTransitionError extends Error {
  constructor(
    readonly from: JobStatus,
    readonly to: JobStatus,
  ) {
    super(`A job cannot move from ${from} to ${to}.`);
    this.name = "IllegalTransitionError";
  }
}

/**
 * Advance a job, or refuse.
 *
 * Throwing rather than returning a falsy value is deliberate: an illegal
 * transition is a bug in the caller, and a bug that silently no-ops leaves a
 * job stuck in a state the UI will happily poll forever.
 */
export function advanceJob(
  job: ProcessingJob,
  to: JobStatus,
  options: { readonly now: string; readonly note?: string } = { now: "" },
): ProcessingJob {
  if (!canTransition(job.status, to)) throw new IllegalTransitionError(job.status, to);
  const now = options.now;
  return {
    ...job,
    status: to,
    // Clearing the failure on a forward move is right: the job is running
    // again, and showing a stale error next to a live progress bar is how a
    // user concludes the whole screen is lying.
    failure: null,
    startedAt: job.startedAt ?? now,
    finishedAt: isTerminal(to) ? now : null,
    updatedAt: now,
    history: [
      ...job.history,
      { status: to, at: now, note: options.note ?? null },
    ],
  };
}

/** Record a failure against whichever stage was running. */
export function failJob(
  job: ProcessingJob,
  failure: Omit<JobFailure, "stage" | "failedAt">,
  now: string,
): ProcessingJob {
  const recorded: JobFailure = { ...failure, stage: job.status, failedAt: now };
  return {
    ...job,
    status: "failed",
    failure: recorded,
    finishedAt: now,
    updatedAt: now,
    history: [
      ...job.history,
      { status: "failed", at: now, note: `${failure.code}: ${failure.detail}` },
    ],
  };
}

export class NotRetryableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "NotRetryableError";
  }
}

/**
 * Try a failed job again, from the start of the stage that broke.
 *
 * Retrying resumes at the failed stage rather than at the beginning:
 * re-uploading and re-encoding an hour of video because jersey OCR timed out
 * would be an expensive way to be tidy. The attempt counter goes up so a job
 * that fails the same way four times is visibly doing so.
 */
export function retryJob(job: ProcessingJob, now: string): ProcessingJob {
  if (job.status !== "failed" || job.failure === null) {
    throw new NotRetryableError("Only a failed job can be retried.");
  }
  if (!job.failure.retryable) {
    throw new NotRetryableError(
      "This failure will happen again if it is retried, so retrying is not offered.",
    );
  }
  const resumeAt = job.failure.stage;
  return {
    ...job,
    status: resumeAt,
    attempt: job.attempt + 1,
    failure: null,
    finishedAt: null,
    updatedAt: now,
    history: [
      ...job.history,
      { status: resumeAt, at: now, note: `Retry #${job.attempt + 1}` },
    ],
  };
}
