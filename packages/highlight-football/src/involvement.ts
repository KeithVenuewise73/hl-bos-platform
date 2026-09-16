/**
 * The player involvement engine (brief sections 12, 13 and 14).
 *
 * THE PROBLEM THIS SOLVES. A highlight reel built by looking for touchdowns is
 * useless to most of the roster. A left tackle never touches the ball; a
 * cornerback's best play of the season is a pass he made sure never arrived.
 * Scoring every play on "did the ball go in the end zone" would tell a lineman's
 * family that he did nothing all year, which is both false and the exact reason
 * these families are not served by existing tools.
 *
 * So involvement is scored against WHAT THE POSITION IS FOR. The same detected
 * event carries a different meaning depending on who made it: a block by a
 * receiver is a good, secondary contribution; the same block by an offensive
 * lineman is the job, done well, and it is the highlight.
 *
 * WHAT THIS ENGINE WILL NOT DO. It will not manufacture involvement from
 * nothing. If the vision worker attributed no event to the athlete and he was
 * nowhere near the ball, the play scores 1 — "on the field" — and says so.
 * Inflating that to 3 so the reel looks fuller would be inventing an AI result,
 * which HL-BOS principle 10 forbids and which a coach would spot in one viewing.
 */

import type {
  BallTrack,
  FootballEvent,
  FootballEventKind,
  InvolvementScore,
  PlayerPlayInvolvement,
  PlayerTarget,
  PlayerTrack,
  Play,
  Point,
  Position,
  Side,
} from "./types";
import { boxCenter, sideOf } from "./types";

/**
 * The events that define each position's contribution, taken directly from the
 * brief's position lists. Used both for scoring and to tell the user WHY a play
 * was picked, in the vocabulary of their own position.
 */
export const POSITION_EVENTS: Readonly<Record<Position, readonly FootballEventKind[]>> =
  {
    QB: ["pass", "catch", "run", "touchdown", "handoff", "sack"],
    RB: ["run", "catch", "block", "touchdown", "fumble"],
    FB: ["block", "run", "catch", "touchdown", "pancake"],
    WR: ["catch", "block", "run", "touchdown"],
    TE: ["catch", "block", "run", "touchdown", "pancake"],
    OL: ["block", "pancake"],
    DL: ["sack", "pressure", "tackle", "run_stop", "forced_fumble"],
    LB: [
      "tackle",
      "sack",
      "pressure",
      "run_stop",
      "pass_breakup",
      "interception",
      "forced_fumble",
    ],
    CB: ["tackle", "pass_breakup", "interception", "forced_fumble", "pressure"],
    S: [
      "tackle",
      "pass_breakup",
      "interception",
      "forced_fumble",
      "pressure",
      "run_stop",
    ],
    K: ["kick", "touchdown"],
    P: ["punt"],
    LS: ["snap", "block"],
    RET: ["return", "catch", "touchdown", "run"],
  };

/**
 * Base impact of an event, before position is considered. 0..5 on the same
 * scale as the final involvement score, so the table is readable next to
 * INVOLVEMENT_LABELS.
 */
const EVENT_BASE_IMPACT: Readonly<Record<FootballEventKind, number>> = {
  touchdown: 5,
  interception: 5,
  forced_fumble: 4.5,
  sack: 4.5,
  recovery: 4,
  pass_breakup: 4,
  return: 4,
  catch: 3.5,
  run: 3,
  tackle: 3,
  run_stop: 3.5,
  pressure: 3,
  fumble: 2.5,
  pancake: 3.5,
  block: 2,
  kick: 3,
  punt: 3,
  pass: 3,
  handoff: 2,
  snap: 1,
};

/**
 * Multiplier applied when the event IS the position's job.
 *
 * Deliberately modest (1.35): the point is to let a lineman's pancake outrank a
 * receiver's incidental block, not to let every routine rep become a highlight.
 */
const ON_POSITION_BONUS = 1.35;
/** Applied when the event is well outside the position's normal work — a
 *  lineman with an interception is rarer, and more of a highlight, not less. */
const OFF_POSITION_BONUS = 1.15;

export interface InvolvementInput {
  readonly play: Play;
  readonly target: PlayerTarget;
  /** The track the identity resolver concluded is the athlete, or null. */
  readonly track: PlayerTrack | null;
  /** 0..1 belief that `track` really is the athlete. */
  readonly identityConfidence: number;
  readonly ball: BallTrack | null;
  /** Events already scoped to this play. */
  readonly events: readonly FootballEvent[];
  readonly frameRate: number;
  /** Below this identity confidence the play is flagged REVIEW REQUIRED. */
  readonly reviewThreshold?: number;
}

/**
 * How close, in normalised screen widths, counts as "in the action".
 * 0.12 of frame width is roughly a few yards on typical sideline framing —
 * close enough to be part of the play, not merely on the same field.
 */
const NEAR_BALL = 0.12;

export function scoreInvolvement(input: InvolvementInput): PlayerPlayInvolvement {
  const { play, track, events, frameRate } = input;
  const reviewThreshold = input.reviewThreshold ?? 0.6;
  const playFrames = Math.max(1, play.endAt.frame - play.startAt.frame + 1);

  if (track === null) {
    return {
      playId: play.playId,
      playerPresent: false,
      trackId: null,
      preSnapPosition: null,
      postSnapTrajectory: [],
      visibilityPercentage: 0,
      involvement: 0,
      rawScore: 0,
      identityConfidence: 0,
      reasons: ["The athlete was not detected on this play."],
      events: [],
      reviewRequired: false,
    };
  }

  const inPlay = track.detections.filter(
    (d) => d.at.frame >= play.startAt.frame && d.at.frame <= play.endAt.frame,
  );
  const visibilityPercentage = Math.min(1, inPlay.length / playFrames);

  const snapFrame = play.snapAt?.frame ?? play.startAt.frame;
  const preSnap =
    [...inPlay].reverse().find((d) => d.at.frame <= snapFrame) ?? inPlay[0];
  const preSnapPosition =
    preSnap === undefined ? null : (preSnap.field ?? boxCenter(preSnap.box));
  const postSnapTrajectory: Point[] = inPlay
    .filter((d) => d.at.frame >= snapFrame)
    .map((d) => boxCenter(d.box));

  const reasons: string[] = [];
  const attributed = events.filter((e) => e.trackId === track.trackId);
  const eventKinds = [...new Set(attributed.map((e) => e.kind))];

  // --- Event-driven impact, weighted by position ----------------------------
  const positions = input.target.positions;
  let best = 0;
  for (const event of attributed) {
    const base = EVENT_BASE_IMPACT[event.kind];
    const onPosition = positions.some((p) => POSITION_EVENTS[p].includes(event.kind));
    const weighted = base * (onPosition ? ON_POSITION_BONUS : OFF_POSITION_BONUS);
    // Multiply by the detector's own confidence: a 0.4-confidence "sack" must
    // not produce a 5-star highlight. This is where the honesty rule becomes
    // arithmetic.
    const scaled = weighted * event.confidence;
    if (scaled > best) best = scaled;
    reasons.push(
      `${describeEvent(event.kind)} detected (${Math.round(event.confidence * 100)}% confidence)` +
        (onPosition ? ` — a ${positions.join("/")} play.` : "."),
    );
  }

  // --- Ball proximity and possession ---------------------------------------
  const proximity = ballProximity(input.ball, track, play, frameRate);
  if (proximity.possessedFrames > 0) {
    const seconds = proximity.possessedFrames / frameRate;
    reasons.push(`Had the football for ${seconds.toFixed(1)}s.`);
    best = Math.max(best, 3.2);
  } else if (proximity.minDistance !== null && proximity.minDistance <= NEAR_BALL) {
    reasons.push("Was at the point of attack.");
    best = Math.max(best, 2.0);
  }

  // --- Movement ------------------------------------------------------------
  const travelled = pathLength(postSnapTrajectory);
  if (travelled > 0.35) {
    reasons.push("Covered significant ground after the snap.");
    best = Math.max(best, 2.0);
  }

  // Present but nothing found. Say exactly that rather than padding the score.
  if (best === 0) {
    reasons.push("On the field, but no involvement in the play was detected.");
    best = 1;
  }

  // Barely visible: the evidence is thin, so the claim must be too.
  if (visibilityPercentage < 0.15 && best > 2) {
    best = Math.min(best, 2.5);
    reasons.push(
      `Only visible for ${Math.round(visibilityPercentage * 100)}% of the play, so this rating is capped.`,
    );
  }

  const involvement = toInvolvementScore(best);
  return {
    playId: play.playId,
    playerPresent: true,
    trackId: track.trackId,
    preSnapPosition,
    postSnapTrajectory,
    visibilityPercentage,
    involvement,
    rawScore: Math.min(5, Math.max(0, best)),
    identityConfidence: input.identityConfidence,
    reasons,
    events: eventKinds,
    reviewRequired: input.identityConfidence < reviewThreshold,
  };
}

function toInvolvementScore(raw: number): InvolvementScore {
  const rounded = Math.round(Math.min(5, Math.max(0, raw)));
  return rounded as InvolvementScore;
}

function describeEvent(kind: FootballEventKind): string {
  const words: Partial<Record<FootballEventKind, string>> = {
    pass_breakup: "Pass breakup",
    run_stop: "Run stop",
    forced_fumble: "Forced fumble",
    pancake: "Pancake block",
  };
  const w = words[kind];
  if (w !== undefined) return w;
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

export interface BallProximity {
  /** Closest the athlete got to the ball, normalised. null if never seen. */
  readonly minDistance: number | null;
  /** Frames the carrier estimator attributed to this track. */
  readonly possessedFrames: number;
  readonly nearBallFrames: number;
}

export function ballProximity(
  ball: BallTrack | null,
  track: PlayerTrack,
  play: Play,
  _frameRate: number,
): BallProximity {
  if (ball === null)
    return { minDistance: null, possessedFrames: 0, nearBallFrames: 0 };

  const byFrame = new Map(track.detections.map((d) => [d.at.frame, d] as const));
  let minDistance: number | null = null;
  let nearBallFrames = 0;
  for (const bd of ball.detections) {
    if (bd.at.frame < play.startAt.frame || bd.at.frame > play.endAt.frame) continue;
    const pd = byFrame.get(bd.at.frame);
    if (pd === undefined) continue;
    const pc = boxCenter(pd.box);
    const bc = boxCenter(bd.box);
    const d = Math.hypot(pc.x - bc.x, pc.y - bc.y);
    if (minDistance === null || d < minDistance) minDistance = d;
    if (d <= NEAR_BALL) nearBallFrames += 1;
  }

  let possessedFrames = 0;
  for (const [frame, carrier] of ball.carrierByFrame) {
    if (frame < play.startAt.frame || frame > play.endAt.frame) continue;
    if (carrier.trackId === track.trackId && carrier.confidence >= 0.5)
      possessedFrames += 1;
  }

  return { minDistance, possessedFrames, nearBallFrames };
}

function pathLength(points: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    /* c8 ignore next */
    if (a === undefined || b === undefined) continue;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

/** Which side of the ball the athlete plays, for UI grouping and for labelling
 *  a play "Defensive Play" the way the Game Analysis screen does. */
export function primarySide(target: PlayerTarget): Side {
  const first = target.positions[0];
  return first === undefined ? "offense" : sideOf(first);
}
