/**
 * Demo adapters (brief section 44).
 *
 * These implement the same interfaces as the real models and return the same
 * types, so the frontend, the API, the database schema and the whole football
 * engine can be developed and tested while the computer-vision models are still
 * being improved.
 *
 * WHAT MAKES THEM HONEST:
 *
 *   * Every one declares `kind: "demo"`, and the app refuses to present demo
 *     output without saying so.
 *   * They read from a generated game with real geometry, not from a list of
 *     canned results. The jersey recogniser genuinely fails on the frames where
 *     the number is not visible; the tracker genuinely emits split tracks
 *     across an occlusion.
 *   * Nothing downstream of them is stubbed. Voting, re-identification,
 *     segmentation, involvement and clip planning are the production code paths.
 *
 * The demo can therefore produce a wrong answer, and when it does, that is a
 * real finding about the engine rather than a bug in the mock.
 */

import type {
  AdapterInfo,
  AdapterSet,
  BallDetectorAdapter,
  FootballEventClassifier,
  Frame,
  HighlightRanker,
  JerseyNumberRecognizer,
  PlayerDetector,
  PlayerReIdentifier,
  PlaySegmenter,
  PlayerTracker,
  TeamClassifier,
} from "../adapters";
import type {
  BallDetection,
  BallTrack,
  FootballEvent,
  HighlightCandidate,
  Play,
  PlayerDetection,
  PlayerTrack,
  Rgb,
  VideoTimestamp,
} from "../types";
import type { FrameSignal } from "../segmentation";
import { segmentPlays } from "../segmentation";
import type { JerseyObservation } from "../jersey";
import type { PlayerSignature, ReIdMatch } from "../reid";
import { bestMatch } from "../reid";
import { assignTeam, dominantColors } from "../color";
import { rankCandidates } from "../highlight";
import type { SyntheticGame } from "./synthetic";

const info = (name: string, notes: string): AdapterInfo => ({
  name,
  version: "0.1.0",
  kind: "demo",
  notes,
});

/**
 * Build a full adapter set over one synthetic game.
 *
 * The adapters are thin: they slice the generated game by timestamp and hand
 * the result to the real engine. The intelligence deliberately lives in the
 * engine, not here, so that demo mode exercises the code that ships.
 */
export function demoAdapterSet(game: SyntheticGame): AdapterSet {
  const detectionsByFrame = new Map<number, PlayerDetection[]>();
  for (const track of game.tracks) {
    for (const det of track.detections) {
      const list = detectionsByFrame.get(det.at.frame) ?? [];
      list.push(det);
      detectionsByFrame.set(det.at.frame, list);
    }
  }
  const ballByFrame = new Map<number, BallDetection[]>();
  for (const bd of game.ball.detections) {
    const list = ballByFrame.get(bd.at.frame) ?? [];
    list.push(bd);
    ballByFrame.set(bd.at.frame, list);
  }

  const playerDetector: PlayerDetector = {
    info: info(
      "demo-player-detector",
      "Replays the synthetic game's geometry frame by frame.",
    ),
    detect: (frame: Frame) =>
      Promise.resolve(detectionsByFrame.get(frame.at.frame) ?? []),
  };

  let fittedTeams: Array<{ teamId: string; jersey: Rgb; confidence: number }> = [];
  const teamClassifier: TeamClassifier = {
    info: info(
      "demo-team-classifier",
      "Runs the REAL k-means colour clustering over sampled jersey colours.",
    ),
    fit: (samples: readonly Rgb[]) => {
      // Genuine clustering, not a lookup: this is the production code path, and
      // it can and does get night games wrong if the colour model is weakened.
      const clusters = dominantColors(samples, 2, 7);
      fittedTeams = clusters.map((c, i) => ({
        teamId: i === 0 ? "team-a" : "team-b",
        jersey: c.center,
        confidence: c.weight,
      }));
      return Promise.resolve(fittedTeams);
    },
    classify: (detection: PlayerDetection) => {
      if (detection.jerseyColor === null)
        return Promise.resolve({ teamId: null, confidence: 0 });
      const palette =
        fittedTeams.length > 0
          ? fittedTeams.map((t) => ({ id: t.teamId, jersey: t.jersey }))
          : [];
      if (palette.length === 0) return Promise.resolve({ teamId: null, confidence: 0 });
      const result = assignTeam(detection.jerseyColor, palette);
      return Promise.resolve({ teamId: result.teamId, confidence: result.confidence });
    },
  };

  const jerseyRecognizer: JerseyNumberRecognizer = {
    info: info(
      "demo-jersey-ocr",
      "Returns the generated reading, including the unreadable frames.",
    ),
    read: (_frame: Frame, detection: PlayerDetection): Promise<JerseyObservation> =>
      Promise.resolve({
        at: detection.at,
        number: detection.jerseyNumber,
        confidence: detection.numberConfidence ?? 0,
        surface: "back",
      }),
  };

  const tracker: PlayerTracker = {
    info: info("demo-tracker", "Emits the pre-split tracks, occlusion gaps included."),
    update: (_at: VideoTimestamp, _detections: readonly PlayerDetection[]) =>
      Promise.resolve([]),
    flush: () => Promise.resolve([...game.tracks]),
  };

  const reIdentifier: PlayerReIdentifier = {
    info: info(
      "demo-reid",
      "Uses the generated embeddings and the REAL similarity scoring.",
    ),
    embed: (_frame: Frame, detection: PlayerDetection) =>
      Promise.resolve(detection.embedding === null ? null : [...detection.embedding]),
    match: (
      known: PlayerSignature,
      candidates: readonly PlayerSignature[],
    ): Promise<ReIdMatch | null> => Promise.resolve(bestMatch(known, candidates)),
  };

  const ballDetector: BallDetectorAdapter = {
    info: info(
      "demo-ball-detector",
      "Replays generated ball positions at realistic low confidence.",
    ),
    detect: (frame: Frame) => Promise.resolve(ballByFrame.get(frame.at.frame) ?? []),
    estimateCarriers: (
      _detections: readonly BallDetection[],
      _tracks: readonly PlayerTrack[],
    ): Promise<BallTrack> => Promise.resolve(game.ball),
  };

  const segmenter: PlaySegmenter = {
    info: info(
      "demo-segmenter",
      "Runs the REAL motion segmenter over the generated signal.",
    ),
    segment: (signals: readonly FrameSignal[], frameRate: number): Promise<Play[]> =>
      Promise.resolve([...segmentPlays(signals, { frameRate }).plays]),
  };

  const eventClassifier: FootballEventClassifier = {
    info: info(
      "demo-event-classifier",
      "Returns the generated events for the play window.",
    ),
    classify: (play: Play): Promise<FootballEvent[]> =>
      Promise.resolve(
        game.events.filter(
          (e) => e.at.frame >= play.startAt.frame && e.at.frame <= play.endAt.frame,
        ),
      ),
  };

  const ranker: HighlightRanker = {
    info: info("demo-ranker", "Runs the REAL ranking function."),
    rank: (candidates: readonly HighlightCandidate[]) =>
      Promise.resolve(rankCandidates(candidates)),
  };

  return {
    playerDetector,
    teamClassifier,
    jerseyRecognizer,
    tracker,
    reIdentifier,
    ballDetector,
    segmenter,
    eventClassifier,
    ranker,
  };
}
