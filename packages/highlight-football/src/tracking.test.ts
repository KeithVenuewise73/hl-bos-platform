import { describe, expect, it } from "vitest";
import {
  countIdentitySwitches,
  resolveIdentity,
  signatureFromTrack,
  stitchTracks,
  trackForPlay,
  voteForTrack,
} from "./tracking";
import { COLOR_REFERENCE } from "./color";
import { timestamp } from "./types";
import type { Play, PlayerDetection, PlayerTarget, PlayerTrack } from "./types";

const FPS = 30;

const target: PlayerTarget = {
  playerId: "p-23",
  name: "Dominic Herman",
  number: 23,
  teamId: "team-a",
  uniform: { jersey: "blue", numberColor: "white", helmet: "navy", pants: "white" },
  positions: ["S", "WR"],
};

interface TrackSpec {
  id: string;
  from: number;
  to: number;
  teamId: string | null;
  teamConfidence: number;
  /** Readable number readings, as [frameOffset, number, confidence]. */
  readings?: Array<[number, number, number]>;
  x?: number;
  jersey?: typeof COLOR_REFERENCE.blue;
}

function makeTrack(spec: TrackSpec): PlayerTrack {
  const detections: PlayerDetection[] = [];
  const readings = new Map(
    (spec.readings ?? []).map(([o, n, c]) => [o, { n, c }] as const),
  );
  for (let f = spec.from; f <= spec.to; f += 3) {
    const r = readings.get(f - spec.from);
    detections.push({
      detectionId: `${spec.id}-${f}`,
      at: timestamp(f, FPS),
      box: { x: spec.x ?? 0.4, y: 0.5, w: 0.06, h: 0.14 },
      confidence: 0.9,
      teamId: spec.teamId,
      teamConfidence: spec.teamConfidence,
      jerseyColor: spec.jersey ?? COLOR_REFERENCE.blue,
      helmetColor: COLOR_REFERENCE.navy,
      pantsColor: COLOR_REFERENCE.white,
      jerseyNumber: r?.n ?? null,
      numberConfidence: r?.c ?? null,
      embedding: [0.6, 0.4, 0.5, 0.2],
      field: null,
    });
  }
  const first = detections[0];
  const last = detections[detections.length - 1];
  return {
    trackId: spec.id,
    detections,
    startedAt: first?.at ?? timestamp(spec.from, FPS),
    endedAt: last?.at ?? timestamp(spec.to, FPS),
    teamId: spec.teamId,
    teamConfidence: spec.teamConfidence,
    trackingConfidence: 0.9,
  };
}

const play: Play = {
  playId: "play-1",
  index: 0,
  startAt: timestamp(0, FPS),
  snapAt: timestamp(30, FPS),
  snapConfidence: 0.8,
  endAt: timestamp(180, FPS),
  offenseTeamId: null,
  defenseTeamId: null,
  quarter: null,
  down: null,
  distance: null,
  segmentationConfidence: 0.9,
};

describe("resolveIdentity — precedence", () => {
  const readable = makeTrack({
    id: "t-23",
    from: 0,
    to: 180,
    teamId: "team-a",
    teamConfidence: 0.95,
    readings: [
      [0, 23, 0.9],
      [30, 23, 0.85],
      [60, 23, 0.92],
    ],
  });

  it("claims a track whose voted number matches, on the number alone", () => {
    const [decision] = resolveIdentity(target, [readable]);
    expect(decision?.isAthlete).toBe(true);
    expect(decision?.source).toBe("jersey_number");
    expect(decision?.confidence).toBeGreaterThan(0.85);
  });

  it("lets a human exclusion overrule a confident number match", () => {
    const [decision] = resolveIdentity(
      target,
      [readable],
      [],
      [{ playerId: "p-23", trackId: "t-23", fromFrame: 0, toFrame: 200 }],
    );
    expect(decision?.isAthlete).toBe(false);
    expect(decision?.source).toBe("user_exclusion");
    expect(decision?.confidence).toBe(1);
  });

  it("lets a human lock claim a track with no readable number at all", () => {
    const unreadable = makeTrack({
      id: "t-?",
      from: 0,
      to: 180,
      teamId: "team-a",
      teamConfidence: 0.9,
    });
    const [decision] = resolveIdentity(
      target,
      [unreadable],
      [
        {
          playerId: "p-23",
          trackId: "t-?",
          fromFrame: 0,
          toFrame: 200,
          source: "user_confirmation",
        },
      ],
    );
    expect(decision?.isAthlete).toBe(true);
    expect(decision?.source).toBe("user_lock");
    expect(decision?.confidence).toBe(1);
    expect(decision?.reviewRequired).toBe(false);
  });

  it("rejects a confidently-different team outright", () => {
    const opponent = makeTrack({
      id: "t-opp",
      from: 0,
      to: 180,
      teamId: "team-b",
      teamConfidence: 0.95,
      readings: [
        [0, 23, 0.9],
        [30, 23, 0.9],
      ],
      jersey: COLOR_REFERENCE.white,
    });
    const [decision] = resolveIdentity(target, [opponent]);
    expect(decision?.isAthlete).toBe(false);
    expect(decision?.reasons.join(" ")).toContain("other team");
  });

  it("rejects a teammate whose number was read clearly and differently", () => {
    const teammate = makeTrack({
      id: "t-55",
      from: 0,
      to: 180,
      teamId: "team-a",
      teamConfidence: 0.95,
      readings: [
        [0, 55, 0.9],
        [30, 55, 0.9],
        [60, 55, 0.9],
      ],
    });
    const [decision] = resolveIdentity(target, [teammate]);
    expect(decision?.isAthlete).toBe(false);
    expect(decision?.reasons.join(" ")).toContain("#55");
  });

  it("does NOT reject #28 outright, because 23 and 28 are a known OCR confusion", () => {
    const maybe = makeTrack({
      id: "t-28",
      from: 0,
      to: 180,
      teamId: "team-a",
      teamConfidence: 0.95,
      readings: [
        [0, 28, 0.9],
        [30, 28, 0.9],
        [60, 28, 0.9],
      ],
    });
    const [decision] = resolveIdentity(target, [maybe]);
    expect(decision?.isAthlete).toBe(false);
    expect(decision?.reviewRequired).toBe(true);
    expect(decision?.reasons.join(" ")).toContain("easily confused");
  });

  it("will not claim a track on team colour alone — both teams field eleven of them", () => {
    const anonymous = makeTrack({
      id: "t-anon",
      from: 0,
      to: 180,
      teamId: "team-a",
      teamConfidence: 0.99,
    });
    const [decision] = resolveIdentity(target, [anonymous]);
    expect(decision?.isAthlete).toBe(false);
    expect(decision?.reviewRequired).toBe(true);
  });

  it("returns a decision for every track, including the rejections", () => {
    const decisions = resolveIdentity(target, [
      readable,
      makeTrack({ id: "t-b", from: 0, to: 60, teamId: "team-b", teamConfidence: 0.95 }),
      makeTrack({ id: "t-c", from: 0, to: 60, teamId: null, teamConfidence: 0 }),
    ]);
    expect(decisions).toHaveLength(3);
    expect(decisions.every((d) => d.reasons.length > 0)).toBe(true);
  });
});

describe("resolveIdentity — a lock propagates (section 26)", () => {
  it("re-acquires an unreadable second track by matching it to the locked one", () => {
    const anchored = makeTrack({
      id: "t-a",
      from: 0,
      to: 90,
      teamId: "team-a",
      teamConfidence: 0.95,
      readings: [[0, 23, 0.9]],
      x: 0.4,
    });
    // He reappears after a pile-up: no readable number, but same uniform,
    // same build, and a plausible distance away a second later.
    const reacquired = makeTrack({
      id: "t-b",
      from: 120,
      to: 220,
      teamId: "team-a",
      teamConfidence: 0.95,
      x: 0.5,
    });

    const without = resolveIdentity(target, [anchored, reacquired]);
    expect(without.find((d) => d.trackId === "t-b")?.isAthlete).toBe(false);

    const withLock = resolveIdentity(
      target,
      [anchored, reacquired],
      [
        {
          playerId: "p-23",
          trackId: "t-a",
          fromFrame: 0,
          toFrame: 90,
          source: "user_confirmation",
        },
      ],
    );
    const reacquiredDecision = withLock.find((d) => d.trackId === "t-b");
    expect(reacquiredDecision?.isAthlete).toBe(true);
    expect(reacquiredDecision?.reasons.join(" ")).toContain("Appearance matches");
  });
});

describe("trackForPlay", () => {
  it("picks the claimed track with the most visible frames inside the play", () => {
    const short = makeTrack({
      id: "t-short",
      from: 0,
      to: 30,
      teamId: "team-a",
      teamConfidence: 0.95,
      readings: [
        [0, 23, 0.95],
        [3, 23, 0.95],
      ],
    });
    const long = makeTrack({
      id: "t-long",
      from: 40,
      to: 175,
      teamId: "team-a",
      teamConfidence: 0.95,
      readings: [
        [0, 23, 0.95],
        [3, 23, 0.95],
      ],
    });
    const decisions = resolveIdentity(target, [short, long]);
    expect(trackForPlay(play, [short, long], decisions).track?.trackId).toBe("t-long");
  });

  it("returns nothing when no track was claimed", () => {
    const anonymous = makeTrack({
      id: "t-anon",
      from: 0,
      to: 180,
      teamId: "team-a",
      teamConfidence: 0.99,
    });
    const decisions = resolveIdentity(target, [anonymous]);
    const result = trackForPlay(play, [anonymous], decisions);
    expect(result.track).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it("returns nothing when the claimed track has no frames in this play", () => {
    const elsewhere = makeTrack({
      id: "t-far",
      from: 600,
      to: 800,
      teamId: "team-a",
      teamConfidence: 0.95,
      readings: [
        [0, 23, 0.95],
        [3, 23, 0.95],
      ],
    });
    const decisions = resolveIdentity(target, [elsewhere]);
    expect(trackForPlay(play, [elsewhere], decisions).track).toBeNull();
  });
});

describe("stitchTracks", () => {
  it("joins the fragments of one athlete into a single continuous track", () => {
    const a = makeTrack({
      id: "t-a",
      from: 0,
      to: 60,
      teamId: "team-a",
      teamConfidence: 0.95,
      readings: [
        [0, 23, 0.95],
        [3, 23, 0.95],
      ],
    });
    const b = makeTrack({
      id: "t-b",
      from: 120,
      to: 180,
      teamId: "team-a",
      teamConfidence: 0.95,
      readings: [
        [0, 23, 0.95],
        [3, 23, 0.95],
      ],
    });
    const decisions = resolveIdentity(target, [a, b]);
    const stitched = stitchTracks([a, b], decisions);
    expect(stitched?.startedAt.frame).toBe(0);
    expect(stitched?.endedAt.frame).toBe(180);
    expect(stitched?.detections.length).toBe(a.detections.length + b.detections.length);
  });

  it("takes the WEAKEST link's confidence, not the average", () => {
    const a = {
      ...makeTrack({
        id: "t-a",
        from: 0,
        to: 60,
        teamId: "team-a",
        teamConfidence: 0.95,
        readings: [
          [0, 23, 0.95],
          [3, 23, 0.95],
        ],
      }),
      trackingConfidence: 0.95,
    };
    const b = {
      ...makeTrack({
        id: "t-b",
        from: 120,
        to: 180,
        teamId: "team-a",
        teamConfidence: 0.95,
        readings: [
          [0, 23, 0.95],
          [3, 23, 0.95],
        ],
      }),
      trackingConfidence: 0.61,
    };
    const decisions = resolveIdentity(target, [a, b]);
    expect(stitchTracks([a, b], decisions)?.trackingConfidence).toBe(0.61);
  });

  it("returns null when nothing was claimed", () => {
    const anon = makeTrack({
      id: "t-anon",
      from: 0,
      to: 60,
      teamId: "team-a",
      teamConfidence: 0.99,
    });
    expect(stitchTracks([anon], resolveIdentity(target, [anon]))).toBeNull();
  });
});

describe("signatureFromTrack and voteForTrack", () => {
  it("derives velocity from the end of the track", () => {
    const moving: PlayerTrack = makeTrack({
      id: "t",
      from: 0,
      to: 60,
      teamId: "team-a",
      teamConfidence: 0.9,
    });
    const drifting: PlayerTrack = {
      ...moving,
      detections: moving.detections.map((d, i) => ({
        ...d,
        box: { ...d.box, x: 0.2 + i * 0.02 },
      })),
    };
    const signature = signatureFromTrack(drifting);
    expect(signature.velocity?.vx ?? 0).toBeGreaterThan(0);
  });

  it("takes the median uniform colour, so one bad frame cannot move it", () => {
    const base = makeTrack({
      id: "t",
      from: 0,
      to: 60,
      teamId: "team-a",
      teamConfidence: 0.9,
    });
    const withOutlier: PlayerTrack = {
      ...base,
      detections: base.detections.map((d, i) =>
        i === 3 ? { ...d, jerseyColor: COLOR_REFERENCE.orange } : d,
      ),
    };
    const jersey = signatureFromTrack(withOutlier).jerseyColor;
    expect(jersey).toEqual(COLOR_REFERENCE.blue);
  });

  it("votes null on a track nobody could read", () => {
    expect(
      voteForTrack(
        makeTrack({ id: "t", from: 0, to: 60, teamId: "team-a", teamConfidence: 0.9 }),
      ).number,
    ).toBeNull();
  });
});

describe("countIdentitySwitches", () => {
  it("counts a switch when the assignment changes under an unchanged truth", () => {
    const assigned = new Map([
      [1, "A"],
      [2, "A"],
      [3, "B"],
      [4, "B"],
      [5, "A"],
    ]);
    const truth = new Map([
      [1, "X"],
      [2, "X"],
      [3, "X"],
      [4, "X"],
      [5, "X"],
    ]);
    expect(countIdentitySwitches(assigned, truth)).toBe(2);
  });

  it("counts nothing when the assignment is stable", () => {
    const assigned = new Map([
      [1, "A"],
      [2, "A"],
      [3, "A"],
    ]);
    const truth = new Map([
      [1, "X"],
      [2, "X"],
      [3, "X"],
    ]);
    expect(countIdentitySwitches(assigned, truth)).toBe(0);
  });

  it("ignores frames where either side is unknown", () => {
    const assigned = new Map<number, string | null>([
      [1, "A"],
      [2, null],
      [3, "A"],
    ]);
    const truth = new Map<number, string | null>([
      [1, "X"],
      [2, "X"],
      [3, null],
    ]);
    expect(countIdentitySwitches(assigned, truth)).toBe(0);
  });
});
