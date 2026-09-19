/**
 * The synthetic game generator behind demo mode (brief section 44).
 *
 * WHAT THIS IS, AND WHAT IT IS NOT.
 *
 * It is a football game expressed as geometry: twenty-two bodies with positions
 * over time, a ball, a camera that pans, jerseys whose numbers are legible from
 * some angles and not others, and the specific failures the brief lists —
 * pile-ups, occlusion, a player leaving frame, two teammates with confusable
 * numbers. Every value it emits is generated from that geometry.
 *
 * It is NOT a set of canned answers. It produces the same shape of input a real
 * detector produces — noisy boxes, sampled colours, mostly-unreadable numbers —
 * and then the REAL engine has to work it out. The demo can therefore get
 * things wrong, and does: the occlusion scenario genuinely splits the athlete
 * into multiple tracks, and re-identification genuinely has to reconnect them.
 * A demo that could not fail would prove nothing about the product.
 *
 * Everything is seeded, so the same scenario produces the same game forever and
 * a regression is a diff rather than a story.
 */

import type {
  BallDetection,
  BallTrack,
  FootballEvent,
  FootballEventKind,
  Game,
  PlayerDetection,
  PlayerTarget,
  PlayerTrack,
  Rgb,
  Team,
} from "../types";
import { timestamp } from "../types";
import type { FrameSignal } from "../segmentation";
import { COLOR_REFERENCE } from "../color";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SyntheticPlaySpec {
  /** Seconds of dead time before this play's snap. */
  readonly deadSeconds: number;
  readonly liveSeconds: number;
  /** Is the selected athlete on the field for it? */
  readonly athleteOnField: boolean;
  /** Event attributed to the athlete, if any. */
  readonly athleteEvent: FootballEventKind | null;
  readonly athleteEventConfidence: number;
  /** Does the athlete carry the ball on this play? */
  readonly athleteHasBall: boolean;
  /** Camera pans during this play (adds global motion). */
  readonly cameraPan: boolean;
  /** Frames (relative to play start) where the athlete is fully occluded. */
  readonly occlusionSeconds: readonly [number, number] | null;
  /** Window where his number cannot be read at all. */
  readonly numberInvisibleSeconds: readonly [number, number] | null;
  /** He runs out of frame and comes back. */
  readonly leavesFrame: boolean;
}

export interface SyntheticGameOptions {
  readonly seed?: number;
  readonly frameRate?: number;
  readonly teamAJersey?: Rgb;
  readonly teamBJersey?: Rgb;
  readonly targetNumber?: number;
  readonly targetName?: string;
  /** A teammate whose number the recogniser confuses with the target's. */
  readonly confusableTeammateNumber?: number | null;
  /** How often a number reading succeeds at all, 0..1. */
  readonly numberReadability?: number;
  /** Simulated exposure swing, added to every sampled colour. Night games. */
  readonly lightingOffset?: number;
  readonly plays: readonly SyntheticPlaySpec[];
  /** A camera pan during dead time that must NOT be mistaken for a play. */
  readonly deadTimePanBeforePlay?: number | null;
}

export interface SyntheticTruth {
  readonly plays: ReadonlyArray<{
    startSeconds: number;
    endSeconds: number;
    snapSeconds: number;
  }>;
  /** The tracks that really are the athlete. */
  readonly athleteTrackIds: readonly string[];
  readonly athleteByFrame: ReadonlyMap<number, string | null>;
  readonly jerseyReadings: ReadonlyArray<{ predicted: number | null; truth: number }>;
  readonly involvedPlayIndexes: readonly number[];
}

export interface SyntheticGame {
  readonly game: Game;
  readonly teams: readonly [Team, Team];
  readonly target: PlayerTarget;
  readonly signals: readonly FrameSignal[];
  readonly tracks: readonly PlayerTrack[];
  readonly ball: BallTrack;
  readonly events: readonly FootballEvent[];
  readonly truth: SyntheticTruth;
}

const DEAD_MOTION = 0.012;
const LIVE_PEAK = 0.26;

/** Deterministic unit embedding per player. Teammates in identical uniforms sit
 *  close together on purpose — that is exactly why an embedding alone cannot
 *  separate them and the number has to carry the decision. */
function embeddingFor(playerKey: string, teamId: string, dim = 16): number[] {
  const teamSeed = [...teamId].reduce((a, c) => a + c.charCodeAt(0), 0);
  const playerSeed = [...playerKey].reduce((a, c) => a + c.charCodeAt(0), 0);
  const teamRand = mulberry32(teamSeed * 7919);
  const playerRand = mulberry32(playerSeed * 104729);
  const v: number[] = [];
  for (let i = 0; i < dim; i++) {
    // 80% team (same uniform), 20% individual. Mirrors the real failure mode.
    v.push(teamRand() * 0.8 + playerRand() * 0.2);
  }
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
}

function jitterColor(base: Rgb, rand: () => number, lighting: number): Rgb {
  const clamp = (v: number): number => Math.round(Math.min(255, Math.max(0, v)));
  // Exposure moves all three channels together; sensor noise does not.
  const exposure = lighting + (rand() - 0.5) * 18;
  return {
    r: clamp(base.r + exposure + (rand() - 0.5) * 10),
    g: clamp(base.g + exposure + (rand() - 0.5) * 10),
    b: clamp(base.b + exposure + (rand() - 0.5) * 10),
  };
}

/**
 * Build a complete synthetic game.
 *
 * Detections are emitted for the athlete and for a small supporting cast — the
 * confusable teammate and two opponents — rather than for all twenty-two. The
 * cast is chosen to exercise the decisions that can go wrong; adding eighteen
 * more bodies that are never near the ball would make the fixtures slower and
 * no more searching.
 */
export function buildSyntheticGame(opts: SyntheticGameOptions): SyntheticGame {
  const fps = opts.frameRate ?? 30;
  const seed = opts.seed ?? 20260911;
  const rand = mulberry32(seed);
  const targetNumber = opts.targetNumber ?? 23;
  const targetName = opts.targetName ?? "Dominic Herman";
  const readability = opts.numberReadability ?? 0.32;
  const lighting = opts.lightingOffset ?? 0;

  const teamAJersey = opts.teamAJersey ?? COLOR_REFERENCE.blue;
  const teamBJersey = opts.teamBJersey ?? COLOR_REFERENCE.white;

  const teams: readonly [Team, Team] = [
    {
      id: "team-a",
      name: "West Seneca",
      uniform: { jersey: "blue", numberColor: "white", helmet: "navy", pants: "white" },
    },
    {
      id: "team-b",
      name: "Orchard Park",
      uniform: { jersey: "white", numberColor: "red", helmet: "white", pants: "red" },
    },
  ];

  const target: PlayerTarget = {
    playerId: "player-target",
    name: targetName,
    number: targetNumber,
    teamId: "team-a",
    uniform: teams[0].uniform,
    positions: ["S", "WR"],
  };

  const cast = [
    { key: "target", teamId: "team-a", number: targetNumber, jersey: teamAJersey },
    ...(opts.confusableTeammateNumber != null
      ? [
          {
            key: "teammate",
            teamId: "team-a",
            number: opts.confusableTeammateNumber,
            jersey: teamAJersey,
          },
        ]
      : []),
    { key: "opponent-1", teamId: "team-b", number: 7, jersey: teamBJersey },
  ];

  const helmetFor = (teamId: string): Rgb =>
    teamId === "team-a" ? COLOR_REFERENCE.navy : COLOR_REFERENCE.white;
  const pantsFor = (teamId: string): Rgb =>
    teamId === "team-a" ? COLOR_REFERENCE.white : COLOR_REFERENCE.red;

  const signals: FrameSignal[] = [];
  const detectionsByCast = new Map<string, PlayerDetection[]>(
    cast.map((c) => [c.key, []]),
  );
  const ballDetections: BallDetection[] = [];
  const carrierByFrame = new Map<number, { trackId: string; confidence: number }>();
  const events: FootballEvent[] = [];
  const truthPlays: Array<{
    startSeconds: number;
    endSeconds: number;
    snapSeconds: number;
  }> = [];
  const athleteByFrame = new Map<number, string | null>();
  const jerseyReadings: Array<{ predicted: number | null; truth: number }> = [];
  const involvedPlayIndexes: number[] = [];

  let frame = 0;

  const pushDeadFrames = (count: number, pan: boolean): void => {
    for (let i = 0; i < count; i++) {
      const cameraMotion = pan ? 0.09 + (rand() - 0.5) * 0.01 : 0;
      signals.push({
        frame,
        // A pan moves everything on screen: the raw motion signal includes it,
        // which is exactly the trap the segmenter has to avoid.
        motion: DEAD_MOTION + rand() * 0.004 + cameraMotion,
        cameraMotion,
        dispersion: 0.18 + rand() * 0.01,
        playerCount: 22,
        audio: 0.1 + rand() * 0.03,
      });
      athleteByFrame.set(frame, null);
      frame += 1;
    }
  };

  opts.plays.forEach((spec, playIndex) => {
    const deadFrames = Math.max(1, Math.round(spec.deadSeconds * fps));
    const panDead = opts.deadTimePanBeforePlay === playIndex;
    pushDeadFrames(deadFrames, panDead);

    const snapFrame = frame;
    const liveFrames = Math.max(1, Math.round(spec.liveSeconds * fps));
    truthPlays.push({
      startSeconds: (snapFrame - Math.round(1.0 * fps)) / fps,
      endSeconds: (snapFrame + liveFrames) / fps,
      snapSeconds: snapFrame / fps,
    });
    if (spec.athleteOnField && (spec.athleteEvent !== null || spec.athleteHasBall)) {
      involvedPlayIndexes.push(playIndex);
    }

    const playRand = mulberry32(seed + playIndex * 1013);

    for (let i = 0; i < liveFrames; i++) {
      const t = i / liveFrames;
      const cameraMotion = spec.cameraPan ? 0.07 + (playRand() - 0.5) * 0.01 : 0;
      // Sharp onset at the snap, sustained through contact, decaying to the
      // whistle. This is the shape detectSnap() is looking for.
      const envelope = t < 0.08 ? t / 0.08 : Math.exp(-2.1 * (t - 0.08));
      signals.push({
        frame,
        motion: DEAD_MOTION + LIVE_PEAK * envelope + playRand() * 0.01 + cameraMotion,
        cameraMotion,
        dispersion: 0.18 + 0.3 * Math.min(1, t * 3),
        playerCount: 22,
        audio: i < 4 ? 0.62 + playRand() * 0.08 : 0.16 + playRand() * 0.05,
      });

      const seconds = i / fps;
      const occluded =
        spec.occlusionSeconds !== null &&
        seconds >= spec.occlusionSeconds[0] &&
        seconds <= spec.occlusionSeconds[1];
      const offFrame = spec.leavesFrame && t > 0.45 && t < 0.68;
      const numberHidden =
        spec.numberInvisibleSeconds !== null &&
        seconds >= spec.numberInvisibleSeconds[0] &&
        seconds <= spec.numberInvisibleSeconds[1];

      for (const member of cast) {
        const isTarget = member.key === "target";
        if (isTarget && !spec.athleteOnField) continue;
        // An occluded or off-screen player produces NO detection. That gap is
        // what splits his track and creates the re-identification problem.
        if (isTarget && (occluded || offFrame)) continue;

        const lane =
          member.key === "target" ? 0.34 : member.key === "teammate" ? 0.55 : 0.7;
        const drift = isTarget ? 0.42 * t : 0.18 * t;
        const x = 0.2 + drift + (member.key === "opponent-1" ? 0.12 : 0);
        const y = lane + Math.sin(t * Math.PI * (isTarget ? 1.4 : 0.8)) * 0.05;
        const h = 0.14 + playRand() * 0.006;
        const w = h * 0.42;
        const box = { x: Math.min(0.96, x), y, w, h };

        // Number readability: mostly unreadable, as in real football film.
        let readNumber: number | null = null;
        let numberConfidence: number | null = null;
        const readRoll = playRand();
        if (!numberHidden && readRoll < readability) {
          readNumber = member.number;
          numberConfidence = 0.72 + playRand() * 0.24;
        } else if (!numberHidden && readRoll < readability + 0.04) {
          // A genuine misread, at low confidence. Without these the temporal
          // vote is never actually tested.
          readNumber = (member.number + 5) % 100;
          numberConfidence = 0.36 + playRand() * 0.12;
        }
        if (isTarget)
          jerseyReadings.push({ predicted: readNumber, truth: member.number });

        const det: PlayerDetection = {
          detectionId: `${member.key}-${frame}`,
          at: timestamp(frame, fps),
          box,
          confidence: 0.82 + playRand() * 0.15,
          teamId: member.teamId,
          teamConfidence: 0.88 + playRand() * 0.1,
          jerseyColor: jitterColor(member.jersey, playRand, lighting),
          helmetColor: jitterColor(helmetFor(member.teamId), playRand, lighting),
          pantsColor: jitterColor(pantsFor(member.teamId), playRand, lighting),
          jerseyNumber: readNumber,
          numberConfidence,
          embedding: embeddingFor(member.key, member.teamId),
          field: null,
        };
        detectionsByCast.get(member.key)?.push(det);
      }

      // Ball: travels toward the athlete on plays he is involved in.
      const ballX = spec.athleteHasBall ? 0.2 + 0.42 * t : 0.5 + 0.1 * t;
      const ballY = spec.athleteHasBall
        ? 0.34 + Math.sin(t * Math.PI * 1.4) * 0.05
        : 0.6;
      ballDetections.push({
        at: timestamp(frame, fps),
        box: { x: ballX, y: ballY, w: 0.012, h: 0.012 },
        confidence: 0.35 + playRand() * 0.3,
      });
      if (spec.athleteHasBall && t > 0.3 && !occluded && !offFrame) {
        carrierByFrame.set(frame, { trackId: "", confidence: 0.78 });
      }

      athleteByFrame.set(
        frame,
        spec.athleteOnField && !occluded && !offFrame ? "target" : null,
      );
      frame += 1;
    }

    if (spec.athleteEvent !== null && spec.athleteOnField) {
      events.push({
        eventId: `event-${playIndex}`,
        playId: `play-${playIndex + 1}`,
        kind: spec.athleteEvent,
        at: timestamp(snapFrame + Math.round(liveFrames * 0.55), fps),
        trackId: "",
        confidence: spec.athleteEventConfidence,
      });
    }
  });

  pushDeadFrames(Math.round(2 * fps), false);

  // --- Split detections into tracks at gaps -------------------------------
  // A tracker loses a player it cannot see. Emitting one unbroken track across
  // an occlusion would hand the engine an answer the real world does not.
  const gapFrames = Math.round(0.4 * fps);
  const tracks: PlayerTrack[] = [];
  const athleteTrackIds: string[] = [];

  for (const member of cast) {
    const dets = detectionsByCast.get(member.key) ?? [];
    if (dets.length === 0) continue;
    let current: PlayerDetection[] = [];
    let part = 0;
    const flush = (): void => {
      const first = current[0];
      const last = current[current.length - 1];
      if (first === undefined || last === undefined) return;
      part += 1;
      const trackId = `${member.key}-t${part}`;
      tracks.push({
        trackId,
        detections: current,
        startedAt: first.at,
        endedAt: last.at,
        teamId: member.teamId,
        teamConfidence: 0.9,
        // A track that begins after a gap is a re-acquisition, and the tracker
        // knows it: lower continuity confidence, honestly reported.
        trackingConfidence: part === 1 ? 0.93 : 0.74,
      });
      if (member.key === "target") athleteTrackIds.push(trackId);
      current = [];
    };
    for (const det of dets) {
      const prev = current[current.length - 1];
      if (prev !== undefined && det.at.frame - prev.at.frame > gapFrames) flush();
      current.push(det);
    }
    flush();
  }

  // Bind the ball carrier and events to whichever athlete track covers them.
  const targetTracks = tracks.filter((t) => athleteTrackIds.includes(t.trackId));
  const trackAt = (f: number): string | null =>
    targetTracks.find((t) => t.startedAt.frame <= f && t.endedAt.frame >= f)?.trackId ??
    null;

  const boundCarriers = new Map<number, { trackId: string; confidence: number }>();
  for (const [f, c] of carrierByFrame) {
    const id = trackAt(f);
    if (id !== null) boundCarriers.set(f, { trackId: id, confidence: c.confidence });
  }
  const boundEvents: FootballEvent[] = events.map((e) => ({
    ...e,
    trackId: trackAt(e.at.frame),
  }));

  const durationSeconds = frame / fps;
  const game: Game = {
    id: "demo-game",
    name: "West Seneca vs Orchard Park",
    teamId: "team-a",
    opponentName: "Orchard Park",
    playedOn: "2026-09-11",
    level: "high_school",
    cameraType: "press_box",
    frameRate: fps,
    durationSeconds,
  };

  const athleteFrameMap = new Map<number, string | null>();
  for (const [f, v] of athleteByFrame)
    athleteFrameMap.set(f, v === null ? null : trackAt(f));

  return {
    game,
    teams,
    target,
    signals,
    tracks,
    ball: { detections: ballDetections, carrierByFrame: boundCarriers },
    events: boundEvents,
    truth: {
      plays: truthPlays,
      athleteTrackIds,
      athleteByFrame: athleteFrameMap,
      jerseyReadings,
      involvedPlayIndexes,
    },
  };
}
