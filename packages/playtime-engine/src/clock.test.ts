import { beforeEach, describe, expect, it } from "vitest";
import { buildTimeline, materialize, overlapMs, spanTotal } from "./clock";
import {
  end,
  endPeriod,
  log,
  now,
  pause,
  resetSeq,
  resume,
  start,
  startPeriod,
} from "./test-support";

beforeEach(resetSeq);

describe("buildTimeline", () => {
  it("reports a game that has never started as scheduled, with no clock", () => {
    const t = buildTimeline([]);
    expect(t.phase).toBe("scheduled");
    expect(t.currentPeriod).toBe(0);
    expect(spanTotal(materialize(t.running, now(600)))).toBe(0);
  });

  it("starts period 1 when the game starts", () => {
    const t = buildTimeline(log("g", [start(0)]));
    expect(t.phase).toBe("running");
    expect(t.currentPeriod).toBe(1);
  });

  it("excludes paused time from the clock", () => {
    // Runs 0-100, paused 100-400, runs 400-500. 200s of clock, 500s of wall time.
    const t = buildTimeline(log("g", [start(0), pause(100), resume(400)]));
    expect(spanTotal(materialize(t.running, now(500)))).toBe(200_000);
  });

  it("excludes the break between periods", () => {
    const t = buildTimeline(
      log("g", [start(0), endPeriod(720, 1), startPeriod(1500, 2)]),
    );
    expect(t.currentPeriod).toBe(2);
    // 720s of quarter 1 + 300s into quarter 2 = 1020s, though 1800s have passed.
    expect(spanTotal(materialize(t.running, now(1800)))).toBe(1_020_000);
  });

  it("keeps the clock running across a twelve-minute gap with no events at all", () => {
    // This is the backgrounded-app case: the phone slept, no code ran, no tick
    // fired. The clock is derived, so the time is simply there on return.
    const t = buildTimeline(log("g", [start(0)]));
    expect(spanTotal(materialize(t.running, now(720)))).toBe(720_000);
  });

  it("stops the clock at the final whistle and ignores anything after it", () => {
    const events = log("g", [start(0), end(600)]);
    const stray = log("g", [pause(700), resume(800)]);
    const t = buildTimeline([...events, ...stray]);
    expect(t.phase).toBe("final");
    expect(spanTotal(materialize(t.running, now(9_999)))).toBe(600_000);
  });

  it("ignores a resume that was never preceded by a pause", () => {
    const t = buildTimeline(log("g", [start(0), resume(50)]));
    expect(spanTotal(materialize(t.running, now(100)))).toBe(100_000);
  });

  it("ignores a duplicate pause", () => {
    const t = buildTimeline(log("g", [start(0), pause(100), pause(150), resume(200)]));
    expect(spanTotal(materialize(t.running, now(300)))).toBe(200_000);
  });

  it("replays a log that arrived out of order into the same clock", () => {
    // Sync delivers whatever order it delivers. Replay order comes from the
    // timestamps on the records, not from the order they reached this device.
    const ordered = log("g", [start(0), pause(100), resume(400)]);
    const shuffled = [ordered[2]!, ordered[0]!, ordered[1]!];
    expect(spanTotal(materialize(buildTimeline(shuffled).running, now(500)))).toBe(
      spanTotal(materialize(buildTimeline(ordered).running, now(500))),
    );
  });

  it("never reports negative elapsed time when asked about an instant before the game", () => {
    // resolveAsOf normally prevents this; materialize clamps anyway, because a
    // negative duration would silently subtract minutes an athlete played.
    const t = buildTimeline(log("g", [start(1000)]));
    expect(spanTotal(materialize(t.running, now(0)))).toBe(0);
  });
});

describe("overlapMs", () => {
  const runs = [
    { start: 0, end: 100, period: 1 },
    { start: 300, end: 400, period: 2 },
  ];

  it("counts only the parts that fall inside a running clock", () => {
    expect(overlapMs({ start: 50, end: 350, period: 0 }, runs)).toBe(100);
  });

  it("is zero for a window entirely inside a stoppage", () => {
    expect(overlapMs({ start: 150, end: 250, period: 0 }, runs)).toBe(0);
  });

  it("is zero for a zero-length window", () => {
    expect(overlapMs({ start: 50, end: 50, period: 0 }, runs)).toBe(0);
  });
});
