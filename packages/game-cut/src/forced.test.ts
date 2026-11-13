import { describe, expect, it } from "vitest";

import { applyForced, toGameSeconds } from "./forced.ts";
import type { Moment } from "./moments.ts";

const m = (
  start: number,
  end: number,
  camera: "A" | "B" = "A",
  clipStart = start,
  label?: string,
): Moment => ({
  startSeconds: start,
  endSeconds: end,
  camera,
  clipStartSeconds: clipStart,
  peak: 5,
  scoreA: 1,
  scoreB: 1,
  ...(label === undefined ? {} : { label }),
});

describe("which clock a time was read from", () => {
  const pieces = [m(0, 60), m(100, 160, "B", 217.4), m(300, 330)]; // 60 + 60 + 30 = 150 s of video
  const ctx = { offsetSeconds: -117.4, moments: pieces };

  it("the first video's clock is already game time", () => {
    expect(toGameSeconds(3205, "first", ctx)).toBe(3205);
  });

  it("the second video's clock is shifted by the offset: it started 117.4 s before the first", () => {
    expect(toGameSeconds(3205, "second", ctx)).toBeCloseTo(3087.6, 5);
  });

  it("the finished video's clock walks the pieces, skipping what was cut out", () => {
    expect(toGameSeconds(10, "finished", ctx)).toBe(10); // inside piece 1
    expect(toGameSeconds(60, "finished", ctx)).toBe(100); // the first instant of piece 2
    expect(toGameSeconds(90, "finished", ctx)).toBe(130); // 30 s into piece 2
    expect(toGameSeconds(125, "finished", ctx)).toBe(305); // 5 s into piece 3
  });

  it("is null past the end of the finished video, and for rubbish", () => {
    expect(toGameSeconds(150, "finished", ctx)).toBeNull();
    expect(toGameSeconds(-1, "first", ctx)).toBeNull();
    expect(toGameSeconds(Number.NaN, "second", ctx)).toBeNull();
  });
});

describe("slotting moments into a plan", () => {
  it("puts a moment in the middle of a piece, trimming the piece around it and keeping each in the right place in its file", () => {
    const out = applyForced([m(0, 100, "A", 0)], [m(40, 50, "B", 157.4, "big hit")]);
    expect(
      out.map((x) => [x.startSeconds, x.endSeconds, x.camera, x.clipStartSeconds]),
    ).toEqual([
      [0, 40, "A", 0],
      [40, 50, "B", 157.4],
      [50, 100, "A", 50], // the rest of the piece still starts 50 s into ITS file
    ]);
    expect(out[1]!.label).toBe("big hit");
  });

  it("puts a moment into time the plan had cut out", () => {
    const out = applyForced([m(0, 60), m(200, 260)], [m(100, 110, "B", 217.4, "hit")]);
    expect(out.map((x) => [x.startSeconds, x.endSeconds])).toEqual([
      [0, 60],
      [100, 110],
      [200, 260],
    ]);
  });

  it("covers the edge of a piece it overlaps, and the whole of one it swallows", () => {
    const out = applyForced(
      [m(0, 50), m(50, 60, "B", 167.4), m(60, 120)],
      [m(45, 70, "A", 45, "play")],
    );
    expect(out.map((x) => [x.startSeconds, x.endSeconds, x.camera])).toEqual([
      [0, 45, "A"],
      [45, 70, "A"],
      [70, 120, "A"],
    ]);
  });

  it("drops slivers under a second that would be left beside a moment", () => {
    const out = applyForced([m(0, 100)], [m(0.4, 99.2, "B", 117.8, "x")]);
    expect(out.map((x) => [x.startSeconds, x.endSeconds])).toEqual([[0.4, 99.2]]);
  });

  it("joins neighbours that are really one continuous stretch of one camera, but never swallows a named moment", () => {
    const joined = applyForced([m(0, 40, "A", 0), m(40, 80, "A", 40)], []);
    expect(joined).toHaveLength(1);
    expect(joined[0]).toMatchObject({ startSeconds: 0, endSeconds: 80 });
    const named = applyForced([m(0, 100)], [m(40, 50, "A", 40, "goal")]);
    expect(named.map((x) => x.label)).toEqual([undefined, "goal", undefined]);
  });

  it("two moments side by side, from different cameras, both stay", () => {
    const out = applyForced(
      [m(0, 100)],
      [m(30, 40, "A", 30, "one"), m(40, 50, "B", 157.4, "two")],
    );
    expect(out.map((x) => [x.startSeconds, x.endSeconds, x.camera])).toEqual([
      [0, 30, "A"],
      [30, 40, "A"],
      [40, 50, "B"],
      [50, 100, "A"],
    ]);
  });

  it("leaves a plan untouched when nothing is forced, and keeps it in game order", () => {
    const plan = [m(0, 10), m(20, 30)];
    expect(applyForced(plan, [])).toEqual(plan);
    const out = applyForced([m(200, 260), m(0, 60)], [m(100, 110, "A", 100, "mid")]);
    expect(out.map((x) => x.startSeconds)).toEqual([0, 100, 200]);
  });

  it("never lengthens or shortens the rest of the plan: only the forced stretch changes", () => {
    const plan = [m(0, 600)];
    const out = applyForced(plan, [m(300, 312, "B", 417.4, "hit")]);
    const total = out.reduce((t, x) => t + (x.endSeconds - x.startSeconds), 0);
    expect(total).toBe(600);
  });
});
