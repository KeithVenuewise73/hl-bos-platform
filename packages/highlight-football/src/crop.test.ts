import { describe, expect, it } from "vitest";
import { ASPECT_VALUES, containsBox, cropWindowSize, planCropPath } from "./crop";
import type { CropInput } from "./crop";
import type { AspectRatio, BoundingBox } from "./types";

const SOURCE = 16 / 9;

function run(inputs: readonly CropInput[], target: AspectRatio = "9:16") {
  return planCropPath(inputs, { target, sourceAspect: SOURCE });
}

/** A receiver running left to right across the frame. */
function route(
  frames: number,
  opts: { ball?: (t: number) => BoundingBox | null; gap?: [number, number] } = {},
): CropInput[] {
  const out: CropInput[] = [];
  for (let f = 0; f < frames; f++) {
    const t = f / Math.max(1, frames - 1);
    const hidden = opts.gap !== undefined && f >= opts.gap[0] && f <= opts.gap[1];
    out.push({
      frame: f,
      player: hidden ? null : { x: 0.08 + 0.8 * t, y: 0.45, w: 0.05, h: 0.13 },
      ball: opts.ball?.(t) ?? null,
    });
  }
  return out;
}

describe("cropWindowSize", () => {
  it("produces a full-height, narrow window for 9:16 from a 16:9 source", () => {
    const size = cropWindowSize("9:16", SOURCE);
    expect(size.h).toBe(1);
    expect(size.w).toBeCloseTo(9 / 16 / (16 / 9), 6);
  });

  it("produces a full-width window for a target wider than the source", () => {
    const size = cropWindowSize("16:9", 1);
    expect(size.w).toBe(1);
    expect(size.h).toBeCloseTo(1 / ASPECT_VALUES["16:9"], 6);
  });

  it("handles square and 4:5 without exceeding the frame", () => {
    for (const target of ["1:1", "4:5", "9:16", "16:9"] as AspectRatio[]) {
      const size = cropWindowSize(target, SOURCE);
      expect(size.w).toBeLessThanOrEqual(1 + 1e-9);
      expect(size.h).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe("planCropPath — the guarantee", () => {
  it("keeps the athlete fully inside the crop in every frame", () => {
    const inputs = route(120);
    const path = run(inputs);
    expect(path).toHaveLength(inputs.length);
    for (let i = 0; i < inputs.length; i++) {
      const player = inputs[i]?.player;
      const window = path[i]?.window;
      if (player === null || player === undefined || window === undefined) continue;
      expect(containsBox(window, player)).toBe(true);
    }
  });

  it("never lets the crop window leave the source frame", () => {
    for (const w of run(route(120))) {
      expect(w.window.x).toBeGreaterThanOrEqual(-1e-9);
      expect(w.window.y).toBeGreaterThanOrEqual(-1e-9);
      expect(w.window.x + w.window.w).toBeLessThanOrEqual(1 + 1e-9);
      expect(w.window.y + w.window.h).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it("opens on the subject rather than drifting in from the centre", () => {
    const inputs = route(120);
    const first = run(inputs)[0];
    const player = inputs[0]?.player;
    expect(player).toBeDefined();
    if (first !== undefined && player != null)
      expect(containsBox(first.window, player)).toBe(true);
  });

  it("moves smoothly — no frame jumps more than the pan clamp", () => {
    const path = run(route(120));
    for (let i = 1; i < path.length; i++) {
      const prev = path[i - 1]?.window;
      const cur = path[i]?.window;
      if (prev === undefined || cur === undefined) continue;
      expect(Math.abs(cur.x - prev.x)).toBeLessThanOrEqual(0.0121);
      expect(Math.abs(cur.y - prev.y)).toBeLessThanOrEqual(0.0121);
    }
  });
});

describe("planCropPath — the mistake it avoids", () => {
  it("biases toward the football rather than pinning the athlete dead centre", () => {
    // The ball is consistently to the athlete's right. A naive crop centres on
    // him and loses it; this one should lean that way.
    const withBall = route(120, {
      ball: (t) => ({ x: 0.16 + 0.8 * t, y: 0.45, w: 0.012, h: 0.012 }),
    });
    const withoutBall = route(120);

    const withPath = run(withBall, "9:16");
    const withoutPath = run(withoutBall, "9:16");

    // Measured mid-route. At the very end of the run both windows are pinned
    // against the right edge of the frame, where no bias is observable.
    const mid = Math.floor(withBall.length / 2);
    const withCenter =
      (withPath[mid]?.window.x ?? 0) + (withPath[mid]?.window.w ?? 0) / 2;
    const withoutCenter =
      (withoutPath[mid]?.window.x ?? 0) + (withoutPath[mid]?.window.w ?? 0) / 2;
    expect(withCenter).toBeGreaterThan(withoutCenter);
  });

  it("does not chase a football on the far side of the field", () => {
    const farBall = route(120, {
      ball: () => ({ x: 0.97, y: 0.9, w: 0.012, h: 0.012 }),
    });
    const path = run(farBall, "9:16");
    for (let i = 0; i < farBall.length; i++) {
      const player = farBall[i]?.player;
      const window = path[i]?.window;
      if (player == null || window === undefined) continue;
      expect(containsBox(window, player)).toBe(true);
    }
  });

  it("carries through a pan during an occlusion instead of stopping dead", () => {
    const occluded = route(120, { gap: [40, 60] });
    const path = run(occluded);
    const before = path[39]?.window.x ?? 0;
    const during = path[50]?.window.x ?? 0;
    expect(during).toBeGreaterThan(before);
  });

  it("returns nothing for no input", () => {
    expect(run([])).toEqual([]);
  });

  it("centres on the frame when the athlete was never detected at all", () => {
    const blind: CropInput[] = Array.from({ length: 10 }, (_, f) => ({
      frame: f,
      player: null,
      ball: null,
    }));
    const path = run(blind);
    const first = path[0]?.window;
    expect((first?.x ?? 0) + (first?.w ?? 0) / 2).toBeCloseTo(0.5, 6);
  });
});
