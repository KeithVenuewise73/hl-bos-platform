/**
 * Model adapter interfaces (brief section 33) and the registry that resolves
 * them (section 44).
 *
 * WHY THESE EXIST. Object detection and tracking move fast. YOLO, RT-DETR,
 * ByteTrack, BoT-SORT and whatever replaces them next year all solve the same
 * shaped problem, and a codebase that imports one of them directly has to be
 * rewritten to try another. Every model sits behind one of these interfaces, so
 * swapping a detector is a configuration change and an adapter, never a
 * refactor of the football logic.
 *
 * THE DEMO ADAPTERS ARE NOT A FAKE PRODUCT. Section 44 is explicit that demo
 * mode "cannot merely fake the architecture", and HL-BOS principle 10 forbids
 * inventing AI results. The mock adapters in ./mock therefore generate a
 * SYNTHETIC GAME — real geometry, real occlusions, real camera pan, real
 * unreadable stretches — and then run the genuine engine over it. Nothing
 * downstream is stubbed: the voting, the re-identification, the segmentation,
 * the scoring and the clip planning are the same code paths production runs.
 * What the mock replaces is the camera, not the reasoning.
 *
 * Every adapter declares `kind: "real" | "demo"`, and that flag is carried all
 * the way to the UI and into the database. A clip produced by a demo adapter is
 * labelled as such wherever it is shown. A demo result that cannot be told apart
 * from a real one is the exact failure mode these rules exist to prevent.
 */

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
} from "./types";
import type { FrameSignal } from "./segmentation";
import type { PlayerSignature, ReIdMatch } from "./reid";
import type { JerseyObservation } from "./jersey";

/** A decoded frame, as handed to a detector. Bytes stay outside this package. */
export interface Frame {
  readonly at: VideoTimestamp;
  readonly width: number;
  readonly height: number;
  /** Opaque handle to the pixels, owned by the worker runtime. */
  readonly pixels: unknown;
}

export interface AdapterInfo {
  readonly name: string;
  readonly version: string;
  /**
   * "demo" output is synthetic and MUST be labelled as such everywhere it is
   * shown or stored. This is not a debug flag.
   */
  readonly kind: "real" | "demo";
  /** Free-text note surfaced in the admin debug view. */
  readonly notes?: string;
}

export interface Adapter {
  readonly info: AdapterInfo;
}

// ---------------------------------------------------------------------------
// The nine interfaces from section 33
// ---------------------------------------------------------------------------

export interface PlayerDetector extends Adapter {
  detect(frame: Frame): Promise<PlayerDetection[]>;
}

export interface TeamClassifier extends Adapter {
  /** Learn the two teams' dominant colours from sampled frames. */
  fit(
    samples: readonly Rgb[],
  ): Promise<Array<{ teamId: string; jersey: Rgb; confidence: number }>>;
  classify(
    detection: PlayerDetection,
  ): Promise<{ teamId: string | null; confidence: number }>;
}

export interface JerseyNumberRecognizer extends Adapter {
  /** Returns `number: null` when unreadable. Never a guess. */
  read(frame: Frame, detection: PlayerDetection): Promise<JerseyObservation>;
}

export interface PlayerTracker extends Adapter {
  /** Feed detections frame by frame; returns the tracks closed so far. */
  update(
    at: VideoTimestamp,
    detections: readonly PlayerDetection[],
  ): Promise<PlayerTrack[]>;
  flush(): Promise<PlayerTrack[]>;
}

export interface PlayerReIdentifier extends Adapter {
  embed(frame: Frame, detection: PlayerDetection): Promise<number[] | null>;
  match(
    known: PlayerSignature,
    candidates: readonly PlayerSignature[],
  ): Promise<ReIdMatch | null>;
}

export interface BallDetectorAdapter extends Adapter {
  detect(frame: Frame): Promise<BallDetection[]>;
  /** Estimate possession. Returning an empty map is a valid, honest answer. */
  estimateCarriers(
    detections: readonly BallDetection[],
    tracks: readonly PlayerTrack[],
  ): Promise<BallTrack>;
}

export interface PlaySegmenter extends Adapter {
  segment(signals: readonly FrameSignal[], frameRate: number): Promise<Play[]>;
}

export interface FootballEventClassifier extends Adapter {
  classify(
    play: Play,
    tracks: readonly PlayerTrack[],
    ball: BallTrack | null,
  ): Promise<FootballEvent[]>;
}

export interface HighlightRanker extends Adapter {
  rank(candidates: readonly HighlightCandidate[]): Promise<HighlightCandidate[]>;
}

/** The complete set a pipeline run needs. */
export interface AdapterSet {
  readonly playerDetector: PlayerDetector;
  readonly teamClassifier: TeamClassifier;
  readonly jerseyRecognizer: JerseyNumberRecognizer;
  readonly tracker: PlayerTracker;
  readonly reIdentifier: PlayerReIdentifier;
  readonly ballDetector: BallDetectorAdapter;
  readonly segmenter: PlaySegmenter;
  readonly eventClassifier: FootballEventClassifier;
  readonly ranker: HighlightRanker;
}

/**
 * True when every adapter in the set is a real model.
 *
 * The UI calls this to decide whether a result may be presented without a
 * "demo data" banner. It is intentionally all-or-nothing: a run with a real
 * detector and a demo event classifier produced partly synthetic football, and
 * the honest label for that is "demo".
 */
export function isFullyReal(set: AdapterSet): boolean {
  return allAdapters(set).every((a) => a.info.kind === "real");
}

/** Names of the adapters that produced synthetic output, for labelling. */
export function demoAdapterNames(set: AdapterSet): string[] {
  return allAdapters(set)
    .filter((a) => a.info.kind === "demo")
    .map((a) => a.info.name);
}

function allAdapters(set: AdapterSet): Adapter[] {
  return [
    set.playerDetector,
    set.teamClassifier,
    set.jerseyRecognizer,
    set.tracker,
    set.reIdentifier,
    set.ballDetector,
    set.segmenter,
    set.eventClassifier,
    set.ranker,
  ];
}

/**
 * Thrown by a real adapter whose model is not installed.
 *
 * It exists so that a missing model is a LOUD failure rather than a silent
 * fallback to demo output. Falling back would produce a reel of invented plays
 * that looks exactly like a real one — the worst outcome available to this
 * system, and the reason the fallback is not offered as an option.
 */
export class ModelUnavailableError extends Error {
  public readonly adapter: string;

  constructor(adapter: string, detail: string) {
    super(
      `${adapter} is not available: ${detail}. ` +
        "HighlightAI will not substitute demo output for a real model — " +
        "switch the job to demo mode explicitly if that is what you want.",
    );
    this.name = "ModelUnavailableError";
    this.adapter = adapter;
  }
}
