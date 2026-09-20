// Storyboard generation (section 36) and partial recovery (section 56).
//
// Panels are generated INDIVIDUALLY. The image model is never asked for a
// six-panel collage: a collage cannot be regenerated panel by panel, cannot be
// branched from, cannot be downloaded as a single scene, and carries no
// per-scene metadata. The collage is assembled afterwards from real scenes.
//
// If scene 4 fails, scenes 1-3 survive. That is the whole point of the design.

import {
  generateScene,
  type PipelineDeps,
  type SceneOutcome,
  type SceneRequest,
} from "./pipeline";
import { nextSceneState } from "./continuity";
import { buildContinuityContext } from "./continuity";
import { settle, type Settlement } from "./credits";
import type { SceneState, StoryPlan } from "./types";

export type PanelStage =
  | "waiting"
  | "analyzing"
  | "locking-characters"
  | "planning"
  | "creating"
  | "checking-quality"
  | "finishing"
  | "done"
  | "failed"
  | "refused";

export interface PanelProgress {
  readonly sceneNumber: number;
  readonly title: string;
  readonly stage: PanelStage;
}

/**
 * Progress is reported as named STAGES, never a percentage.
 *
 * Section 50: "Do not display fake percentages." A progress bar moving at a
 * rate nobody measured is an invented operational metric, and this platform
 * does not ship those — including the comforting ones.
 */
export type ProgressReporter = (panels: readonly PanelProgress[]) => void;

export interface StoryboardResult {
  readonly panels: readonly PanelOutcome[];
  readonly delivered: number;
  readonly requested: number;
  readonly settlement: Settlement;
  /** Scene numbers that can be retried without regenerating the story. */
  readonly retryable: readonly number[];
}

export interface PanelOutcome {
  readonly sceneNumber: number;
  readonly title: string;
  readonly outcome: SceneOutcome;
}

export interface StoryboardRequest {
  /** A template for every panel; per-scene fields are overridden per beat. */
  readonly base: Omit<SceneRequest, "sceneDescription" | "narrativePosition" | "jobId">;
  readonly plan: StoryPlan;
  readonly jobIdFor: (sceneNumber: number) => string;
}

/**
 * Generate every panel in order, carrying continuity forward.
 *
 * Sequential on purpose. Panel 4 inherits panel 3's resolved scene state, so
 * running them in parallel would mean every panel continuing from the SOURCE
 * image instead of from the scene before it — six variations of one moment
 * rather than a story.
 */
export async function generateStoryboard(
  request: StoryboardRequest,
  deps: PipelineDeps,
  onProgress?: ProgressReporter,
): Promise<StoryboardResult> {
  const progress: PanelProgress[] = request.plan.scenes.map((beat) => ({
    sceneNumber: beat.number,
    title: beat.title,
    stage: "waiting",
  }));

  const report = (index: number, stage: PanelStage): void => {
    const current = progress[index];
    /* c8 ignore next -- index always comes from the plan's own iteration */
    if (!current) return;
    progress[index] = { ...current, stage };
    onProgress?.([...progress]);
  };

  const panels: PanelOutcome[] = [];
  let parentScene: SceneState = request.base.parentScene;
  let parentSceneId: string | null = request.base.parentSceneId;
  let previousDescription = request.base.previousSceneDescription;
  let delivered = 0;

  for (const [index, beat] of request.plan.scenes.entries()) {
    report(index, "creating");

    const sceneRequest: SceneRequest = {
      ...request.base,
      jobId: request.jobIdFor(beat.number),
      parentScene,
      parentSceneId,
      previousSceneDescription: previousDescription,
      narrativePosition: beat.number,
      sceneDescription: beat.title,
    };

    const outcome = await generateScene(sceneRequest, deps);
    panels.push({ sceneNumber: beat.number, title: beat.title, outcome });

    if (outcome.outcome === "generated") {
      delivered += 1;
      report(index, "done");

      // Carry this panel's resolved state forward so the next one continues
      // from it rather than from the original photograph.
      const context = buildContinuityContext({
        storyId: sceneRequest.storyId,
        cast: sceneRequest.cast,
        parentScene,
        parentSceneId,
        previousSceneDescription: previousDescription,
        narrativePosition: beat.number,
        lock: sceneRequest.lock,
        changes: sceneRequest.changes,
        interactions: sceneRequest.interactions,
      });
      parentScene = nextSceneState(context, parentScene);
      parentSceneId = outcome.result.providerJobId;
      previousDescription = beat.title;
      continue;
    }

    report(index, outcome.outcome === "refused" ? "refused" : "failed");

    // A refusal is a decision about the request itself — every remaining panel
    // would be refused for the same reason, so the run stops rather than
    // repeating the same rejection five more times.
    if (outcome.outcome === "refused") break;
    // A failure is per-panel. Keep going: sections 1-3 staying available when 4
    // fails is the recovery behaviour the brief asks for.
  }

  const requested = request.plan.scenes.length;
  const retryable = panels
    .filter((p) => p.outcome.outcome === "failed")
    .map((p) => p.sceneNumber);

  const settlement =
    delivered === requested
      ? settle({
          type: request.base.type,
          outcome: "complete",
          jobId: request.jobIdFor(0),
        })
      : settle({
          type: request.base.type,
          outcome: delivered === 0 ? "provider-failure" : "partial",
          jobId: request.jobIdFor(0),
          scenesDelivered: delivered,
          scenesRequested: requested,
        });

  return { panels, delivered, requested, settlement, retryable };
}

export interface CollageLayout {
  readonly rows: number;
  readonly columns: number;
}

/** Collage layouts (section 37). Assembled from real panels, never prompted for. */
export function collageLayout(sceneCount: number): CollageLayout {
  if (sceneCount <= 1) return { rows: 1, columns: 1 };
  if (sceneCount <= 3) return { rows: 1, columns: sceneCount };
  if (sceneCount <= 4) return { rows: 2, columns: 2 };
  return { rows: 2, columns: 3 };
}

/**
 * Panel captions for a labelled collage. Only scenes that actually produced an
 * image are included — a collage cell captioned "5. KISS" over a blank square
 * would be claiming an image that does not exist.
 */
export function collageLabels(result: StoryboardResult): readonly string[] {
  return result.panels
    .filter((p) => p.outcome.outcome === "generated")
    .map((p) => `${p.sceneNumber}. ${p.title.toUpperCase()}`);
}
