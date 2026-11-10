import { describe, expect, it } from "vitest";

import {
  chooseBroadcast,
  chooseMoments,
  totalSeconds,
  type CameraScores,
} from "./moments.ts";
import { median, robustScores, shrinkByMax } from "./series.ts";
import { findOffset } from "./sync.ts";

/** A pseudo-random number from a seed, so tests are repeatable. */
function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe("series helpers", () => {
  it("scores a quiet game with a few loud moments by how far they stand out", () => {
    const quiet = Array.from({ length: 100 }, (_, i) => -40 + (i % 3));
    quiet[50] = -10;
    const s = robustScores(quiet);
    expect(s[50]!).toBeGreaterThan(10);
    expect(s[10]!).toBeLessThan(2);
  });

  it("scores a flat series 0 everywhere", () => {
    expect(robustScores([5, 5, 5, 5])).toEqual([0, 0, 0, 0]);
  });

  it("still sees a few spikes in an otherwise perfectly still series (a tripod, then a rush)", () => {
    const still = new Array<number>(200).fill(0);
    still[50] = 6;
    still[51] = 5;
    const s = robustScores(still);
    expect(s[50]!).toBeGreaterThan(10);
    expect(s[51]!).toBeGreaterThan(10);
    expect(s[10]).toBe(0);
  });

  it("ignores tiny wobbles when nothing rises far enough to matter", () => {
    const noise = Array.from({ length: 200 }, (_, i) => 0.2 + 0.05 * (i % 4));
    expect(robustScores(noise, 1.5).every((v) => v === 0)).toBe(true);
  });

  it("keeps a short peak when shrinking", () => {
    expect(shrinkByMax([1, 9, 2, 3, 4, 1], 3)).toEqual([9, 4]);
  });

  it("median of an even count is the middle pair's average", () => {
    expect(median([1, 2, 3, 10])).toBe(2.5);
  });
});

describe("lining up two cameras", () => {
  /** A noisy loudness track with sharp events at known times. */
  function track(length: number, events: number[], seed: number): number[] {
    const r = rng(seed);
    const out = Array.from({ length }, () => -45 + 3 * r());
    for (const e of events) for (let k = 0; k < 8; k += 1) out[e + k] = -15 + 2 * r();
    return out;
  }

  it("recovers a start difference of 7.3 seconds", () => {
    const step = 0.1;
    const events = [100, 400, 650, 1100, 1500, 2100, 2600, 3300];
    const a = track(4000, events, 1);
    // B started 7.3 s (73 steps) after A: B's time j is the game at j + 73.
    const b = track(
      4000 - 73,
      events.map((e) => e - 73).filter((e) => e >= 0),
      2,
    );
    const found = findOffset(a, b, step, 0, 30);
    expect(found.offsetSeconds).toBeCloseTo(7.3, 1);
    expect(found.confidence).toBeGreaterThan(0.3);
  });

  it("recovers a negative difference, and starts from the files' own guess", () => {
    const step = 0.1;
    const events = [200, 500, 900, 1400, 1900, 2500, 3000];
    // B started 4.0 s BEFORE A.
    const a = track(3500, events, 3);
    const b = track(
      3500 + 40,
      events.map((e) => e + 40),
      4,
    );
    const found = findOffset(a, b, step, -3, 20);
    expect(found.offsetSeconds).toBeCloseTo(-4.0, 1);
  });

  it("says it is unsure when the two have nothing in common", () => {
    const r = rng(9);
    const a = Array.from({ length: 3000 }, () => -40 + 5 * r());
    const b = Array.from({ length: 3000 }, () => -40 + 5 * r());
    expect(findOffset(a, b, 0.1, 0, 30).confidence).toBeLessThan(0.3);
  });
});

describe("choosing the action", () => {
  const step = 0.5;
  /** 600 s of nothing, with bursts at the given seconds (width 2 s). */
  function scores(duration: number, bursts: number[], strength = 8): CameraScores {
    const n = Math.round(duration / step);
    const s = new Array<number>(n).fill(0);
    for (const b of bursts)
      for (let t = b; t < b + 2; t += step) s[Math.round(t / step)] = strength;
    return { scores: s, durationSeconds: duration };
  }

  it("keeps the moments around each burst and drops the quiet", () => {
    const a = scores(600, [100, 300, 450]);
    const b = scores(600, []);
    const { moments } = chooseMoments(a, b, { offsetSeconds: 0 });
    expect(moments).toHaveLength(3);
    for (const [i, start] of [100, 300, 450].entries()) {
      expect(moments[i]!.startSeconds).toBeLessThanOrEqual(start);
      expect(moments[i]!.endSeconds).toBeGreaterThanOrEqual(start + 2);
      expect(moments[i]!.camera).toBe("A");
    }
    expect(totalSeconds(moments)).toBeLessThan(60);
  });

  it("joins bursts that are close together and keeps game order", () => {
    const a = scores(300, [50, 55, 200]);
    const { moments } = chooseMoments(a, scores(300, []), {});
    expect(moments).toHaveLength(2);
    expect(moments[0]!.startSeconds).toBeLessThan(moments[1]!.startSeconds);
  });

  it("picks the camera where the action is bigger, and cuts at that camera's own time", () => {
    // B started 10 s after A. A burst at game time 100: B sees it much stronger.
    const a = scores(300, [100], 3.5);
    const b = scores(290, [90], 12); // B's own clock: 100 - 10 = 90
    const { moments } = chooseMoments(a, b, { offsetSeconds: 10 });
    expect(moments).toHaveLength(1);
    expect(moments[0]!.camera).toBe("B");
    expect(moments[0]!.clipStartSeconds).toBeCloseTo(moments[0]!.startSeconds - 10, 5);
  });

  it("uses the only camera that has footage", () => {
    // B ends at 100 s of its own clock (game 110 s); a burst at game 150 is only on A.
    const a = scores(300, [150], 4);
    const b = scores(100, [], 0);
    const { moments } = chooseMoments(a, b, { offsetSeconds: 10 });
    expect(moments[0]!.camera).toBe("A");
  });

  it("raises the bar until no more than the allowed share is kept", () => {
    const bursts = Array.from({ length: 40 }, (_, i) => 20 + i * 14);
    const a: CameraScores = scores(700, bursts, 4);
    // Make later bursts stronger so the strongest are what survive.
    const loud = a.scores.map((v, i) => (v > 0 ? 4 + (i % 20) * 0.5 : 0));
    const { moments, threshold } = chooseMoments(
      { ...a, scores: loud },
      scores(700, [], 0),
      {
        maxShare: 0.2,
      },
    );
    expect(totalSeconds(moments)).toBeLessThanOrEqual(0.2 * 700 + 1);
    expect(threshold).toBeGreaterThan(3);
    expect(moments.length).toBeGreaterThan(0);
  });

  it("finds nothing in a game with nothing in it", () => {
    const { moments } = chooseMoments(scores(300, []), scores(300, []), {});
    expect(moments).toEqual([]);
  });

  it("never runs past the end of the game or before its start", () => {
    const a = scores(60, [0, 58], 9);
    const { moments } = chooseMoments(a, scores(60, [], 0), {});
    for (const m of moments) {
      expect(m.startSeconds).toBeGreaterThanOrEqual(0);
      expect(m.endSeconds).toBeLessThanOrEqual(60);
    }
  });

  it("never comes back empty when there is action, even if all of it is more than the allowed share", () => {
    // 4 bursts in a 90 s game with padding is more than half the game.
    const a = scores(90, [15, 40, 52, 65], 20);
    const { moments } = chooseMoments(a, scores(90, [], 0), { maxShare: 0.3 });
    expect(moments.length).toBeGreaterThan(0);
    expect(totalSeconds(moments)).toBeLessThanOrEqual(0.3 * 90 + 0.001);
  });

  it("when it must drop some, keeps the strongest and keeps game order", () => {
    const s = new Array<number>(180).fill(0); // 90 s at 0.5 s steps
    for (const [t, v] of [
      [15, 9],
      [40, 30],
      [65, 20],
    ] as const) {
      for (let k = 0; k < 4; k += 1) s[t * 2 + k] = v;
    }
    const { moments } = chooseMoments(
      { scores: s, durationSeconds: 90 },
      { scores: new Array<number>(180).fill(0), durationSeconds: 90 },
      { maxShare: 0.3 },
    );
    expect(moments.map((m) => Math.round(m.startSeconds))).toEqual(
      expect.arrayContaining([34]),
    );
    expect(
      moments.every((m, i) => i === 0 || m.startSeconds > moments[i - 1]!.startSeconds),
    ).toBe(true);
    expect(moments.some((m) => m.peak === 9)).toBe(false);
  });
});

describe("broadcast: the whole game, following the play", () => {
  const step = 0.5;
  /** A camera's scores over `duration` seconds: busy (6) during the given windows, else quiet (0). */
  function busy(
    duration: number,
    windows: [number, number][],
    level = 6,
  ): CameraScores {
    const n = Math.round(duration / step);
    const s = new Array<number>(n).fill(0);
    for (const [from, to] of windows)
      for (let t = from; t < to; t += step) s[Math.round(t / step)] = level;
    return { scores: s, durationSeconds: duration };
  }

  it("shows each end while the play is there, and switches near the moment it moves", () => {
    const a = busy(120, [[0, 60]]);
    const b = busy(120, [[60, 120]]);
    const { moments } = chooseBroadcast(a, b, { offsetSeconds: 0 });
    expect(moments.map((m) => m.camera)).toEqual(["A", "B"]);
    expect(Math.abs(moments[0]!.endSeconds - 60)).toBeLessThanOrEqual(6);
    // One continuous game: the second piece starts where the first ends.
    expect(moments[1]!.startSeconds).toBeCloseTo(moments[0]!.endSeconds, 5);
    expect(moments[1]!.endSeconds).toBe(120);
  });

  it("does not flick between cameras when the lead keeps changing hands", () => {
    // Each camera is the busier one for 2 s at a time, by a wide margin, so
    // without a minimum hold the picture would change every 2 seconds.
    const n = 240;
    const sa = Array.from({ length: n }, (_, i) =>
      Math.floor(i / 4) % 2 === 0 ? 12 : 4,
    );
    const sb = Array.from({ length: n }, (_, i) =>
      Math.floor(i / 4) % 2 === 0 ? 4 : 12,
    );
    const { moments } = chooseBroadcast(
      { scores: sa, durationSeconds: 120 },
      { scores: sb, durationSeconds: 120 },
      { offsetSeconds: 0, smoothSeconds: 0.5, minHoldSeconds: 4 },
    );
    expect(moments.length).toBeGreaterThan(2); // it does follow the play...
    for (const m of moments.slice(0, -1)) {
      expect(m.endSeconds - m.startSeconds).toBeGreaterThanOrEqual(4); // ...but never faster than the hold
    }
  });

  it("stays on the last camera through a short quiet spell", () => {
    const a = busy(150, [
      [0, 20],
      [60, 150],
    ]);
    const b = busy(150, []);
    const { moments } = chooseBroadcast(a, b, { offsetSeconds: 0 });
    expect(moments).toHaveLength(1); // 20-60 is quiet but short: still on A, no gap
    expect(moments[0]!.startSeconds).toBe(0);
    expect(moments[0]!.endSeconds).toBe(150);
  });

  it("leaves out a long dead stretch, such as an intermission", () => {
    const a = busy(300, [
      [0, 30],
      [250, 300],
    ]);
    const { moments } = chooseBroadcast(a, busy(300, []), {
      offsetSeconds: 0,
      quietCutSeconds: 90,
    });
    expect(moments.length).toBeGreaterThanOrEqual(2);
    for (const m of moments) {
      // Nothing is kept from deep inside the quiet (40 s to 240 s).
      expect(
        m.startSeconds < 240 &&
          m.endSeconds > 40 &&
          m.startSeconds >= 40 &&
          m.endSeconds <= 240,
      ).toBe(false);
    }
    expect(totalSeconds(moments)).toBeLessThan(150);
  });

  it("uses only the camera that has footage, before the second one started", () => {
    // B started 10 s after A and busy from its own start; A is quiet then. Before 10 s only A can be shown.
    const a = busy(100, []);
    const b = busy(90, [[0, 90]]);
    const { moments } = chooseBroadcast(a, b, { offsetSeconds: 10, quietLevel: 0 });
    expect(moments[0]!.camera).toBe("A");
    expect(moments[0]!.endSeconds).toBeLessThanOrEqual(14.5);
    expect(moments.some((m) => m.camera === "B")).toBe(true);
    // B's pieces are cut on B's own clock.
    const bPiece = moments.find((m) => m.camera === "B")!;
    expect(bPiece.clipStartSeconds).toBeCloseTo(bPiece.startSeconds - 10, 5);
  });

  it("covers the whole recording when there is action throughout and keeps game order", () => {
    const a = busy(100, [
      [0, 40],
      [70, 100],
    ]);
    const b = busy(100, [[35, 75]]);
    const { moments } = chooseBroadcast(a, b, { offsetSeconds: 0 });
    expect(moments[0]!.startSeconds).toBe(0);
    expect(moments[moments.length - 1]!.endSeconds).toBe(100);
    for (let i = 1; i < moments.length; i += 1) {
      expect(moments[i]!.startSeconds).toBeCloseTo(moments[i - 1]!.endSeconds, 5);
    }
  });
});
