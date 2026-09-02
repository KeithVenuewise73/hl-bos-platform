import { describe, expect, it } from "vitest";

import { detectPanels } from "./panels";
import {
  DEFAULT_STORYBOARD_OPTIONS,
  buildStoryboard,
  cameraAspect,
  resolveMove,
} from "./storyboard";
import { makeGridImage, makeNoiseImage } from "./test-images";
import type { Rect } from "./types";

const aspect = 16 / 9;
const panel: Rect = { x: 100, y: 50, width: 400, height: 300 };

const inside = (inner: Rect, outer: Rect): boolean =>
  inner.x >= outer.x - 1e-6 &&
  inner.y >= outer.y - 1e-6 &&
  inner.x + inner.width <= outer.x + outer.width + 1e-6 &&
  inner.y + inner.height <= outer.y + outer.height + 1e-6;

describe("resolveMove", () => {
  const moves = [
    "hold",
    "push-in",
    "pull-out",
    "pan-left",
    "pan-right",
    "pan-up",
    "pan-down",
  ] as const;

  it("keeps every camera position inside its own panel", () => {
    for (const move of moves) {
      const { from, to } = resolveMove(move, panel, aspect, 0.84);
      expect(inside(from, panel), `${move} start escapes the panel`).toBe(true);
      expect(inside(to, panel), `${move} end escapes the panel`).toBe(true);
    }
  });

  it("keeps every camera position at the output aspect ratio", () => {
    for (const move of moves) {
      const { from, to } = resolveMove(move, panel, aspect, 0.84);
      expect(from.width / from.height).toBeCloseTo(aspect);
      expect(to.width / to.height).toBeCloseTo(aspect);
    }
  });

  it("actually moves — a pan or a zoom is not a hold", () => {
    for (const move of moves) {
      const { from, to } = resolveMove(move, panel, aspect, 0.84);
      const travelled =
        Math.abs(from.x - to.x) +
        Math.abs(from.y - to.y) +
        Math.abs(from.width - to.width);
      if (move === "hold") expect(travelled).toBeCloseTo(0);
      else expect(travelled, `${move} does not move`).toBeGreaterThan(1);
    }
  });

  it("push-in ends tighter than it starts, pull-out the reverse", () => {
    const push = resolveMove("push-in", panel, aspect, 0.84);
    expect(push.to.width).toBeLessThan(push.from.width);
    const pull = resolveMove("pull-out", panel, aspect, 0.84);
    expect(pull.to.width).toBeGreaterThan(pull.from.width);
  });

  it("pan-right travels right, pan-left travels left", () => {
    expect(resolveMove("pan-right", panel, aspect, 0.84).to.x).toBeGreaterThan(
      resolveMove("pan-right", panel, aspect, 0.84).from.x,
    );
    expect(resolveMove("pan-left", panel, aspect, 0.84).to.x).toBeLessThan(
      resolveMove("pan-left", panel, aspect, 0.84).from.x,
    );
  });
});

describe("buildStoryboard", () => {
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

  it("gives one shot per panel plus an opening and closing wide", () => {
    const storyboard = buildStoryboard(detection);
    expect(storyboard.shots).toHaveLength(detection.panels.length + 2);
    expect(storyboard.shots[0]?.label).toBe("Full page");
    expect(storyboard.shots.at(-1)?.label).toBe("Full page");
    expect(storyboard.shots[1]?.label).toBe("Panel 1");
  });

  it("does not open and close on a wide when there is only one panel", () => {
    const single = detectPanels(makeNoiseImage(320, 200));
    const storyboard = buildStoryboard(single);
    expect(storyboard.shots).toHaveLength(1);
    expect(storyboard.shots[0]?.label).toBe("Full image");
  });

  it("never puts a crossfade on the first shot", () => {
    expect(buildStoryboard(detection).shots[0]?.transitionInMs).toBe(0);
  });

  it("carries the source dimensions so the renderer can clip", () => {
    const storyboard = buildStoryboard(detection);
    expect(storyboard.sourceWidth).toBe(detection.source.width);
    expect(storyboard.sourceHeight).toBe(detection.source.height);
  });

  it("varies the camera move between consecutive panels", () => {
    const storyboard = buildStoryboard(detection);
    const panelShots = storyboard.shots.filter((s) => s.label.startsWith("Panel "));
    const signatures = panelShots.map(
      (s) => `${s.to.width - s.from.width}:${s.to.x - s.from.x}`,
    );
    expect(new Set(signatures).size).toBeGreaterThan(1);
  });

  it("honours overridden options", () => {
    const storyboard = buildStoryboard(detection, {
      width: 1080,
      height: 1920,
      fps: 24,
      shotDurationMs: 1000,
      openWithEstablishingShot: false,
      closeWithEstablishingShot: false,
    });
    expect(storyboard.fps).toBe(24);
    expect(storyboard.shots).toHaveLength(detection.panels.length);
    for (const shot of storyboard.shots) expect(shot.durationMs).toBe(1000);
  });

  it("cuts the camera to the FRAME's shape in fill mode", () => {
    const storyboard = buildStoryboard(detection, {
      width: 1080,
      height: 1920,
      fit: "fill",
    });
    expect(storyboard.fit).toBe("fill");
    for (const shot of storyboard.shots) {
      expect(shot.from.width / shot.from.height).toBeCloseTo(1080 / 1920);
      expect(shot.to.width / shot.to.height).toBeCloseTo(1080 / 1920);
    }
  });

  it("keeps the camera at the PANEL's shape in contain mode, so nothing is cropped away", () => {
    const storyboard = buildStoryboard(detection, {
      width: 1920,
      height: 1080,
      fit: "contain",
    });
    const panel = detection.panels[0];
    const panelAspect = (panel?.bounds.width ?? 1) / (panel?.bounds.height ?? 1);
    const first = storyboard.shots.find((s) => s.label === "Panel 1");
    expect(first?.from.width).toBeCloseTo(panel?.bounds.width ?? 0);
    expect((first?.from.width ?? 1) / (first?.from.height ?? 1)).toBeCloseTo(
      panelAspect,
    );
  });

  it("opens on the whole image untouched in contain mode", () => {
    const storyboard = buildStoryboard(detection, { fit: "contain" });
    expect(storyboard.shots[0]?.from).toEqual({
      x: 0,
      y: 0,
      width: detection.source.width,
      height: detection.source.height,
    });
  });

  it("defaults to contain — losing the artist's lettering is the worse failure", () => {
    expect(DEFAULT_STORYBOARD_OPTIONS.fit).toBe("contain");
    expect(buildStoryboard(detection).fit).toBe("contain");
  });

  it("leaves captions empty rather than inventing narration", () => {
    for (const shot of buildStoryboard(detection).shots) expect(shot.caption).toBe("");
  });

  it("ships a default move cycle long enough to matter", () => {
    expect(DEFAULT_STORYBOARD_OPTIONS.moves.length).toBeGreaterThanOrEqual(4);
  });
});

describe("cameraAspect", () => {
  const panel = { x: 0, y: 0, width: 500, height: 492 };

  it("uses the frame's shape in fill mode", () => {
    expect(cameraAspect("fill", 16 / 9, panel)).toBeCloseTo(16 / 9);
  });

  it("uses the panel's own shape in contain mode", () => {
    expect(cameraAspect("contain", 16 / 9, panel)).toBeCloseTo(500 / 492);
  });

  it("is the rule buildStoryboard itself applies", () => {
    // Guards against the app and the package framing shots differently.
    const detection = detectPanels(
      makeGridImage({
        columns: 2,
        rows: 1,
        panelWidth: 200,
        panelHeight: 150,
        gutter: 8,
        seed: 9,
      }),
    );
    for (const fit of ["fill", "contain"] as const) {
      const storyboard = buildStoryboard(detection, { width: 1920, height: 1080, fit });
      for (const panelFound of detection.panels) {
        const shot = storyboard.shots.find((s) => s.id === `shot-${panelFound.id}`);
        expect((shot?.from.width ?? 1) / (shot?.from.height ?? 1)).toBeCloseTo(
          cameraAspect(fit, 1920 / 1080, panelFound.bounds),
        );
      }
    }
  });
});
