/**
 * The vertical slice, in one function.
 *
 *   upload → identify the athlete → track him → find his plays → cut clips →
 *   build the reel
 *
 * That chain is the definition of HighlightAI Football V1, and this module is
 * where the stages are wired together. Keeping the orchestration in one
 * readable function rather than spread across a job runner means the product's
 * actual behaviour can be tested end to end without a queue, a database or a
 * GPU — which is exactly what the tests next to this file do.
 *
 * NOTE ON EVENT ATTRIBUTION: events are matched to plays by TIMESTAMP, not by
 * the playId they arrived with. The event classifier and the segmenter run
 * independently and may disagree about how many plays there were; trusting a
 * foreign playId would silently attach a tackle to the wrong play whenever
 * segmentation produced one more or one fewer than expected.
 */

import type {
  BallTrack,
  ClipSelectionMode,
  FootballEvent,
  Game,
  HighlightCandidate,
  Play,
  PlayerExclusion,
  PlayerLock,
  PlayerPlayInvolvement,
  PlayerTarget,
  PlayerTrack,
} from "./types";
import type { FrameSignal, SegmentationOptions } from "./segmentation";
import { segmentPlays } from "./segmentation";
import type { IdentityDecision, IdentityOptions } from "./tracking";
import { resolveIdentity, trackForPlay } from "./tracking";
import { scoreInvolvement } from "./involvement";
import type { ClipPaddingOptions } from "./highlight";
import { buildCandidates, dedupeOverlapping, selectCandidates } from "./highlight";

export interface AnalysisInput {
  readonly game: Game;
  readonly target: PlayerTarget;
  readonly signals: readonly FrameSignal[];
  readonly tracks: readonly PlayerTrack[];
  readonly ball: BallTrack | null;
  readonly events: readonly FootballEvent[];
  readonly locks?: readonly PlayerLock[];
  readonly exclusions?: readonly PlayerExclusion[];
  readonly selectionMode?: ClipSelectionMode;
  readonly segmentation?: Partial<Omit<SegmentationOptions, "frameRate">>;
  readonly clip?: Partial<Omit<ClipPaddingOptions, "videoDurationSeconds">>;
  readonly identity?: IdentityOptions;
}

export interface AnalysisSummary {
  readonly playsAnalyzed: number;
  readonly playerAppearances: number;
  readonly candidateHighlights: number;
  readonly selectedHighlights: number;
  readonly playsNeedingReview: number;
  /** Plays where the athlete was on the field but nothing was detected. */
  readonly presenceOnlyPlays: number;
}

export interface AnalysisResult {
  readonly plays: readonly Play[];
  readonly decisions: readonly IdentityDecision[];
  readonly involvements: readonly PlayerPlayInvolvement[];
  readonly candidates: readonly HighlightCandidate[];
  readonly selected: readonly HighlightCandidate[];
  readonly summary: AnalysisSummary;
  /** Segmentation thresholds actually used, for the admin debug view. */
  readonly thresholds: {
    readonly enter: number;
    readonly exit: number;
    readonly baseline: number;
  };
}

export function analyzeGame(input: AnalysisInput): AnalysisResult {
  const fps = input.game.frameRate;

  // 1. Where are the plays?
  const segmentation = segmentPlays(input.signals, {
    frameRate: fps,
    ...input.segmentation,
  });
  const plays = segmentation.plays;

  // 2. Which tracks are the athlete? Human locks and exclusions outrank
  //    everything the models concluded.
  const decisions = resolveIdentity(
    input.target,
    input.tracks,
    input.locks ?? [],
    input.exclusions ?? [],
    input.identity ?? {},
  );

  // 3. For each play: was he there, and what did he do?
  const involvements: PlayerPlayInvolvement[] = plays.map((play) => {
    const { track, confidence } = trackForPlay(play, input.tracks, decisions);
    return scoreInvolvement({
      play,
      target: input.target,
      track,
      identityConfidence: confidence,
      ball: input.ball,
      events: eventsWithin(input.events, play),
      frameRate: fps,
    });
  });

  // 4. Clips, ranked, with overlapping footage removed.
  const candidates = buildCandidates(plays, involvements, {
    videoDurationSeconds: input.game.durationSeconds,
    ...input.clip,
  });
  const mode: ClipSelectionMode = input.selectionMode ?? "involved_plays";
  const selected = dedupeOverlapping(selectCandidates(candidates, mode));

  return {
    plays,
    decisions,
    involvements,
    candidates,
    selected,
    thresholds: segmentation.thresholds,
    summary: {
      playsAnalyzed: plays.length,
      playerAppearances: involvements.filter((i) => i.playerPresent).length,
      candidateHighlights: candidates.length,
      selectedHighlights: selected.length,
      playsNeedingReview: involvements.filter((i) => i.reviewRequired).length,
      presenceOnlyPlays: involvements.filter(
        (i) => i.playerPresent && i.involvement <= 1,
      ).length,
    },
  };
}

/** Events whose timestamp falls inside the play window. */
export function eventsWithin(
  events: readonly FootballEvent[],
  play: Play,
): FootballEvent[] {
  return events.filter(
    (e) => e.at.frame >= play.startAt.frame && e.at.frame <= play.endAt.frame,
  );
}
