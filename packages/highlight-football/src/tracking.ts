/**
 * Identity resolution: deciding which tracks are THE athlete (sections 3, 25, 26).
 *
 * The tracker produces anonymous tracks — "track 47 existed from frame 9,100 to
 * 9,340". This module answers the only question the product actually cares
 * about: which of those tracks is Dominic Herman?
 *
 * PRECEDENCE, HIGHEST FIRST, AND WHY:
 *
 *   1. A human exclusion ("NOT MY PLAYER"). A person looked at the screen and
 *      said no. Nothing outranks that.
 *   2. A human lock ("THIS IS #23"). Same authority, opposite sign, and it
 *      becomes the anchor every later re-identification is measured against —
 *      which is the whole point of section 26: one confirmation should improve
 *      the rest of the video, not just the frame it was made on.
 *   3. Jersey number, voted over time.
 *   4. Team colour.
 *   5. Appearance re-identification against the anchor.
 *
 * WHY ORDER MATTERS RATHER THAN JUST SUMMING. Blending a human correction into
 * a weighted average lets a confident model overrule a person. That is the
 * behaviour that makes people stop correcting anything, and the corrections are
 * the most valuable data in the system.
 *
 * A NOTE ON REFUSING. Every function here can return "unknown". A youth game
 * has two dozen children in identical blue jerseys with the numbers facing away
 * from a camera on the far sideline, and sometimes the truthful answer is that
 * we cannot tell. Saying so routes the play to REVIEW REQUIRED, where a parent
 * resolves it in two seconds. Guessing puts another child in the reel.
 */

import type {
  PlayerDetection,
  PlayerExclusion,
  PlayerLock,
  PlayerTarget,
  PlayerTrack,
  Play,
  Rgb,
} from "./types";
import { boxCenter } from "./types";
import type { JerseyVote } from "./jersey";
import { matchNumber, temporalVote } from "./jersey";
import type { PlayerSignature, ReIdOptions } from "./reid";
import { similarity } from "./reid";

export type IdentitySource =
  "user_lock" | "user_exclusion" | "jersey_number" | "team_and_reid" | "unresolved";

export interface IdentityDecision {
  readonly trackId: string;
  readonly isAthlete: boolean;
  readonly confidence: number;
  readonly source: IdentitySource;
  /** Plain-English justification, shown in the admin debug view verbatim. */
  readonly reasons: readonly string[];
  readonly jerseyVote: JerseyVote;
  readonly reviewRequired: boolean;
}

export interface IdentityOptions {
  /** Team match confidence below which the team signal is treated as unknown. */
  readonly minTeamConfidence?: number;
  /** Jersey vote confidence that makes the number decisive on its own. */
  readonly decisiveNumberConfidence?: number;
  /** Combined confidence below which a track is flagged for human review. */
  readonly reviewThreshold?: number;
  /** Combined confidence at or above which the track is claimed as the athlete. */
  readonly acceptThreshold?: number;
  readonly reid?: ReIdOptions;
}

const ID_DEFAULTS = {
  minTeamConfidence: 0.6,
  decisiveNumberConfidence: 0.75,
  reviewThreshold: 0.6,
  acceptThreshold: 0.55,
};

/** Median of a colour channel-wise. Median, not mean, so one frame of a
 *  player behind a shadow or a flag does not drag the uniform colour. */
function medianColor(colors: ReadonlyArray<Rgb | null>): Rgb | null {
  const present = colors.filter((c): c is Rgb => c !== null);
  if (present.length === 0) return null;
  const pick = (get: (c: Rgb) => number): number => {
    const vals = present.map(get).sort((a, b) => a - b);
    const mid = Math.floor(vals.length / 2);
    if (vals.length % 2 === 1) return vals[mid] ?? 0;
    return Math.round(((vals[mid - 1] ?? 0) + (vals[mid] ?? 0)) / 2);
  };
  return { r: pick((c) => c.r), g: pick((c) => c.g), b: pick((c) => c.b) };
}

/**
 * Collapse a track into the single signature used for re-identification.
 *
 * Uses the LAST detection for geometry (that is where he was when we lost him,
 * which is what the motion gate needs) and medians across the whole track for
 * appearance (which is what survives one bad frame).
 */
export function signatureFromTrack(
  track: PlayerTrack,
  vote?: JerseyVote,
): PlayerSignature {
  const dets = track.detections;
  const last = dets[dets.length - 1];
  const jerseyVote = vote ?? voteForTrack(track);

  const box = last?.box ?? { x: 0, y: 0, w: 0, h: 0 };
  const at = last?.at ?? track.endedAt;

  // Velocity from the final second of the track, so the prediction the motion
  // gate makes reflects where he was actually heading when contact or a camera
  // move took him.
  let velocity: { vx: number; vy: number } | null = null;
  const recent = dets.slice(-8);
  const first = recent[0];
  if (first !== undefined && last !== undefined && last.at.seconds > first.at.seconds) {
    const dt = last.at.seconds - first.at.seconds;
    const a = boxCenter(first.box);
    const b = boxCenter(last.box);
    velocity = { vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt };
  }

  return {
    trackId: track.trackId,
    at,
    box,
    jerseyColor: medianColor(dets.map((d) => d.jerseyColor)),
    helmetColor: medianColor(dets.map((d) => d.helmetColor)),
    pantsColor: medianColor(dets.map((d) => d.pantsColor)),
    numberColor: null,
    jerseyNumber: jerseyVote.number,
    numberConfidence: jerseyVote.confidence,
    embedding: last?.embedding ?? null,
    field: last?.field ?? null,
    velocity,
  };
}

/** Run the temporal vote over every number reading attempted on a track. */
export function voteForTrack(track: PlayerTrack): JerseyVote {
  return temporalVote(
    track.detections.map((d) => ({
      at: d.at,
      number: d.jerseyNumber,
      confidence: d.numberConfidence ?? 0,
    })),
  );
}

function overlaps(track: PlayerTrack, fromFrame: number, toFrame: number): boolean {
  return track.startedAt.frame <= toFrame && track.endedAt.frame >= fromFrame;
}

/**
 * Decide, for every track in the game, whether it is the selected athlete.
 *
 * Returns a decision for EVERY track — including the rejections — because the
 * admin debug view (section 45) has to be able to show why the track next to
 * the athlete was not chosen. A function that returned only the matches would
 * make every misidentification undiagnosable.
 */
export function resolveIdentity(
  target: PlayerTarget,
  tracks: readonly PlayerTrack[],
  locks: readonly PlayerLock[] = [],
  exclusions: readonly PlayerExclusion[] = [],
  opts: IdentityOptions = {},
): IdentityDecision[] {
  const o = { ...ID_DEFAULTS, ...opts };

  const myLocks = locks.filter((l) => l.playerId === target.playerId);
  const myExclusions = exclusions.filter((e) => e.playerId === target.playerId);

  // Anchors: the tracks a human confirmed. Everything unresolved is compared
  // against these, which is how one confirmation propagates (section 26).
  const anchors: PlayerSignature[] = [];
  for (const lock of myLocks) {
    const t = tracks.find((x) => x.trackId === lock.trackId);
    if (t !== undefined) anchors.push(signatureFromTrack(t));
  }

  const decisions: IdentityDecision[] = [];

  for (const track of tracks) {
    const vote = voteForTrack(track);

    // --- 1. Human exclusion --------------------------------------------------
    const exclusion = myExclusions.find(
      (e) => e.trackId === track.trackId && overlaps(track, e.fromFrame, e.toFrame),
    );
    if (exclusion !== undefined) {
      decisions.push({
        trackId: track.trackId,
        isAthlete: false,
        confidence: 1,
        source: "user_exclusion",
        reasons: ["You marked this track as not your player."],
        jerseyVote: vote,
        reviewRequired: false,
      });
      continue;
    }

    // --- 2. Human lock -------------------------------------------------------
    const lock = myLocks.find(
      (l) => l.trackId === track.trackId && overlaps(track, l.fromFrame, l.toFrame),
    );
    if (lock !== undefined) {
      decisions.push({
        trackId: track.trackId,
        isAthlete: true,
        confidence: 1,
        source: "user_lock",
        reasons: [
          `You confirmed this is #${target.number} ${target.name} ` +
            `(frames ${lock.fromFrame}–${lock.toFrame}).`,
        ],
        jerseyVote: vote,
        reviewRequired: false,
      });
      continue;
    }

    const reasons: string[] = [];

    // --- Team -----------------------------------------------------------------
    const teamMatches = track.teamId === target.teamId;
    const teamConfidence = track.teamConfidence ?? 0;
    const teamKnown = track.teamId !== null && teamConfidence >= o.minTeamConfidence;
    if (teamKnown && !teamMatches) {
      decisions.push({
        trackId: track.trackId,
        isAthlete: false,
        confidence: 1 - teamConfidence,
        source: "team_and_reid",
        reasons: [
          `Wearing the other team's colours (${Math.round(teamConfidence * 100)}% confident).`,
        ],
        jerseyVote: vote,
        reviewRequired: false,
      });
      continue;
    }
    if (teamKnown && teamMatches) {
      reasons.push(`Team colours match (${Math.round(teamConfidence * 100)}%).`);
    } else {
      reasons.push("Team colours could not be read reliably on this track.");
    }

    // --- 3. Jersey number ------------------------------------------------------
    const numberMatch = matchNumber(vote, target.number);
    if (numberMatch.matches && vote.confidence >= o.decisiveNumberConfidence) {
      const confidence = Math.min(
        0.98,
        vote.confidence * (teamKnown && teamMatches ? 1 : 0.85),
      );
      decisions.push({
        trackId: track.trackId,
        isAthlete: true,
        confidence,
        source: "jersey_number",
        reasons: [
          ...reasons,
          `Read #${target.number} on ${vote.supportingFrames} frame(s) ` +
            `(${Math.round(vote.confidence * 100)}% of the vote).`,
        ],
        jerseyVote: vote,
        reviewRequired: confidence < o.reviewThreshold,
      });
      continue;
    }
    if (vote.number !== null && !numberMatch.matches) {
      // A confident, different number is disqualifying — unless it is one of the
      // classic OCR confusions, where saying "definitely not him" would be
      // overconfident about an error mode we know the recogniser has.
      if (vote.confidence >= o.decisiveNumberConfidence && !numberMatch.confusable) {
        decisions.push({
          trackId: track.trackId,
          isAthlete: false,
          confidence: vote.confidence,
          source: "jersey_number",
          reasons: [...reasons, `Read #${vote.number}, not #${target.number}.`],
          jerseyVote: vote,
          reviewRequired: false,
        });
        continue;
      }
      if (numberMatch.confusable) {
        reasons.push(
          `Read #${vote.number}, which is easily confused with #${target.number} — treating as unresolved.`,
        );
      }
    }
    if (vote.number === null) {
      reasons.push(
        vote.abstainingFrames > 0
          ? `Number was never readable (${vote.abstainingFrames} frame(s) tried).`
          : "No number reading was attempted on this track.",
      );
    }

    // --- 4/5. Appearance re-identification against the human anchors ----------
    let reidScore = 0;
    let reidVeto: string | null = null;
    const candidate = signatureFromTrack(track, vote);
    for (const anchor of anchors) {
      const r = similarity(anchor, candidate, opts.reid ?? {});
      if (r.vetoed !== null && r.score === 0) {
        reidVeto = r.vetoed;
        continue;
      }
      if (r.score > reidScore) reidScore = r.score;
    }
    if (anchors.length > 0) {
      if (reidScore > 0) {
        reasons.push(
          `Appearance matches your confirmed track (${Math.round(reidScore * 100)}%).`,
        );
      } else if (reidVeto !== null) {
        reasons.push(`Ruled out against your confirmed track: ${reidVeto}.`);
      }
    }

    // Combine what is left. Team alone is never enough — in football BOTH teams
    // field eleven players in that colour — so a team-only track tops out well
    // below the accept threshold and lands in review.
    const teamComponent = teamKnown && teamMatches ? 0.35 * teamConfidence : 0;
    const numberComponent = numberMatch.matches ? 0.45 * vote.confidence : 0;
    const reidComponent = 0.5 * reidScore;
    const confidence = Math.min(0.95, teamComponent + numberComponent + reidComponent);

    const isAthlete = confidence >= o.acceptThreshold;
    if (!isAthlete) reasons.push("Not enough evidence to claim this is your player.");

    decisions.push({
      trackId: track.trackId,
      isAthlete,
      confidence,
      source: anchors.length > 0 || reidScore > 0 ? "team_and_reid" : "unresolved",
      reasons,
      jerseyVote: vote,
      reviewRequired: confidence < o.reviewThreshold,
    });
  }

  return decisions;
}

/**
 * Pick the athlete's track within one play.
 *
 * When two tracks both claim to be him — which happens when he was occluded and
 * the tracker split him in two — the one with more visible frames inside the
 * play wins, because that is the one a clip can actually follow.
 */
export function trackForPlay(
  play: Play,
  tracks: readonly PlayerTrack[],
  decisions: readonly IdentityDecision[],
): { track: PlayerTrack | null; confidence: number } {
  const claimed = decisions.filter((d) => d.isAthlete);
  if (claimed.length === 0) return { track: null, confidence: 0 };

  const byId = new Map(tracks.map((t) => [t.trackId, t] as const));
  const scored = claimed
    .map((d) => {
      const track = byId.get(d.trackId);
      if (track === undefined) return null;
      const frames = track.detections.filter(
        (x) => x.at.frame >= play.startAt.frame && x.at.frame <= play.endAt.frame,
      ).length;
      return { track, frames, confidence: d.confidence };
    })
    .filter(
      (x): x is { track: PlayerTrack; frames: number; confidence: number } =>
        x !== null,
    )
    .filter((x) => x.frames > 0)
    .sort((a, b) =>
      b.frames !== a.frames ? b.frames - a.frames : b.confidence - a.confidence,
    );

  const best = scored[0];
  if (best === undefined) return { track: null, confidence: 0 };
  return { track: best.track, confidence: best.confidence };
}

/**
 * Merge several tracks the resolver claimed are the same athlete into one.
 *
 * This is what makes "#23 disappeared into a pile and came back out" produce a
 * single continuous athlete rather than three strangers. `trackingConfidence`
 * is set to the WEAKEST link, not the average: a chain is exactly as trustworthy
 * as its worst join.
 */
export function stitchTracks(
  tracks: readonly PlayerTrack[],
  decisions: readonly IdentityDecision[],
  stitchedId = "athlete",
): PlayerTrack | null {
  const claimedIds = new Set(
    decisions.filter((d) => d.isAthlete).map((d) => d.trackId),
  );
  const parts = tracks.filter((t) => claimedIds.has(t.trackId));
  if (parts.length === 0) return null;

  const detections: PlayerDetection[] = parts
    .flatMap((t) => [...t.detections])
    .sort((a, b) => a.at.frame - b.at.frame);
  const firstDet = detections[0];
  const lastDet = detections[detections.length - 1];
  /* c8 ignore next */
  if (firstDet === undefined || lastDet === undefined) return null;

  const confidences = parts.map((p) => p.trackingConfidence);
  const teamIds = new Set(
    parts.map((p) => p.teamId).filter((x): x is string => x !== null),
  );

  return {
    trackId: stitchedId,
    detections,
    startedAt: firstDet.at,
    endedAt: lastDet.at,
    teamId: teamIds.size === 1 ? ([...teamIds][0] ?? null) : null,
    teamConfidence: Math.min(...parts.map((p) => p.teamConfidence ?? 0)),
    trackingConfidence: Math.min(...confidences),
  };
}

/**
 * Count identity switches against ground truth, for the metrics in section 46.
 *
 * An identity switch is the failure that matters most and the one a demo never
 * shows: the reel looks fine until you notice play 14 follows somebody else's
 * child. Counting it requires labelled truth, so this is only ever run over
 * fixtures and user corrections — never over unlabelled customer footage, where
 * it would have to invent the answer it is scoring against.
 */
export function countIdentitySwitches(
  assignedByFrame: ReadonlyMap<number, string | null>,
  truthByFrame: ReadonlyMap<number, string | null>,
): number {
  const frames = [...assignedByFrame.keys()].sort((a, b) => a - b);
  let switches = 0;
  let lastPair: { assigned: string; truth: string } | null = null;
  for (const f of frames) {
    const assigned = assignedByFrame.get(f) ?? null;
    const truth = truthByFrame.get(f) ?? null;
    if (assigned === null || truth === null) continue;
    if (
      lastPair !== null &&
      lastPair.truth === truth &&
      lastPair.assigned !== assigned
    ) {
      switches += 1;
    }
    lastPair = { assigned, truth };
  }
  return switches;
}
