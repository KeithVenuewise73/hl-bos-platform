/**
 * The HighlightAI Football object model.
 *
 * These types are the contract between three things that must be able to
 * change independently:
 *
 *   1. the computer-vision worker, which produces detections and signals,
 *   2. this engine, which decides what any of it means,
 *   3. the database and the UI, which store and show the result.
 *
 * They are also the objects HighlightAI shares with Football FilmStudy AI
 * (brief section 37): Game, Play, Player, PlayerTrack, FootballEvent,
 * VideoTimestamp. HighlightAI answers "where is the player and which plays
 * involve him". FilmStudy answers "what happened and how did he do". Both read
 * the same PlayerTrack rather than running the vision pipeline twice, so these
 * six names are deliberately generic and free of highlight-specific fields.
 *
 * Confidence convention, applied everywhere: 0..1, and it is always the
 * model's own belief, never a number invented to fill a column. A value that
 * is not known is `null`, not 0 and not a guess.
 */

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/**
 * A point in a video, carried as BOTH frame and seconds.
 *
 * Frames are what the vision worker counts and what a player lock is anchored
 * to; seconds are what FFmpeg cuts on and what a human reads. Deriving one
 * from the other at each boundary is how off-by-one-frame drift gets into a
 * clip, so both travel together and `frameRate` says how they relate.
 */
export interface VideoTimestamp {
  readonly frame: number;
  readonly seconds: number;
}

export function timestamp(frame: number, frameRate: number): VideoTimestamp {
  return { frame, seconds: frame / frameRate };
}

export function frameAt(seconds: number, frameRate: number): number {
  return Math.round(seconds * frameRate);
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/**
 * A box in NORMALISED screen space (0..1 of frame width/height).
 *
 * Normalised rather than pixels so that a proxy transcode, a vertical crop and
 * the original 4K file all speak the same coordinates. A pixel box from a
 * 1280-wide proxy silently means something different on a 3840-wide master.
 */
export interface BoundingBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Centre of a box, in the same normalised space. */
export function boxCenter(b: BoundingBox): Point {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

/** Intersection-over-union. 0 when the boxes do not overlap. */
export function iou(a: BoundingBox, b: BoundingBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const iw = x2 - x1;
  const ih = y2 - y1;
  if (iw <= 0 || ih <= 0) return 0;
  const inter = iw * ih;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * A position on the football field itself, independent of where the camera is
 * pointing (brief section 9).
 *
 * `fieldX` runs 0 (own goal line) to 1 (opponent goal line); `fieldY` runs 0
 * (near sideline) to 1 (far sideline). `yardLine` is the football convention
 * (0..50..0) and is null until enough landmarks are visible to establish it.
 */
export interface FieldPoint {
  readonly fieldX: number;
  readonly fieldY: number;
  readonly yardLine: number | null;
  readonly horizontalZone:
    "left_sideline" | "left_hash" | "middle" | "right_hash" | "right_sideline" | null;
  /** How much to trust this mapping. Low when few field landmarks were found. */
  readonly confidence: number;
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/**
 * The football colour vocabulary. Deliberately a closed set: a human enters
 * "Blue", not "#1B3A6B", and every comparison in the engine has to survive
 * night games, mud and a washed-out press-box camera. A free-text colour would
 * make that untestable.
 */
export const JERSEY_COLORS = [
  "white",
  "black",
  "navy",
  "blue",
  "royal_blue",
  "columbia_blue",
  "teal",
  "green",
  "forest_green",
  "kelly_green",
  "yellow",
  "gold",
  "orange",
  "red",
  "maroon",
  "crimson",
  "purple",
  "pink",
  "silver",
  "gray",
  "brown",
] as const;

export type JerseyColorName = (typeof JERSEY_COLORS)[number];

export interface UniformDescriptor {
  readonly jersey: JerseyColorName;
  readonly numberColor: JerseyColorName;
  readonly helmet: JerseyColorName | null;
  readonly pants: JerseyColorName | null;
}

// ---------------------------------------------------------------------------
// Football domain
// ---------------------------------------------------------------------------

export type Level =
  "youth" | "middle_school" | "high_school" | "college" | "professional";

export type CameraType =
  | "hudl"
  | "veo"
  | "sideline"
  | "end_zone"
  | "press_box"
  | "smartphone"
  | "broadcast"
  | "drone"
  | "unknown";

export type Position =
  | "QB"
  | "RB"
  | "FB"
  | "WR"
  | "TE"
  | "OL"
  | "DL"
  | "LB"
  | "CB"
  | "S"
  | "K"
  | "P"
  | "LS"
  | "RET";

export const OFFENSIVE_POSITIONS: readonly Position[] = [
  "QB",
  "RB",
  "FB",
  "WR",
  "TE",
  "OL",
];
export const DEFENSIVE_POSITIONS: readonly Position[] = ["DL", "LB", "CB", "S"];
export const SPECIAL_TEAMS_POSITIONS: readonly Position[] = ["K", "P", "LS", "RET"];

export type Side = "offense" | "defense" | "special_teams";

export function sideOf(position: Position): Side {
  if (OFFENSIVE_POSITIONS.includes(position)) return "offense";
  if (DEFENSIVE_POSITIONS.includes(position)) return "defense";
  return "special_teams";
}

export interface Team {
  readonly id: string;
  readonly name: string;
  readonly uniform: UniformDescriptor;
}

export interface Player {
  readonly id: string;
  readonly name: string;
  /** 0..99. Football allows 00, which is NOT 0 — see jerseyNumberLabel(). */
  readonly number: number;
  /** True only for the player who wears literal "00" rather than "0". */
  readonly doubleZero?: boolean;
  readonly teamId: string;
  readonly positions: readonly Position[];
  readonly graduationYear: number | null;
}

/** "00" and "0" are different jerseys and may be worn in the same game. */
export function jerseyNumberLabel(p: Pick<Player, "number" | "doubleZero">): string {
  if (p.number === 0 && p.doubleZero === true) return "00";
  return String(p.number);
}

export interface Game {
  readonly id: string;
  readonly name: string;
  readonly teamId: string;
  readonly opponentName: string;
  readonly playedOn: string;
  readonly level: Level;
  readonly cameraType: CameraType;
  readonly frameRate: number;
  readonly durationSeconds: number;
}

// ---------------------------------------------------------------------------
// Vision output
// ---------------------------------------------------------------------------

/** One player box in one frame, exactly as the detector produced it. */
export interface PlayerDetection {
  readonly detectionId: string;
  readonly at: VideoTimestamp;
  readonly box: BoundingBox;
  /** Detector's belief that this box is a person at all. */
  readonly confidence: number;
  readonly teamId: string | null;
  readonly teamConfidence: number | null;
  readonly jerseyColor: Rgb | null;
  readonly helmetColor: Rgb | null;
  readonly pantsColor: Rgb | null;
  /** null when the number was not readable in this frame. Not 0. */
  readonly jerseyNumber: number | null;
  readonly numberConfidence: number | null;
  /** Unit-length re-identification embedding, when the model produced one. */
  readonly embedding: readonly number[] | null;
  readonly field: FieldPoint | null;
}

/** A run of detections the tracker believes are one person. */
export interface PlayerTrack {
  readonly trackId: string;
  readonly detections: readonly PlayerDetection[];
  readonly startedAt: VideoTimestamp;
  readonly endedAt: VideoTimestamp;
  readonly teamId: string | null;
  readonly teamConfidence: number | null;
  /** Tracker's own continuity belief. Drops after an occlusion or a re-link. */
  readonly trackingConfidence: number;
}

export interface BallDetection {
  readonly at: VideoTimestamp;
  readonly box: BoundingBox;
  readonly confidence: number;
}

export interface BallTrack {
  readonly detections: readonly BallDetection[];
  /**
   * Who the engine believes had the ball, keyed by frame. Sparse: absent means
   * unknown, which is a real and common answer for a small brown object in a
   * pile of bodies.
   */
  readonly carrierByFrame: ReadonlyMap<number, { trackId: string; confidence: number }>;
}

// ---------------------------------------------------------------------------
// Plays and events
// ---------------------------------------------------------------------------

export interface Play {
  readonly playId: string;
  readonly index: number;
  readonly startAt: VideoTimestamp;
  /** null when no snap could be located inside the play window. */
  readonly snapAt: VideoTimestamp | null;
  readonly snapConfidence: number | null;
  readonly endAt: VideoTimestamp;
  readonly offenseTeamId: string | null;
  readonly defenseTeamId: string | null;
  readonly quarter: number | null;
  readonly down: number | null;
  readonly distance: number | null;
  readonly segmentationConfidence: number;
}

export const FOOTBALL_EVENTS = [
  "snap",
  "handoff",
  "pass",
  "catch",
  "run",
  "tackle",
  "sack",
  "interception",
  "fumble",
  "recovery",
  "kick",
  "punt",
  "return",
  "touchdown",
  "block",
  "pass_breakup",
  "pressure",
  "run_stop",
  "forced_fumble",
  "pancake",
] as const;

export type FootballEventKind = (typeof FOOTBALL_EVENTS)[number];

export interface FootballEvent {
  readonly eventId: string;
  readonly playId: string;
  readonly kind: FootballEventKind;
  readonly at: VideoTimestamp;
  /** The track the event is attributed to, when one could be attributed. */
  readonly trackId: string | null;
  readonly confidence: number;
}

// ---------------------------------------------------------------------------
// The selected athlete
// ---------------------------------------------------------------------------

/**
 * What the user told us to look for. This is the question the whole pipeline
 * is answering, so it is a first-class object rather than loose parameters.
 */
export interface PlayerTarget {
  readonly playerId: string;
  readonly name: string;
  readonly number: number;
  readonly doubleZero?: boolean;
  readonly teamId: string;
  readonly uniform: UniformDescriptor;
  readonly positions: readonly Position[];
}

/**
 * A human's confirmation that a given track IS the athlete, over a frame range
 * (brief section 26). This is the strongest signal in the system and outranks
 * every model output inside its range.
 */
export interface PlayerLock {
  readonly playerId: string;
  readonly trackId: string;
  readonly fromFrame: number;
  readonly toFrame: number;
  readonly source: "user_confirmation" | "user_correction";
}

/** A human saying "that is not him" — as binding as a lock, in reverse. */
export interface PlayerExclusion {
  readonly playerId: string;
  readonly trackId: string;
  readonly fromFrame: number;
  readonly toFrame: number;
}

export type InvolvementScore = 0 | 1 | 2 | 3 | 4 | 5;

export const INVOLVEMENT_LABELS: Readonly<Record<InvolvementScore, string>> = {
  0: "Not involved",
  1: "On the field",
  2: "Secondary involvement",
  3: "Meaningful involvement",
  4: "Significant play",
  5: "Major highlight",
};

/** What the engine concluded about the athlete on one play. */
export interface PlayerPlayInvolvement {
  readonly playId: string;
  readonly playerPresent: boolean;
  readonly trackId: string | null;
  readonly preSnapPosition: FieldPoint | Point | null;
  readonly postSnapTrajectory: readonly Point[];
  /** Share of the play's frames in which the athlete was actually visible. */
  readonly visibilityPercentage: number;
  readonly involvement: InvolvementScore;
  /**
   * The continuous value `involvement` was rounded from, 0..5.
   *
   * Kept because the rounded score is what a human reads ("significant play")
   * while the reel builder needs to ORDER two plays that both rounded to 4.
   * Throwing the decimal away and then re-deriving an ordering from the integer
   * would invent a ranking the evidence does not support.
   */
  readonly rawScore: number;
  readonly identityConfidence: number;
  /** Plain-English reasons, shown to the user. Never fabricated. */
  readonly reasons: readonly string[];
  readonly events: readonly FootballEventKind[];
  readonly reviewRequired: boolean;
}

// ---------------------------------------------------------------------------
// Highlights
// ---------------------------------------------------------------------------

export type ClipSelectionMode =
  "all_plays" | "involved_plays" | "best_plays" | "elite_highlights";

export interface ClipWindow {
  readonly startSeconds: number;
  readonly endSeconds: number;
}

export interface HighlightCandidate {
  readonly candidateId: string;
  readonly playId: string;
  readonly window: ClipWindow;
  readonly involvement: InvolvementScore;
  /** 0..5, one decimal in the UI. Derived, explainable, never invented. */
  readonly score: number;
  readonly events: readonly FootballEventKind[];
  readonly reasons: readonly string[];
  readonly reviewRequired: boolean;
}

export type SpotlightStyle =
  "circle" | "arrow" | "spotlight" | "glow" | "freeze_frame" | "zoom" | "none";

export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:5";

export interface ReelProfileCard {
  readonly name: string;
  readonly number: string;
  readonly team: string;
  readonly positions: string;
  readonly season: string;
}
