import { describe, expect, it } from "vitest";
import { mad, median, segmentPlays, smooth } from "./segmentation";
import type { FrameSignal } from "./segmentation";
import { segmentationAccuracy } from "./metrics";

const FPS = 30;

/** Build a signal timeline: quiet, then a burst with a sharp onset, repeated. */
function buildTimeline(
  plays: ReadonlyArray<{
    deadSeconds: number;
    liveSeconds: number;
    pan?: boolean;
    deadPan?: boolean;
  }>,
): {
  signals: FrameSignal[];
  truth: Array<{ startSeconds: number; endSeconds: number; snapSeconds: number }>;
} {
  const signals: FrameSignal[] = [];
  const truth: Array<{
    startSeconds: number;
    endSeconds: number;
    snapSeconds: number;
  }> = [];
  let frame = 0;
  // Deterministic wobble so the input is not implausibly clean.
  const wobble = (i: number): number => ((i * 37) % 11) * 0.0004;

  for (const p of plays) {
    const dead = Math.round(p.deadSeconds * FPS);
    for (let i = 0; i < dead; i++) {
      const cameraMotion = p.deadPan === true ? 0.1 : 0;
      signals.push({
        frame,
        motion: 0.012 + wobble(i) + cameraMotion,
        cameraMotion,
        dispersion: 0.18,
        playerCount: 22,
        audio: 0.1,
      });
      frame += 1;
    }
    const snapFrame = frame;
    const live = Math.round(p.liveSeconds * FPS);
    for (let i = 0; i < live; i++) {
      const t = i / live;
      const cameraMotion = p.pan === true ? 0.07 : 0;
      const envelope = t < 0.08 ? t / 0.08 : Math.exp(-2.1 * (t - 0.08));
      signals.push({
        frame,
        motion: 0.012 + 0.26 * envelope + wobble(i) + cameraMotion,
        cameraMotion,
        dispersion: 0.18 + 0.3 * Math.min(1, t * 3),
        playerCount: 22,
        audio: i < 4 ? 0.65 : 0.16,
      });
      frame += 1;
    }
    truth.push({
      startSeconds: (snapFrame - FPS) / FPS,
      endSeconds: (snapFrame + live) / FPS,
      snapSeconds: snapFrame / FPS,
    });
  }
  for (let i = 0; i < 2 * FPS; i++) {
    signals.push({
      frame,
      motion: 0.012 + wobble(i),
      cameraMotion: 0,
      dispersion: 0.18,
      playerCount: 22,
      audio: 0.1,
    });
    frame += 1;
  }
  return { signals, truth };
}

describe("statistics helpers", () => {
  it("computes a median for odd and even lengths", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  it("computes MAD, which the plays cannot inflate", () => {
    // One huge outlier moves the mean enormously and the MAD not at all.
    expect(mad([1, 1, 1, 1, 100])).toBe(0);
    expect(mad([])).toBe(0);
  });

  it("smooths without inventing a quiet period at the edges", () => {
    const s = smooth([1, 1, 1, 1, 1], 3);
    expect(s.every((v) => Math.abs(v - 1) < 1e-9)).toBe(true);
  });
});

describe("segmentPlays", () => {
  it("finds every play in a clean five-play game", () => {
    const { signals, truth } = buildTimeline([
      { deadSeconds: 5, liveSeconds: 6 },
      { deadSeconds: 4, liveSeconds: 5 },
      { deadSeconds: 6, liveSeconds: 7 },
      { deadSeconds: 4, liveSeconds: 5.5 },
      { deadSeconds: 5, liveSeconds: 6 },
    ]);
    const result = segmentPlays(signals, { frameRate: FPS });
    expect(result.plays).toHaveLength(5);

    const accuracy = segmentationAccuracy(
      result.plays.map((p) => ({
        startSeconds: p.startAt.seconds,
        endSeconds: p.endAt.seconds,
        snapSeconds: p.snapAt?.seconds ?? null,
      })),
      truth,
    );
    expect(accuracy.matched).toBe(5);
    expect(accuracy.missed).toBe(0);
    expect(accuracy.spurious).toBe(0);
    // Half a second is well inside the 5s of pre-snap padding a clip gets.
    expect(accuracy.meanSnapErrorSeconds ?? 99).toBeLessThan(0.5);
  });

  it("does NOT turn a dead-time camera pan into a play", () => {
    // The pan produces more raw motion than the quiet around it. Subtracting
    // the camera's own motion is the only thing that saves this.
    const { signals } = buildTimeline([
      { deadSeconds: 5, liveSeconds: 6 },
      { deadSeconds: 6, liveSeconds: 6, deadPan: true },
      { deadSeconds: 5, liveSeconds: 6 },
    ]);
    const result = segmentPlays(signals, { frameRate: FPS });
    expect(result.plays).toHaveLength(3);
  });

  it("still finds plays filmed by an operator panning hard", () => {
    const { signals } = buildTimeline([
      { deadSeconds: 5, liveSeconds: 6, pan: true },
      { deadSeconds: 4, liveSeconds: 6, pan: true },
    ]);
    expect(segmentPlays(signals, { frameRate: FPS }).plays).toHaveLength(2);
  });

  it("places the snap at the motion onset, not at the collision", () => {
    const { signals, truth } = buildTimeline([{ deadSeconds: 5, liveSeconds: 6 }]);
    const play = segmentPlays(signals, { frameRate: FPS }).plays[0];
    expect(play).toBeDefined();
    const snap = play?.snapAt?.seconds ?? -1;
    const truthSnap = truth[0]?.snapSeconds ?? -1;
    expect(Math.abs(snap - truthSnap)).toBeLessThan(0.5);
    // The peak of the collision is ~0.5s in; the snap must come before it.
    expect(snap).toBeLessThan(truthSnap + 0.5);
  });

  it("corroborates a snap with audio and reports higher confidence", () => {
    const { signals } = buildTimeline([{ deadSeconds: 5, liveSeconds: 6 }]);
    const withAudio = segmentPlays(signals, { frameRate: FPS }).plays[0];
    const silent = segmentPlays(
      // Same signal with the audio channel removed, as a file with no usable
      // audio track would arrive.
      signals.map((s) => ({
        frame: s.frame,
        motion: s.motion,
        cameraMotion: s.cameraMotion ?? 0,
      })),
      { frameRate: FPS },
    ).plays[0];
    expect(withAudio?.snapConfidence ?? 0).toBeGreaterThan(silent?.snapConfidence ?? 1);
  });

  it("ignores a burst too short to be football", () => {
    const signals: FrameSignal[] = [];
    for (let f = 0; f < 300; f++) {
      const spike = f >= 150 && f < 160; // a third of a second
      signals.push({ frame: f, motion: spike ? 0.3 : 0.012, cameraMotion: 0 });
    }
    expect(segmentPlays(signals, { frameRate: FPS }).plays).toHaveLength(0);
  });

  it("caps a run-on burst rather than reporting a ninety-second play", () => {
    // A tracking shot that follows a return, the celebration and the walk back
    // without the motion ever dropping. Real, and the reason the cap exists.
    const signals: FrameSignal[] = [];
    let f = 0;
    const push = (count: number, motion: number): void => {
      for (let i = 0; i < count; i++) {
        signals.push({ frame: f, motion, cameraMotion: 0 });
        f += 1;
      }
    };
    push(40 * FPS, 0.012);
    push(90 * FPS, 0.3); // the run-on
    push(40 * FPS, 0.012);
    push(6 * FPS, 0.3); // an ordinary play, so dead time still dominates
    push(40 * FPS, 0.012);

    const plays = segmentPlays(signals, { frameRate: FPS }).plays;
    expect(plays.length).toBeGreaterThan(1);
    for (const p of plays) {
      expect(p.endAt.seconds - p.startAt.seconds).toBeLessThanOrEqual(22.1);
    }
  });

  it("finds nothing when the footage is almost entirely motion, and says so by returning nothing", () => {
    // An honest limitation, asserted rather than hidden: thresholds are derived
    // from the video's own median, so a file that is 95% motion has no quiet to
    // measure against. That is a camera pointed at traffic, not a game — and
    // returning zero plays is the correct answer, not a bug to paper over.
    const signals: FrameSignal[] = [];
    for (let f = 0; f < 95 * FPS; f++) {
      signals.push({ frame: f, motion: f < 5 * FPS ? 0.012 : 0.3, cameraMotion: 0 });
    }
    expect(segmentPlays(signals, { frameRate: FPS }).plays).toHaveLength(0);
  });

  it("reports the thresholds it used, so a bad segmentation can be diagnosed", () => {
    const { signals } = buildTimeline([{ deadSeconds: 5, liveSeconds: 6 }]);
    const { thresholds } = segmentPlays(signals, { frameRate: FPS });
    expect(thresholds.enter).toBeGreaterThan(thresholds.exit);
    expect(thresholds.exit).toBeGreaterThan(thresholds.baseline);
  });

  it("returns nothing for empty input or a nonsense frame rate", () => {
    expect(segmentPlays([], { frameRate: FPS }).plays).toHaveLength(0);
    expect(
      segmentPlays([{ frame: 0, motion: 1 }], { frameRate: 0 }).plays,
    ).toHaveLength(0);
  });

  it("scores a clean play more confidently than one buried in noise", () => {
    const { signals: clean } = buildTimeline([{ deadSeconds: 5, liveSeconds: 6 }]);
    const noisy = clean.map((s, i) => ({
      ...s,
      motion: s.motion + ((i * 53) % 17) * 0.006,
    }));
    const cleanPlay = segmentPlays(clean, { frameRate: FPS }).plays[0];
    const noisyPlay = segmentPlays(noisy, { frameRate: FPS }).plays[0];
    expect(cleanPlay?.segmentationConfidence ?? 0).toBeGreaterThan(
      noisyPlay?.segmentationConfidence ?? 1,
    );
  });

  it("leaves scoreboard-derived fields null rather than guessing them", () => {
    const { signals } = buildTimeline([{ deadSeconds: 5, liveSeconds: 6 }]);
    const play = segmentPlays(signals, { frameRate: FPS }).plays[0];
    expect(play?.quarter).toBeNull();
    expect(play?.down).toBeNull();
    expect(play?.distance).toBeNull();
    expect(play?.offenseTeamId).toBeNull();
  });
});
