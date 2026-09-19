/**
 * The app's single source of analysed truth.
 *
 * Every screen reads from here. There is one analysis, computed once per
 * process by the real engine, and all the screens are views onto it — so the
 * Detected Plays list, the Game Analysis panel, the Highlight Editor and the
 * admin debug view can never disagree about what the AI concluded.
 *
 * The alternative — each screen deriving its own numbers — is how a dashboard
 * ends up showing 24 highlights on one page and 19 on the next, and how nobody
 * can tell which is true.
 */

import {
  analyzeGame,
  assembleReel,
  boxCenter,
  highlightScore,
  jerseyOcrAccuracy,
  planCropPath,
  planSpotlight,
  precisionRecall,
  scoreFrameAssignments,
  segmentationAccuracy,
  summarizeSeason,
} from "@hl-bos/highlight-football";
import type {
  AnalysisResult,
  BoundingBox,
  ClipSelectionMode,
  CropInput,
  HighlightCandidate,
  PlayerTrack,
  Reel,
  SpotlightPlan,
  VideoTimestamp,
} from "@hl-bos/highlight-football";
import { demoAdapterSet, demoGame } from "@hl-bos/highlight-football/mock";
import type { SyntheticGame } from "@hl-bos/highlight-football/mock";

export interface AnalysedGame {
  readonly source: SyntheticGame;
  readonly result: AnalysisResult;
  readonly isDemo: boolean;
  readonly adapterNames: readonly string[];
}

let cached: AnalysedGame | null = null;

/**
 * Analyse the demo game.
 *
 * Memoised per process. The engine is pure and deterministic, so caching
 * cannot mask a change: the same input always produces the same output, and a
 * code change produces a new process.
 */
export function demoAnalysis(): AnalysedGame {
  if (cached !== null) return cached;
  const source = demoGame();
  const adapters = demoAdapterSet(source);
  const result = analyzeGame({
    game: source.game,
    target: source.target,
    signals: source.signals,
    tracks: source.tracks,
    ball: source.ball,
    events: source.events,
  });
  cached = {
    source,
    result,
    isDemo: true,
    adapterNames: [
      adapters.playerDetector.info.name,
      adapters.teamClassifier.info.name,
      adapters.jerseyRecognizer.info.name,
      adapters.tracker.info.name,
      adapters.reIdentifier.info.name,
      adapters.ballDetector.info.name,
      adapters.segmenter.info.name,
      adapters.eventClassifier.info.name,
      adapters.ranker.info.name,
    ],
  };
  return cached;
}

// ---------------------------------------------------------------------------
// Derived views the screens need
// ---------------------------------------------------------------------------

export interface PlayRow {
  readonly playId: string;
  readonly index: number;
  readonly startSeconds: number;
  readonly snapSeconds: number | null;
  readonly endSeconds: number;
  readonly playerPresent: boolean;
  readonly involvement: number;
  readonly score: number | null;
  readonly events: readonly string[];
  readonly identityConfidence: number;
  readonly visibility: number;
  readonly reasons: readonly string[];
  readonly reviewRequired: boolean;
  readonly segmentationConfidence: number;
  readonly snapConfidence: number | null;
}

export function playRows(analysis: AnalysedGame): PlayRow[] {
  const involvementById = new Map(
    analysis.result.involvements.map((i) => [i.playId, i] as const),
  );
  const candidateById = new Map(
    analysis.result.candidates.map((c) => [c.playId, c] as const),
  );

  return analysis.result.plays.map((play) => {
    const inv = involvementById.get(play.playId);
    const candidate = candidateById.get(play.playId);
    return {
      playId: play.playId,
      index: play.index,
      startSeconds: play.startAt.seconds,
      snapSeconds: play.snapAt?.seconds ?? null,
      endSeconds: play.endAt.seconds,
      playerPresent: inv?.playerPresent ?? false,
      involvement: inv?.involvement ?? 0,
      score: candidate?.score ?? null,
      events: inv?.events ?? [],
      identityConfidence: inv?.identityConfidence ?? 0,
      visibility: inv?.visibilityPercentage ?? 0,
      reasons: inv?.reasons ?? [],
      reviewRequired: inv?.reviewRequired ?? false,
      segmentationConfidence: play.segmentationConfidence,
      snapConfidence: play.snapConfidence,
    };
  });
}

/** The athlete's track for a play, for drawing the overlay. */
export function athleteTrackForPlay(
  analysis: AnalysedGame,
  playId: string,
): PlayerTrack | null {
  const trackId = analysis.result.involvements.find(
    (i) => i.playId === playId,
  )?.trackId;
  if (trackId == null) return null;
  return analysis.source.tracks.find((t) => t.trackId === trackId) ?? null;
}

export interface OverlayFrame {
  readonly at: VideoTimestamp;
  readonly player: BoundingBox;
  readonly ball: BoundingBox | null;
}

/** Player + ball boxes over a play, at a sampled rate the browser can draw. */
export function overlayFrames(
  analysis: AnalysedGame,
  playId: string,
  maxFrames = 90,
): OverlayFrame[] {
  const play = analysis.result.plays.find((p) => p.playId === playId);
  const track = athleteTrackForPlay(analysis, playId);
  if (play === undefined || track === null) return [];

  const ballByFrame = new Map(
    analysis.source.ball.detections.map((b) => [b.at.frame, b.box] as const),
  );
  const inPlay = track.detections.filter(
    (d) => d.at.frame >= play.startAt.frame && d.at.frame <= play.endAt.frame,
  );
  const step = Math.max(1, Math.ceil(inPlay.length / maxFrames));
  const out: OverlayFrame[] = [];
  for (let i = 0; i < inPlay.length; i += step) {
    const d = inPlay[i];
    if (d === undefined) continue;
    out.push({ at: d.at, player: d.box, ball: ballByFrame.get(d.at.frame) ?? null });
  }
  return out;
}

export function spotlightFor(
  analysis: AnalysedGame,
  playId: string,
): SpotlightPlan | null {
  const candidate = analysis.result.candidates.find((c) => c.playId === playId);
  const play = analysis.result.plays.find((p) => p.playId === playId);
  const frames = overlayFrames(analysis, playId, 400);
  if (candidate === undefined || play === undefined || frames.length === 0) return null;
  return planSpotlight(
    candidate.window,
    play.snapAt?.seconds ?? play.startAt.seconds,
    frames.map((f) => ({
      frame: f.at.frame,
      seconds: f.at.seconds,
      player: f.player,
      ball: f.ball,
    })),
    {
      name: analysis.source.target.name,
      number: String(analysis.source.target.number),
      team: "West Seneca",
    },
  );
}

export function cropPathFor(
  analysis: AnalysedGame,
  playId: string,
): ReturnType<typeof planCropPath> {
  const frames = overlayFrames(analysis, playId, 400);
  const inputs: CropInput[] = frames.map((f) => ({
    frame: f.at.frame,
    player: f.player,
    ball: f.ball,
  }));
  return planCropPath(inputs, { target: "9:16", sourceAspect: 16 / 9 });
}

/** Title for a clip, in football words rather than event enum values. */
export function clipTitle(candidate: HighlightCandidate): string {
  const first = candidate.events[0];
  if (first === undefined) return "Play";
  const words: Record<string, string> = {
    pass_breakup: "Pass breakup",
    run_stop: "Run stop",
    forced_fumble: "Forced fumble",
    pancake: "Pancake block",
  };
  return words[first] ?? first.charAt(0).toUpperCase() + first.slice(1);
}

export function buildReel(
  analysis: AnalysedGame,
  selection: readonly HighlightCandidate[],
): Reel {
  return assembleReel(
    selection.map((c) => ({
      candidateId: c.candidateId,
      gameId: analysis.source.game.id,
      playId: c.playId,
      window: c.window,
      score: c.score,
      title: clipTitle(c),
    })),
    {
      mode: "game",
      profile: {
        name: analysis.source.target.name,
        number: String(analysis.source.target.number),
        team: "West Seneca",
        positions: analysis.source.target.positions.join(" / "),
        season: "2026",
      },
    },
  );
}

export function selectionFor(
  analysis: AnalysedGame,
  mode: ClipSelectionMode,
): HighlightCandidate[] {
  const thresholds: Record<ClipSelectionMode, number> = {
    all_plays: 0,
    involved_plays: 2,
    best_plays: 3,
    elite_highlights: 4,
  };
  return analysis.result.candidates.filter((c) => c.involvement >= thresholds[mode]);
}

// ---------------------------------------------------------------------------
// Metrics — measured against the fixture's labels, or reported as unmeasured
// ---------------------------------------------------------------------------

export interface QualityMetrics {
  readonly selectedPlayerPrecision: number | null;
  readonly selectedPlayerRecall: number | null;
  readonly identitySwitches: number | null;
  readonly jerseyOcrAccuracy: number | null;
  readonly jerseyReadableShare: number | null;
  readonly playsFound: number;
  readonly playsMissed: number;
  readonly playsInvented: number;
  readonly meanSnapErrorSeconds: number | null;
  /** null until a human has accepted or rejected clips. */
  readonly highlightAcceptanceRate: number | null;
  readonly manualCorrectionRate: number | null;
  readonly meaningfulPlayRecall: number | null;
}

/**
 * Compute the quality metrics from section 46.
 *
 * Only possible here because the demo game is LABELLED. On real customer
 * footage there is no ground truth, and these fields must stay null until a
 * human supplies one through a correction. That is why every one of them is
 * nullable and the UI is built to render "not measured".
 */
export function qualityMetrics(analysis: AnalysedGame): QualityMetrics {
  const truth = analysis.source.truth;
  const claimed = new Set(
    analysis.result.decisions.filter((d) => d.isAthlete).map((d) => d.trackId),
  );
  const truthTracks = new Set(truth.athleteTrackIds);

  const identity = precisionRecall({
    truePositives: [...claimed].filter((t) => truthTracks.has(t)).length,
    falsePositives: [...claimed].filter((t) => !truthTracks.has(t)).length,
    falseNegatives: [...truthTracks].filter((t) => !claimed.has(t)).length,
  });

  const assigned = new Map<number, string | null>();
  for (const inv of analysis.result.involvements) {
    const play = analysis.result.plays.find((p) => p.playId === inv.playId);
    if (play === undefined) continue;
    for (let f = play.startAt.frame; f <= play.endAt.frame; f++) {
      assigned.set(f, inv.trackId);
    }
  }
  const frameScore = scoreFrameAssignments(assigned, truth.athleteByFrame);

  const seg = segmentationAccuracy(
    analysis.result.plays.map((p) => ({
      startSeconds: p.startAt.seconds,
      endSeconds: p.endAt.seconds,
      snapSeconds: p.snapAt?.seconds ?? null,
    })),
    truth.plays,
  );

  const ocr = jerseyOcrAccuracy(truth.jerseyReadings);

  return {
    selectedPlayerPrecision: identity.precision,
    selectedPlayerRecall: identity.recall,
    // Frame-level agreement stands in for switch counting here: the demo's
    // truth is per-frame, and a switch is a disagreement that persists.
    identitySwitches: frameScore.counts.falsePositives,
    jerseyOcrAccuracy: ocr.accuracy,
    jerseyReadableShare: ocr.attempted === 0 ? null : ocr.readable / ocr.attempted,
    playsFound: seg.matched,
    playsMissed: seg.missed,
    playsInvented: seg.spurious,
    meanSnapErrorSeconds: seg.meanSnapErrorSeconds,
    // Nobody has reviewed anything in a freshly-loaded demo, so these are
    // genuinely unmeasured and say so rather than reporting 0%.
    highlightAcceptanceRate: null,
    manualCorrectionRate: null,
    meaningfulPlayRecall: null,
  };
}

export function seasonSummary(analysis: AnalysedGame) {
  return summarizeSeason(
    [
      {
        playsAnalyzed: analysis.result.summary.playsAnalyzed,
        playerAppearances: analysis.result.summary.playerAppearances,
        candidates: analysis.result.summary.candidateHighlights,
      },
    ],
    analysis.result.selected.length,
  );
}

export { boxCenter, highlightScore };
