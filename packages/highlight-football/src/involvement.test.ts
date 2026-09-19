import { describe, expect, it } from "vitest";
import {
  POSITION_EVENTS,
  ballProximity,
  primarySide,
  scoreInvolvement,
} from "./involvement";
import { COLOR_REFERENCE } from "./color";
import { timestamp } from "./types";
import type {
  BallDetection,
  BallTrack,
  FootballEvent,
  FootballEventKind,
  Play,
  PlayerDetection,
  PlayerTarget,
  PlayerTrack,
  Position,
} from "./types";

const FPS = 30;

const play: Play = {
  playId: "play-1",
  index: 0,
  startAt: timestamp(0, FPS),
  snapAt: timestamp(30, FPS),
  snapConfidence: 0.85,
  endAt: timestamp(180, FPS),
  offenseTeamId: null,
  defenseTeamId: null,
  quarter: null,
  down: null,
  distance: null,
  segmentationConfidence: 0.9,
};

const targetWith = (positions: readonly Position[]): PlayerTarget => ({
  playerId: "p-23",
  name: "Dominic Herman",
  number: 23,
  teamId: "team-a",
  uniform: { jersey: "blue", numberColor: "white", helmet: "navy", pants: "white" },
  positions,
});

function makeTrack(
  opts: {
    from?: number;
    to?: number;
    step?: number;
    xStart?: number;
    xEnd?: number;
  } = {},
): PlayerTrack {
  const from = opts.from ?? 0;
  const to = opts.to ?? 180;
  const step = opts.step ?? 3;
  const xStart = opts.xStart ?? 0.4;
  const xEnd = opts.xEnd ?? 0.42;
  const detections: PlayerDetection[] = [];
  const span = Math.max(1, to - from);
  for (let f = from; f <= to; f += step) {
    const t = (f - from) / span;
    detections.push({
      detectionId: `d-${f}`,
      at: timestamp(f, FPS),
      box: { x: xStart + (xEnd - xStart) * t, y: 0.5, w: 0.06, h: 0.14 },
      confidence: 0.9,
      teamId: "team-a",
      teamConfidence: 0.95,
      jerseyColor: COLOR_REFERENCE.blue,
      helmetColor: COLOR_REFERENCE.navy,
      pantsColor: COLOR_REFERENCE.white,
      jerseyNumber: null,
      numberConfidence: null,
      embedding: null,
      field: null,
    });
  }
  const first = detections[0];
  const last = detections[detections.length - 1];
  return {
    trackId: "t-23",
    detections,
    startedAt: first?.at ?? timestamp(from, FPS),
    endedAt: last?.at ?? timestamp(to, FPS),
    teamId: "team-a",
    teamConfidence: 0.95,
    trackingConfidence: 0.9,
  };
}

const event = (kind: FootballEventKind, confidence = 0.85): FootballEvent => ({
  eventId: "e1",
  playId: "play-1",
  kind,
  at: timestamp(100, FPS),
  trackId: "t-23",
  confidence,
});

const base = {
  play,
  target: targetWith(["S"]),
  identityConfidence: 0.9,
  ball: null,
  frameRate: FPS,
};

describe("scoreInvolvement — absence and presence", () => {
  it("scores 0 and says he was not detected, rather than implying he was absent from the game", () => {
    const result = scoreInvolvement({ ...base, track: null, events: [] });
    expect(result.involvement).toBe(0);
    expect(result.playerPresent).toBe(false);
    expect(result.reasons[0]).toContain("not detected");
  });

  it("scores exactly 1 for a play he was on the field for and nothing else", () => {
    const result = scoreInvolvement({ ...base, track: makeTrack(), events: [] });
    expect(result.involvement).toBe(1);
    expect(result.reasons.join(" ")).toContain(
      "no involvement in the play was detected",
    );
  });

  it("reports visibility as a real fraction of the play", () => {
    const result = scoreInvolvement({
      ...base,
      track: makeTrack({ from: 0, to: 90 }),
      events: [],
    });
    expect(result.visibilityPercentage).toBeGreaterThan(0.1);
    expect(result.visibilityPercentage).toBeLessThan(0.35);
  });

  it("records the pre-snap position and the post-snap path separately", () => {
    const result = scoreInvolvement({
      ...base,
      track: makeTrack({ xStart: 0.2, xEnd: 0.8 }),
      events: [],
    });
    expect(result.preSnapPosition).not.toBeNull();
    expect(result.postSnapTrajectory.length).toBeGreaterThan(10);
  });
});

describe("scoreInvolvement — position-specific football (section 13)", () => {
  it("rates a pancake higher for a lineman than for a receiver", () => {
    const lineman = scoreInvolvement({
      ...base,
      target: targetWith(["OL"]),
      track: makeTrack(),
      events: [event("pancake")],
    });
    const receiver = scoreInvolvement({
      ...base,
      target: targetWith(["WR"]),
      track: makeTrack(),
      events: [event("pancake")],
    });
    expect(lineman.rawScore).toBeGreaterThan(receiver.rawScore);
  });

  it("gives an offensive lineman a real highlight for doing his own job", () => {
    // The whole reason position weighting exists: a lineman never touches the
    // ball, and a touchdown-only reel tells his family he did nothing.
    const result = scoreInvolvement({
      ...base,
      target: targetWith(["OL"]),
      track: makeTrack(),
      events: [event("pancake", 0.9)],
    });
    expect(result.involvement).toBeGreaterThanOrEqual(4);
    expect(result.reasons.join(" ")).toContain("OL play");
  });

  it("scores a defensive back's interception as a major highlight", () => {
    const result = scoreInvolvement({
      ...base,
      target: targetWith(["CB"]),
      track: makeTrack(),
      events: [event("interception", 0.9)],
    });
    expect(result.involvement).toBe(5);
  });

  it("still credits a lineman's interception, as the rarity it is", () => {
    const result = scoreInvolvement({
      ...base,
      target: targetWith(["OL"]),
      track: makeTrack(),
      events: [event("interception", 0.9)],
    });
    expect(result.involvement).toBeGreaterThanOrEqual(4);
  });

  it("covers every position with an event list", () => {
    const positions = Object.keys(POSITION_EVENTS) as Position[];
    expect(positions.length).toBe(14);
    for (const p of positions) expect(POSITION_EVENTS[p].length).toBeGreaterThan(0);
  });
});

describe("scoreInvolvement — honesty guards", () => {
  it("scales the score by the event detector's own confidence", () => {
    const confident = scoreInvolvement({
      ...base,
      track: makeTrack(),
      events: [event("sack", 0.95)],
    });
    const doubtful = scoreInvolvement({
      ...base,
      track: makeTrack(),
      events: [event("sack", 0.4)],
    });
    expect(doubtful.rawScore).toBeLessThan(confident.rawScore);
    expect(doubtful.involvement).toBeLessThan(confident.involvement);
  });

  it("caps the claim when he was barely visible, and says why", () => {
    const glimpse = scoreInvolvement({
      ...base,
      track: makeTrack({ from: 0, to: 20 }),
      events: [event("interception", 0.95)],
    });
    expect(glimpse.involvement).toBeLessThanOrEqual(3);
    expect(glimpse.reasons.join(" ")).toContain("capped");
  });

  it("flags REVIEW REQUIRED when identity confidence is low", () => {
    const shaky = scoreInvolvement({
      ...base,
      identityConfidence: 0.4,
      track: makeTrack(),
      events: [],
    });
    expect(shaky.reviewRequired).toBe(true);
    const sure = scoreInvolvement({
      ...base,
      identityConfidence: 0.95,
      track: makeTrack(),
      events: [],
    });
    expect(sure.reviewRequired).toBe(false);
  });

  it("never returns a score without a reason for it", () => {
    for (const kind of [
      "tackle",
      "catch",
      "block",
      "touchdown",
    ] as FootballEventKind[]) {
      const result = scoreInvolvement({
        ...base,
        track: makeTrack(),
        events: [event(kind)],
      });
      expect(result.reasons.length).toBeGreaterThan(0);
    }
  });
});

describe("ball involvement", () => {
  function ballTrack(carrier: boolean, nearby: boolean): BallTrack {
    const detections: BallDetection[] = [];
    const carrierByFrame = new Map<number, { trackId: string; confidence: number }>();
    for (let f = 0; f <= 180; f += 3) {
      detections.push({
        at: timestamp(f, FPS),
        box: { x: nearby ? 0.42 : 0.9, y: nearby ? 0.52 : 0.2, w: 0.012, h: 0.012 },
        confidence: 0.4,
      });
      if (carrier && f > 60)
        carrierByFrame.set(f, { trackId: "t-23", confidence: 0.8 });
    }
    return { detections, carrierByFrame };
  }

  it("credits possession and reports how long he had it", () => {
    const result = scoreInvolvement({
      ...base,
      track: makeTrack(),
      ball: ballTrack(true, true),
      events: [],
    });
    expect(result.involvement).toBeGreaterThanOrEqual(3);
    expect(result.reasons.join(" ")).toContain("Had the football");
  });

  it("credits being at the point of attack without possession", () => {
    const result = scoreInvolvement({
      ...base,
      track: makeTrack(),
      ball: ballTrack(false, true),
      events: [],
    });
    expect(result.involvement).toBe(2);
    expect(result.reasons.join(" ")).toContain("point of attack");
  });

  it("gives nothing for being on the far side of the field from the ball", () => {
    const result = scoreInvolvement({
      ...base,
      track: makeTrack(),
      ball: ballTrack(false, false),
      events: [],
    });
    expect(result.involvement).toBe(1);
  });

  it("reports no proximity at all when the ball was never found", () => {
    const proximity = ballProximity(null, makeTrack(), play, FPS);
    expect(proximity.minDistance).toBeNull();
    expect(proximity.possessedFrames).toBe(0);
  });
});

describe("primarySide", () => {
  it("reads the side from the first listed position", () => {
    expect(primarySide(targetWith(["S", "WR"]))).toBe("defense");
    expect(primarySide(targetWith(["WR", "S"]))).toBe("offense");
    expect(primarySide(targetWith(["K"]))).toBe("special_teams");
    expect(primarySide(targetWith([]))).toBe("offense");
  });
});
