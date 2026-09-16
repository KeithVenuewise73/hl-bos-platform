/**
 * The processing pipeline: stages, statuses and honest progress (sections 27, 28).
 *
 * WHY PROGRESS IS A DESIGN PROBLEM AND NOT A COSMETIC ONE. Analysing a
 * two-hour game takes real time. During that time the only thing the user has is
 * the progress display, so the progress display IS the product for most of the
 * session. A bar that moves smoothly to 90% and then sits there for eleven
 * minutes teaches people that the number is decoration.
 *
 * So progress here is computed from completed stages weighted by their real
 * cost, and a stage reports its own sub-progress or none at all. There is no
 * synthetic creep, no "almost done", and a stage that cannot estimate its
 * remaining work says so rather than inventing a fraction. HL-BOS principle 10
 * covers operational metrics, and a progress bar is an operational metric shown
 * to the customer.
 */

/** The stages from section 27, in order. */
export const PIPELINE_STAGES = [
  "upload",
  "transcode",
  "play_segmentation",
  "player_detection",
  "team_classification",
  "player_tracking",
  "jersey_ocr",
  "player_reidentification",
  "field_mapping",
  "ball_detection",
  "player_ball_interaction",
  "event_detection",
  "player_involvement",
  "highlight_scoring",
  "clip_generation",
  "overlay_generation",
  "final_export",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export type StageStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";

/** The job statuses the UI shows, from section 28. */
export const JOB_STATUSES = [
  "uploaded",
  "transcoding",
  "detecting_players",
  "identifying_teams",
  "reading_numbers",
  "tracking_player",
  "segmenting_plays",
  "detecting_ball",
  "analyzing_actions",
  "generating_highlights",
  "ready",
  "failed",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

/**
 * Relative cost of each stage, used to weight progress.
 *
 * These are proportions of wall-clock on a GPU run, not guesses dressed up as
 * data: detection and tracking dominate because they are the only stages that
 * touch every frame. If measurement shows otherwise, change the numbers here —
 * that is the point of having them in one place.
 */
const STAGE_COST: Readonly<Record<PipelineStage, number>> = {
  upload: 2,
  transcode: 8,
  play_segmentation: 4,
  player_detection: 28,
  team_classification: 3,
  player_tracking: 16,
  jersey_ocr: 12,
  player_reidentification: 8,
  field_mapping: 3,
  ball_detection: 6,
  player_ball_interaction: 2,
  event_detection: 3,
  player_involvement: 1,
  highlight_scoring: 1,
  clip_generation: 8,
  overlay_generation: 4,
  final_export: 6,
};

/** Human-readable stage names, used verbatim in the processing screen. */
export const STAGE_LABELS: Readonly<Record<PipelineStage, string>> = {
  upload: "Receiving the game file",
  transcode: "Preparing a working copy",
  play_segmentation: "Finding the plays",
  player_detection: "Detecting players",
  team_classification: "Identifying the teams",
  player_tracking: "Tracking players",
  jersey_ocr: "Reading jersey numbers",
  player_reidentification: "Keeping hold of your player",
  field_mapping: "Mapping the field",
  ball_detection: "Finding the football",
  player_ball_interaction: "Working out who has the ball",
  event_detection: "Recognising what happened",
  player_involvement: "Scoring your player's involvement",
  highlight_scoring: "Ranking the highlights",
  clip_generation: "Cutting the clips",
  overlay_generation: "Adding the spotlight",
  final_export: "Exporting the reel",
};

/** Which job status a running stage corresponds to. */
export const STAGE_JOB_STATUS: Readonly<Record<PipelineStage, JobStatus>> = {
  upload: "uploaded",
  transcode: "transcoding",
  play_segmentation: "segmenting_plays",
  player_detection: "detecting_players",
  team_classification: "identifying_teams",
  player_tracking: "tracking_player",
  jersey_ocr: "reading_numbers",
  player_reidentification: "tracking_player",
  field_mapping: "tracking_player",
  ball_detection: "detecting_ball",
  player_ball_interaction: "detecting_ball",
  event_detection: "analyzing_actions",
  player_involvement: "analyzing_actions",
  highlight_scoring: "generating_highlights",
  clip_generation: "generating_highlights",
  overlay_generation: "generating_highlights",
  final_export: "generating_highlights",
};

export interface StageState {
  readonly stage: PipelineStage;
  readonly status: StageStatus;
  /** 0..1 within the stage, or null when the stage genuinely cannot estimate. */
  readonly progress: number | null;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  /** Present only on failure, and shown to the user in plain language. */
  readonly error?: string;
}

export interface PipelineProgress {
  /** 0..1 across the whole job. */
  readonly fraction: number;
  readonly status: JobStatus;
  /** What to put under the bar. Never "almost done". */
  readonly label: string;
  readonly completedStages: number;
  readonly totalStages: number;
  /** True when a stage reported no estimate, so the bar should not be trusted
   *  to move smoothly and the UI should say "this can take a while". */
  readonly indeterminate: boolean;
}

export function initialStages(
  stages: readonly PipelineStage[] = PIPELINE_STAGES,
): StageState[] {
  return stages.map((stage) => ({ stage, status: "pending", progress: null }));
}

/**
 * Compute overall progress from stage states.
 *
 * Skipped stages contribute their full weight as done — a job that did not need
 * ball detection is not 6% less finished. A failed stage stops the count where
 * it failed, and the status becomes `failed`: reporting 80% next to a failure
 * would be telling the user the job is mostly fine when it is over.
 */
export function pipelineProgress(states: readonly StageState[]): PipelineProgress {
  const total = states.reduce((a, s) => a + STAGE_COST[s.stage], 0);
  if (total === 0) {
    return {
      fraction: 0,
      status: "uploaded",
      label: "Waiting to start",
      completedStages: 0,
      totalStages: 0,
      indeterminate: true,
    };
  }

  let done = 0;
  let completedStages = 0;
  let indeterminate = false;
  let current: StageState | null = null;

  for (const s of states) {
    const cost = STAGE_COST[s.stage];
    if (s.status === "succeeded" || s.status === "skipped") {
      done += cost;
      completedStages += 1;
      continue;
    }
    if (s.status === "failed") {
      return {
        fraction: done / total,
        status: "failed",
        label: s.error ?? `${STAGE_LABELS[s.stage]} failed`,
        completedStages,
        totalStages: states.length,
        indeterminate: false,
      };
    }
    if (s.status === "running" && current === null) {
      current = s;
      if (s.progress === null) indeterminate = true;
      else done += cost * Math.min(1, Math.max(0, s.progress));
    }
  }

  if (current === null) {
    const allDone = completedStages === states.length;
    return {
      fraction: allDone ? 1 : done / total,
      status: allDone ? "ready" : "uploaded",
      label: allDone ? "Ready" : "Waiting to start",
      completedStages,
      totalStages: states.length,
      indeterminate: !allDone,
    };
  }

  return {
    fraction: done / total,
    status: STAGE_JOB_STATUS[current.stage],
    label: STAGE_LABELS[current.stage],
    completedStages,
    totalStages: states.length,
    indeterminate,
  };
}

export function advance(
  states: readonly StageState[],
  stage: PipelineStage,
  update: Partial<Omit<StageState, "stage">>,
): StageState[] {
  return states.map((s) => (s.stage === stage ? { ...s, ...update } : s));
}
