/**
 * The vocabulary of HighlightAI Hockey.
 *
 * One rule shapes every type in this file: **a confidence is evidence, not a
 * decoration.** Nothing here carries a bare "confidence: number" whose origin
 * is unknowable by the time it reaches a screen. Where the product asserts that
 * a track is the athlete, it must also say what made it think so — colour,
 * number, position prior, reference photo — and how strongly each contributed.
 *
 * That is not fastidiousness. The evidence audit for this product
 * (docs/architecture/70-highlightai-broadcastai-evidence-audit.md) requires
 * that a HighlightAI surface be labelled as having no engine behind it until
 * real processing code is verified. The counterpart obligation, once there IS
 * an engine, is that the engine never overstates what it saw.
 */

// ---------------------------------------------------------------------------
// Project and athlete
// ---------------------------------------------------------------------------

/** Where an athlete plays. Changes which events are plausible, not which are allowed. */
export type Position = "forward" | "defense" | "goalie";

export const POSITIONS: readonly Position[] = ["forward", "defense", "goalie"];

/**
 * A jersey colour, as a name the user picks plus the hue range it stands for.
 *
 * Users say "navy", cameras record pixels. Keeping both halves together means
 * the review screen can show the word the user chose while the matcher works in
 * the space the footage is actually in.
 */
export interface JerseyColor {
  /** The key the user picked, e.g. "navy". */
  readonly id: string;
  /** What the review screen shows. */
  readonly label: string;
  /** Approximate sRGB swatch, for the UI only. Never used for matching. */
  readonly swatch: string;
}

export interface Athlete {
  readonly id: string;
  readonly name: string;
  /** Jersey number as worn. A string because "07" and "7" are different jerseys. */
  readonly jerseyNumber: string;
  readonly jerseyColorId: string;
  readonly position: Position;
  /**
   * Storage key of an optional reference photo. Optional in the product and
   * optional here: the pipeline must produce a usable result without one.
   */
  readonly referencePhotoKey?: string;
}

export interface HighlightProject {
  readonly id: string;
  readonly ownerId: string;
  /** What the user calls this game. */
  readonly name: string;
  /** ISO date (YYYY-MM-DD) the game was played. */
  readonly gameDate: string;
  readonly team: string;
  readonly opponent: string;
  readonly athlete: Athlete;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

export type MediaRole =
  /** Exactly as uploaded. Never analysed, never re-encoded — it renders the reel. */
  | "original"
  /** Downscaled copy the vision service reads. Cheap to analyse, never exported. */
  | "proxy"
  | "clip"
  | "reel";

/**
 * A file this project owns.
 *
 * `durationSeconds`, `width`, `height` and `sizeBytes` are `null` until
 * something has actually probed the file. Null means "not measured yet" and the
 * UI says exactly that, rather than showing a plausible zero.
 */
export interface MediaAsset {
  readonly id: string;
  readonly projectId: string;
  readonly role: MediaRole;
  readonly storageKey: string;
  readonly filename: string;
  readonly contentType: string;
  readonly sizeBytes: number | null;
  readonly durationSeconds: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly frameRate: number | null;
  readonly createdAt: string;
}

/** What the uploader accepts. Anything else is refused with a reason. */
export const ACCEPTED_UPLOAD_TYPES: readonly string[] = [
  "video/mp4",
  "video/quicktime",
];

export const ACCEPTED_UPLOAD_EXTENSIONS: readonly string[] = [".mp4", ".mov"];

// ---------------------------------------------------------------------------
// Tracking
// ---------------------------------------------------------------------------

/** A box in pixels, top-left origin, in the coordinate space of the frame. */
export interface BoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** One detection of one player in one frame. */
export interface Observation {
  readonly frame: number;
  readonly timeSeconds: number;
  readonly box: BoundingBox;
  /** The detector's own score for "this is a player", 0..1. */
  readonly detectionScore: number;
  /** Jersey colour the crop matched, and how well. Null when unreadable. */
  readonly jerseyColorId: string | null;
  readonly jerseyColorScore: number;
  /** Number read from the crop, and how confident the reader was. */
  readonly jerseyNumber: string | null;
  readonly jerseyNumberScore: number;
}

/**
 * A single player followed across consecutive frames.
 *
 * The tracker owns identity continuity; this type is what it hands back. A
 * track is deliberately anonymous — it is "someone", not "the athlete". Turning
 * a track into a claim about a named player is a separate, explicit step in
 * identity.ts, so the place where that judgement is made is a single file with
 * its own tests.
 */
export interface PlayerTrack {
  readonly id: string;
  readonly observations: readonly Observation[];
}

/**
 * Which signals were available and what each one said.
 *
 * Agreement and clarity are separate figures on purpose, because they answer
 * different questions and the product got this wrong once already. Agreement is
 * "did the reads point the same way"; clarity is "how legible were they". Ten
 * frames of barely-readable digits that happen to agree have agreement 1.0 and
 * clarity 0.2, and collapsing those into one number let a near-illegible track
 * score exactly like a crisp one.
 */
export interface IdentityEvidence {
  /** Fraction of colour reads that pointed at the athlete's colour, 0..1. */
  readonly colorAgreement: number;
  /** Mean legibility of those colour reads, 0..1. */
  readonly colorClarity: number;
  /** Fraction of number reads that supported the athlete's number, 0..1. */
  readonly numberAgreement: number;
  /** Mean legibility of those number reads, 0..1. */
  readonly numberClarity: number;
  /** How many observations produced any readable number at all. */
  readonly numberReadCount: number;
  readonly observationCount: number;
  /** Reference-photo similarity, or null when no photo was supplied. */
  readonly photoSimilarity: number | null;
}

/**
 * How sure we are, in words a person can act on.
 *
 * Deliberately coarse. A review screen that prints "0.62" invites the reader to
 * treat it as precision it does not have; "likely" invites them to check.
 */
export type ConfidenceBand = "confirmed" | "likely" | "possible" | "uncertain";

/**
 * A stretch of video in which one track is believed to be the athlete.
 *
 * `confidence` is the fused number, `band` is how it should be spoken about,
 * and `evidence` is why. All three travel together, always.
 */
export interface PlayerSegment {
  readonly id: string;
  readonly projectId: string;
  readonly trackId: string;
  readonly startTime: number;
  readonly endTime: number;
  /** Fused identity confidence, 0..1. */
  readonly confidence: number;
  readonly band: ConfidenceBand;
  /** Which service and model produced the underlying detections. */
  readonly detectionSource: string;
  readonly evidence: IdentityEvidence;
}

// ---------------------------------------------------------------------------
// Events and clips
// ---------------------------------------------------------------------------

/**
 * What kind of moment this looks like.
 *
 * These are named for what the motion evidence supports, not for what a
 * commentator would say. The engine can see that a player accelerated hard
 * toward the attacking zone; it cannot see that they scored. Calling the first
 * thing a "goal" would be inventing a result, which principle 10 forbids.
 */
export type EventKind =
  /** Sustained high speed — a rush, a backcheck, a breakaway. */
  | "burst"
  /** A sharp change of direction at speed. */
  | "cut"
  /** The athlete is in frame and near the centre of play for a sustained spell. */
  | "sustained_presence"
  /** Goalie-specific: rapid lateral movement inside the crease. */
  | "crease_action"
  /** The user marked this themselves. Always outranks anything detected. */
  | "manual";

export interface CandidateEvent {
  readonly id: string;
  readonly projectId: string;
  readonly segmentId: string;
  readonly kind: EventKind;
  readonly startTime: number;
  readonly endTime: number;
  /** Peak instant, used to centre the clip window. */
  readonly peakTime: number;
  /** How strongly the motion evidence supports this kind, 0..1. */
  readonly strength: number;
  /** Identity confidence inherited from the segment — kept, never averaged away. */
  readonly identityConfidence: number;
  /** One sentence naming the evidence, for the review screen. */
  readonly rationale: string;
}

export type ReviewDecision = "pending" | "accepted" | "rejected";

/**
 * A cut of the original video, proposed by the engine and ruled on by a person.
 *
 * `decision` starts `pending` and nothing reaches a reel until a human moves
 * it. That is the MVP's central bet: a reliable AI-assisted workflow beats a
 * confident autonomous one.
 */
export interface Clip {
  readonly id: string;
  readonly projectId: string;
  readonly eventId: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly decision: ReviewDecision;
  /** Set when a person trims the clip. Null means the proposed window stands. */
  readonly trimmedStart: number | null;
  readonly trimmedEnd: number | null;
  /** Free text the reviewer added. */
  readonly note: string | null;
  /** Rendered file, once one exists. Null until then. */
  readonly mediaAssetId: string | null;
  readonly order: number;
}

// ---------------------------------------------------------------------------
// Reel
// ---------------------------------------------------------------------------

export interface ReelEntry {
  readonly clipId: string;
  readonly startTime: number;
  readonly endTime: number;
  /** Where this clip begins within the finished reel. */
  readonly reelOffset: number;
  readonly durationSeconds: number;
}

export interface HighlightReel {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly subtitle: string;
  readonly entries: readonly ReelEntry[];
  readonly totalDurationSeconds: number;
  /** Rendered file, once one exists. Null until then. */
  readonly mediaAssetId: string | null;
  readonly createdAt: string;
}
