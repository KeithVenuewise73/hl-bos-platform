import { describe, expect, it } from "vitest";

import { layoutSequence, sequenceDetection } from "./sequence";
import { buildStoryboard } from "./storyboard";
import { composeFrame, totalDurationMs } from "./timeline";
import type { Rect } from "./types";

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

const inside = (inner: Rect, outer: Rect): boolean =>
  inner.x >= outer.x - 1e-6 &&
  inner.y >= outer.y - 1e-6 &&
  inner.x + inner.width <= outer.x + outer.width + 1e-6 &&
  inner.y + inner.height <= outer.y + outer.height + 1e-6;

// Bar, elevator, hallway, door, bed: camera photos and a phone shot, mixed.
const scene = [
  { width: 4032, height: 3024 },
  { width: 3024, height: 4032 },
  { width: 1920, height: 1080 },
  { width: 800, height: 600 },
  { width: 4000, height: 2250 },
];

describe("layoutSequence", () => {
  it("scales big photos down to the long-edge limit and never scales small ones up", () => {
    const { placements } = layoutSequence(scene);
    expect(placements[0]).toMatchObject({ width: 1920, height: 1440 });
    expect(placements[1]).toMatchObject({ width: 1440, height: 1920 });
    expect(placements[3]).toMatchObject({ width: 800, height: 600 });
  });

  it("keeps every photo on the sheet and apart from every other photo", () => {
    const layout = layoutSequence(scene);
    const sheet = { x: 0, y: 0, width: layout.width, height: layout.height };
    layout.placements.forEach((a, i) => {
      expect(inside(a, sheet)).toBe(true);
      layout.placements.forEach((b, j) => {
        if (i !== j) expect(overlaps(a, b)).toBe(false);
      });
    });
  });

  it("refuses an empty list and more photos than one video takes", () => {
    expect(() => layoutSequence([])).toThrow();
    expect(() => layoutSequence(Array(13).fill({ width: 10, height: 10 }))).toThrow(
      /Up to 12/,
    );
  });
});

describe("sequenceDetection", () => {
  it("plays photos in the order given, ids following the photo", () => {
    const layout = layoutSequence(scene);
    const detection = sequenceDetection(layout, [2, 0, 1, 3, 4]);
    expect(detection.method).toBe("sequence");
    expect(detection.panels.map((p) => p.id)).toEqual([
      "panel-photo-3",
      "panel-photo-1",
      "panel-photo-2",
      "panel-photo-4",
      "panel-photo-5",
    ]);
    expect(detection.panels.map((p) => p.index)).toEqual([0, 1, 2, 3, 4]);
    expect(detection.panels[0]?.bounds).toEqual(layout.placements[2]);
  });

  it("refuses an order that repeats or invents a photo", () => {
    const layout = layoutSequence(scene);
    expect(() => sequenceDetection(layout, [0, 0, 1])).toThrow();
    expect(() => sequenceDetection(layout, [9])).toThrow();
  });

  it("never shows a neighbouring photo at any frame of the video", () => {
    const layout = layoutSequence(scene);
    const detection = sequenceDetection(layout);
    for (const fit of ["contain", "fill"] as const) {
      const board = buildStoryboard(detection, {
        fit,
        openWithEstablishingShot: false,
        closeWithEstablishingShot: false,
      });
      expect(board.shots).toHaveLength(scene.length);
      const total = totalDurationMs(board);
      for (let t = 0; t <= total; t += 50) {
        for (const layer of composeFrame(board, t).layers) {
          const own = detection.panels.find((p) => `shot-${p.id}` === layer.shotId);
          expect(own, layer.shotId).toBeDefined();
          if (own) expect(inside(layer.source, own.bounds)).toBe(true);
        }
      }
    }
  });
});
