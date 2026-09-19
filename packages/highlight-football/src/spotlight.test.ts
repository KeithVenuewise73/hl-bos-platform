import { describe, expect, it } from "vitest";
import { labelFor, planSpotlight } from "./spotlight";
import type { SpotlightInput } from "./spotlight";
import type { BoundingBox, ClipWindow } from "./types";

const FPS = 30;
const SUBJECT = { name: "Dominic Herman", number: "23", team: "West Seneca" };
const clip: ClipWindow = { startSeconds: 27, endSeconds: 46 };
const SNAP = 32;

function frames(
  opts: { ball?: BoundingBox | null; missingPlayer?: boolean } = {},
): SpotlightInput[] {
  const out: SpotlightInput[] = [];
  for (let s = clip.startSeconds; s <= clip.endSeconds; s += 1 / FPS) {
    out.push({
      frame: Math.round(s * FPS),
      seconds: s,
      player:
        opts.missingPlayer === true ? null : { x: 0.4, y: 0.45, w: 0.05, h: 0.13 },
      ball: opts.ball ?? null,
    });
  }
  return out;
}

describe("planSpotlight — the identification card", () => {
  it("freezes one second before the snap and names the athlete", () => {
    const plan = planSpotlight(clip, SNAP, frames(), SUBJECT);
    expect(plan.freeze).not.toBeNull();
    expect(plan.freeze?.atSeconds).toBe(SNAP - 1);
    expect(plan.freeze?.headline).toBe("#23 DOMINIC HERMAN");
    expect(plan.freeze?.subhead).toBe("West Seneca");
    expect(plan.freeze?.holdSeconds).toBe(1);
  });

  it("skips the freeze when there is no lead-in to freeze in", () => {
    const tight: ClipWindow = { startSeconds: SNAP - 0.1, endSeconds: SNAP + 8 };
    expect(planSpotlight(tight, SNAP, frames(), SUBJECT).freeze).toBeNull();
  });

  it("skips the freeze when the athlete was not visible at that moment", () => {
    expect(
      planSpotlight(clip, SNAP, frames({ missingPlayer: true }), SUBJECT).freeze,
    ).toBeNull();
  });

  it("produces no plan at all for style 'none'", () => {
    const plan = planSpotlight(clip, SNAP, frames(), SUBJECT, { style: "none" });
    expect(plan.markers).toHaveLength(0);
    expect(plan.freeze).toBeNull();
  });

  it("falls back to a circle marker when the style is freeze_frame", () => {
    const plan = planSpotlight(clip, SNAP, frames(), SUBJECT, {
      style: "freeze_frame",
    });
    expect(plan.markers[0]?.style).toBe("circle");
  });
});

describe("planSpotlight — do not obscure the play", () => {
  it("frames the athlete rather than covering him", () => {
    const plan = planSpotlight(clip, SNAP, frames(), SUBJECT);
    const marker = plan.markers[0];
    const player = { x: 0.4, y: 0.45, w: 0.05, h: 0.13 };
    expect(marker).toBeDefined();
    expect(marker?.box.w ?? 0).toBeGreaterThan(player.w);
    expect(marker?.box.x ?? 1).toBeLessThan(player.x);
  });

  it("gets out of the way — the marker does not run the whole clip", () => {
    const plan = planSpotlight(clip, SNAP, frames(), SUBJECT, { markerSeconds: 3 });
    const last = plan.markers[plan.markers.length - 1];
    expect(last).toBeDefined();
    expect((last?.frame ?? 0) / FPS).toBeLessThanOrEqual(SNAP + 3 + 1e-6);
    expect(plan.markers.length).toBeLessThan(frames().length);
  });

  it("fades in and out rather than popping", () => {
    const plan = planSpotlight(clip, SNAP, frames(), SUBJECT);
    expect(plan.markers[0]?.opacity ?? 1).toBeLessThan(0.2);
    expect(plan.markers[plan.markers.length - 1]?.opacity ?? 1).toBeLessThan(0.2);
    expect(Math.max(...plan.markers.map((m) => m.opacity))).toBeCloseTo(1, 3);
  });
});

describe("labelFor — placed away from the football", () => {
  const player: BoundingBox = { x: 0.4, y: 0.45, w: 0.05, h: 0.13 };

  it("puts the label left when the ball is to the right", () => {
    const label = labelFor(player, { x: 0.8, y: 0.5, w: 0.012, h: 0.012 }, "#23");
    expect(label.side).toBe("left");
    expect(label.anchor.x).toBeLessThan(player.x);
  });

  it("puts the label right when the ball is to the left", () => {
    const label = labelFor(player, { x: 0.05, y: 0.5, w: 0.012, h: 0.012 }, "#23");
    expect(label.side).toBe("right");
    expect(label.anchor.x).toBeGreaterThan(player.x + player.w);
  });

  it("puts the label above when the ball is below", () => {
    const label = labelFor(player, { x: 0.42, y: 0.95, w: 0.012, h: 0.012 }, "#23");
    expect(label.side).toBe("above");
  });

  it("puts the label below when the ball is above", () => {
    const label = labelFor(player, { x: 0.42, y: 0.02, w: 0.012, h: 0.012 }, "#23");
    expect(label.side).toBe("below");
  });

  it("defaults to above when the ball is unknown", () => {
    expect(labelFor(player, null, "#23").side).toBe("above");
  });

  it("follows the ball: the label moves when the ball crosses the player", () => {
    const right = labelFor(player, { x: 0.9, y: 0.5, w: 0.012, h: 0.012 }, "#23");
    const left = labelFor(player, { x: 0.05, y: 0.5, w: 0.012, h: 0.012 }, "#23");
    expect(right.side).not.toBe(left.side);
  });
});
