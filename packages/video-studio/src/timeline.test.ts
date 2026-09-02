import { describe, expect, it } from "vitest";

import { detectPanels } from "./panels";
import { buildStoryboard } from "./storyboard";
import { makeGridImage } from "./test-images";
import {
  clipToSource,
  composeFrame,
  frameCount,
  shotTimings,
  targetFor,
  timeForFrame,
  totalDurationMs,
} from "./timeline";
import type { Shot, Storyboard } from "./types";

const shot = (id: string, durationMs: number, transitionInMs: number): Shot => ({
  id,
  label: id,
  from: { x: 0, y: 0, width: 100, height: 56.25 },
  to: { x: 10, y: 0, width: 100, height: 56.25 },
  durationMs,
  easing: "linear",
  transitionInMs,
  caption: "",
});

const board = (shots: Shot[]): Storyboard => ({
  width: 1920,
  height: 1080,
  sourceWidth: 200,
  sourceHeight: 200,
  fps: 30,
  background: "#000",
  fit: "fill",
  shots,
});

describe("shotTimings", () => {
  it("overlaps each shot with the one before it by the transition", () => {
    const timings = shotTimings(board([shot("a", 1000, 0), shot("b", 1000, 200)]));
    expect(timings[0]).toMatchObject({ startMs: 0, endMs: 1000 });
    expect(timings[1]).toMatchObject({ startMs: 800, endMs: 1800 });
  });

  it("clamps a transition longer than the shots it joins", () => {
    const timings = shotTimings(board([shot("a", 300, 0), shot("b", 400, 5000)]));
    expect(timings[1]?.transitionInMs).toBe(300);
    expect(timings[1]?.startMs).toBe(0);
    expect(totalDurationMs(board([shot("a", 300, 0), shot("b", 400, 5000)]))).toBe(400);
  });

  it("ignores a transition on the very first shot", () => {
    expect(shotTimings(board([shot("a", 1000, 500)]))[0]?.transitionInMs).toBe(0);
  });
});

describe("totalDurationMs and frameCount", () => {
  it("is the sum of the durations minus the overlaps", () => {
    const storyboard = board([
      shot("a", 1000, 0),
      shot("b", 1000, 200),
      shot("c", 1000, 200),
    ]);
    expect(totalDurationMs(storyboard)).toBe(2600);
    expect(frameCount(storyboard)).toBe(78);
  });

  it("is zero for an empty storyboard, and still asks for one frame", () => {
    expect(totalDurationMs(board([]))).toBe(0);
    expect(frameCount(board([]))).toBe(1);
  });

  it("maps frame index to time", () => {
    expect(timeForFrame(0, 30)).toBe(0);
    expect(timeForFrame(30, 30)).toBe(1000);
  });
});

describe("composeFrame", () => {
  const storyboard = board([shot("a", 1000, 0), shot("b", 1000, 200)]);

  it("shows one shot outside a transition", () => {
    const frame = composeFrame(storyboard, 400);
    expect(frame.layers).toHaveLength(1);
    expect(frame.layers[0]?.shotId).toBe("a");
    expect(frame.layers[0]?.opacity).toBe(1);
  });

  it("crossfades two shots, outgoing first, incoming half-faded at the midpoint", () => {
    const frame = composeFrame(storyboard, 900); // b starts at 800, 200ms fade
    expect(frame.layers.map((l) => l.shotId)).toEqual(["a", "b"]);
    expect(frame.layers[0]?.opacity).toBe(1);
    expect(frame.layers[1]?.opacity).toBeCloseTo(0.5);
  });

  it("holds the final frame rather than going blank at the end", () => {
    const frame = composeFrame(storyboard, totalDurationMs(storyboard));
    expect(frame.layers).toHaveLength(1);
    expect(frame.layers[0]?.shotId).toBe("b");
  });

  it("clamps a time before the start or past the end", () => {
    expect(composeFrame(storyboard, -500).timeMs).toBe(0);
    expect(composeFrame(storyboard, 99999).timeMs).toBe(totalDurationMs(storyboard));
    expect(composeFrame(storyboard, 99999).layers).toHaveLength(1);
  });

  it("advances the camera across the shot", () => {
    const early = composeFrame(storyboard, 0).layers[0];
    const late = composeFrame(storyboard, 999).layers[0];
    expect(late?.source.x).toBeGreaterThan(early?.source.x ?? 0);
  });

  it("produces a frame at every sampled time of a real storyboard", () => {
    const detection = detectPanels(
      makeGridImage({
        columns: 3,
        rows: 2,
        panelWidth: 160,
        panelHeight: 120,
        gutter: 10,
        seed: 42,
      }),
    );
    const real = buildStoryboard(detection);
    const total = totalDurationMs(real);
    expect(total).toBeGreaterThan(0);
    for (let i = 0; i <= 100; i += 1) {
      const frame = composeFrame(real, (total * i) / 100);
      expect(frame.layers.length, `no layers at ${frame.timeMs}ms`).toBeGreaterThan(0);
      for (const layer of frame.layers) {
        expect(layer.source.width).toBeGreaterThan(0);
        expect(layer.source.height).toBeGreaterThan(0);
        expect(layer.source.x).toBeGreaterThanOrEqual(0);
        expect(layer.source.y).toBeGreaterThanOrEqual(0);
        expect(layer.source.x + layer.source.width).toBeLessThanOrEqual(
          real.sourceWidth + 1e-6,
        );
        expect(layer.source.y + layer.source.height).toBeLessThanOrEqual(
          real.sourceHeight + 1e-6,
        );
      }
    }
  });
});

describe("clipToSource", () => {
  it("passes a fully-inside rectangle through untouched", () => {
    const target = { x: 0, y: 0, width: 1920, height: 1080 };
    const source = { x: 10, y: 10, width: 100, height: 100 };
    expect(clipToSource(source, target, 200, 200)).toEqual({ source, target });
  });

  it("trims the overhang and shrinks the target by the same proportion", () => {
    // Half the source rectangle hangs off the left edge.
    const result = clipToSource(
      { x: -50, y: 0, width: 100, height: 100 },
      { x: 0, y: 0, width: 1000, height: 1000 },
      200,
      200,
    );
    expect(result?.source).toEqual({ x: 0, y: 0, width: 50, height: 100 });
    expect(result?.target).toEqual({ x: 500, y: 0, width: 500, height: 1000 });
  });

  it("returns nothing when the rectangle misses the image entirely", () => {
    expect(
      clipToSource(
        { x: 500, y: 0, width: 100, height: 100 },
        { x: 0, y: 0, width: 10, height: 10 },
        200,
        200,
      ),
    ).toBeNull();
  });
});

describe("targetFor", () => {
  const base = board([shot("a", 1000, 0)]);

  it("uses the whole frame in fill mode", () => {
    expect(
      targetFor({ ...base, fit: "fill" }, { x: 0, y: 0, width: 100, height: 100 }),
    ).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
  });

  it("pillarboxes a square source in a 16:9 frame in contain mode", () => {
    const target = targetFor(
      { ...base, fit: "contain" },
      { x: 0, y: 0, width: 100, height: 100 },
    );
    expect(target.width).toBeCloseTo(1080);
    expect(target.height).toBeCloseTo(1080);
    expect(target.x).toBeCloseTo((1920 - 1080) / 2);
    expect(target.y).toBeCloseTo(0);
  });

  it("letterboxes a wide source in a square frame in contain mode", () => {
    const square = { ...base, width: 1000, height: 1000, fit: "contain" as const };
    const target = targetFor(square, { x: 0, y: 0, width: 200, height: 100 });
    expect(target.width).toBeCloseTo(1000);
    expect(target.height).toBeCloseTo(500);
    expect(target.y).toBeCloseTo(250);
  });

  it("never lets a contained frame spill outside the output", () => {
    const contained = { ...base, fit: "contain" as const };
    for (const source of [
      { x: 0, y: 0, width: 500, height: 492 },
      { x: 0, y: 0, width: 1536, height: 1024 },
      { x: 0, y: 0, width: 100, height: 900 },
    ]) {
      const target = targetFor(contained, source);
      expect(target.x).toBeGreaterThanOrEqual(-1e-6);
      expect(target.y).toBeGreaterThanOrEqual(-1e-6);
      expect(target.x + target.width).toBeLessThanOrEqual(contained.width + 1e-6);
      expect(target.y + target.height).toBeLessThanOrEqual(contained.height + 1e-6);
    }
  });
});

describe("composeFrame honours the framing mode", () => {
  // This is the regression guard for a real bug: composeFrame once always used
  // the whole output frame as its target, which STRETCHED a 3:2 comic page to
  // fit a near-square video instead of padding it. It looked plausible in a
  // thumbnail and was wrong in every frame.
  const wide = { x: 0, y: 0, width: 300, height: 100 };
  const wideShot = { ...shot("wide", 1000, 0), from: wide, to: wide };

  it("fills the whole frame in fill mode", () => {
    const frame = composeFrame(
      { ...board([wideShot]), sourceWidth: 300, sourceHeight: 100 },
      0,
    );
    expect(frame.layers[0]?.target).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });

  it("letterboxes rather than stretches in contain mode", () => {
    const frame = composeFrame(
      { ...board([wideShot]), sourceWidth: 300, sourceHeight: 100, fit: "contain" },
      0,
    );
    const target = frame.layers[0]?.target;
    // 3:1 artwork in a 16:9 frame: full width, one third the height, centred.
    expect(target?.width).toBeCloseTo(1920);
    expect(target?.height).toBeCloseTo(640);
    expect(target?.y).toBeCloseTo(220);
    // The drawn aspect ratio must equal the SOURCE aspect ratio, or it is stretched.
    expect((target?.width ?? 0) / (target?.height ?? 1)).toBeCloseTo(300 / 100);
  });

  it("never stretches: drawn aspect always matches source aspect in contain mode", () => {
    const detection = detectPanels(
      makeGridImage({
        columns: 3,
        rows: 2,
        panelWidth: 160,
        panelHeight: 120,
        gutter: 10,
        seed: 42,
      }),
    );
    const real = buildStoryboard(detection, {
      width: 1440,
      height: 1416,
      fit: "contain",
    });
    const total = totalDurationMs(real);
    for (let i = 0; i <= 60; i += 1) {
      for (const layer of composeFrame(real, (total * i) / 60).layers) {
        expect(
          layer.target.width / layer.target.height,
          `stretched at ${(total * i) / 60}ms`,
        ).toBeCloseTo(layer.source.width / layer.source.height, 3);
      }
    }
  });
});
