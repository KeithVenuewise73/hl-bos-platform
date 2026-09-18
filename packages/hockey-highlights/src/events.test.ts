import { describe, expect, it } from "vitest";

import { detectEvents } from "./events.ts";
import type { Observation, PlayerSegment } from "./types.ts";

const FRAME_HEIGHT = 1080;

function segment(overrides: Partial<PlayerSegment> = {}): PlayerSegment {
  return {
    id: "s-1",
    projectId: "p-1",
    trackId: "t-1",
    startTime: 0,
    endTime: 10,
    confidence: 0.9,
    band: "likely",
    detectionSource: "test",
    evidence: {
      colorAgreement: 1,
      colorClarity: 0.9,
      numberAgreement: 1,
      numberClarity: 0.9,
      numberReadCount: 4,
      observationCount: 50,
      photoSimilarity: null,
    },
    ...overrides,
  };
}

/** A path sampled at 5Hz. `move` returns the skate position at each step. */
function path(
  steps: number,
  move: (i: number) => { x: number; y: number },
  hz = 5,
): Observation[] {
  return Array.from({ length: steps }, (_, i) => {
    const { x, y } = move(i);
    return {
      frame: i,
      timeSeconds: i / hz,
      box: { x, y: y - 90, width: 40, height: 90 },
      detectionScore: 0.9,
      jerseyColorId: "navy",
      jerseyColorScore: 0.9,
      jerseyNumber: "17",
      jerseyNumberScore: 0.9,
    };
  });
}

describe("event detection", () => {
  it("says nothing when there is almost nothing to look at", () => {
    expect(
      detectEvents(
        segment(),
        path(2, () => ({ x: 0, y: 0 })),
        { frameHeight: FRAME_HEIGHT },
      ),
    ).toEqual([]);
  });

  it("finds a sustained sprint across the ice", () => {
    // 0.15 frame-heights per step at 5Hz = 0.75 frame-heights/sec: a rush.
    const events = detectEvents(
      segment(),
      path(30, (i) => ({ x: i * 0.15 * FRAME_HEIGHT, y: 500 })),
      { frameHeight: FRAME_HEIGHT },
    );
    const bursts = events.filter((e) => e.kind === "burst");
    expect(bursts.length).toBeGreaterThan(0);
    expect(bursts[0]?.endTime).toBeGreaterThan(bursts[0]?.startTime ?? 0);
  });

  it("does not call standing still a highlight", () => {
    const events = detectEvents(
      segment({ endTime: 3 }),
      path(15, () => ({ x: 500, y: 500 })),
      { frameHeight: FRAME_HEIGHT },
    );
    expect(events.filter((e) => e.kind === "burst")).toHaveLength(0);
    expect(events.filter((e) => e.kind === "cut")).toHaveLength(0);
  });

  it("never claims a goal, a save or any other result it cannot see", () => {
    const events = detectEvents(
      segment(),
      path(30, (i) => ({ x: i * 0.15 * FRAME_HEIGHT, y: 500 })),
      { frameHeight: FRAME_HEIGHT },
    );
    for (const event of events) {
      expect([
        "burst",
        "cut",
        "sustained_presence",
        "crease_action",
        "manual",
      ]).toContain(event.kind);
      expect(event.rationale).not.toMatch(/goal|save|assist|shot|score/i);
      expect(event.rationale.length).toBeGreaterThan(10);
    }
  });

  it("finds a hard change of direction at speed", () => {
    const events = detectEvents(
      segment(),
      path(24, (i) => {
        const forward = Math.min(i, 12);
        const back = Math.max(0, i - 12);
        return { x: (forward - back) * 0.15 * FRAME_HEIGHT, y: 500 };
      }),
      { frameHeight: FRAME_HEIGHT },
    );
    expect(events.some((e) => e.kind === "cut")).toBe(true);
  });

  it("does not manufacture direction changes out of a stationary player", () => {
    // Sub-pixel jitter around a fixed point: heading swings wildly, speed does
    // not. Without the speed gate this produced a cut on almost every frame.
    const events = detectEvents(
      segment(),
      path(40, (i) => ({ x: 500 + (i % 2), y: 500 + ((i + 1) % 2) })),
      { frameHeight: FRAME_HEIGHT },
    );
    expect(events.filter((e) => e.kind === "cut")).toHaveLength(0);
  });

  it("collapses one rush into one event, not five", () => {
    // Speed wobbles either side of the threshold through a single continuous
    // rush. The reviewer must not be asked to rule on the same play five times.
    const events = detectEvents(
      segment(),
      path(40, (i) => ({ x: (i * 0.14 + (i % 3) * 0.01) * FRAME_HEIGHT, y: 500 })),
      { frameHeight: FRAME_HEIGHT },
    );
    expect(events.filter((e) => e.kind === "burst").length).toBeLessThanOrEqual(2);
  });

  it("gives a defenceman who never sprints something rather than nothing", () => {
    const events = detectEvents(
      segment({ startTime: 0, endTime: 8 }),
      path(40, (i) => ({ x: 500 + i, y: 500 })),
      { frameHeight: FRAME_HEIGHT },
    );
    expect(events.some((e) => e.kind === "sustained_presence")).toBe(true);
  });

  it("keeps identity confidence separate from how interesting the motion was", () => {
    const events = detectEvents(
      segment({ confidence: 0.41, band: "possible" }),
      path(30, (i) => ({ x: i * 0.15 * FRAME_HEIGHT, y: 500 })),
      { frameHeight: FRAME_HEIGHT },
    );
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      // A strong burst by a player we are unsure about must stay unsure.
      expect(event.identityConfidence).toBe(0.41);
    }
  });

  it("caps how many events one segment can flood the queue with", () => {
    const events = detectEvents(
      segment({ endTime: 200 }),
      path(1000, (i) => ({ x: (i % 2 === 0 ? i : -i) * 0.15 * FRAME_HEIGHT, y: 500 })),
      { frameHeight: FRAME_HEIGHT, maxEventsPerSegment: 5 },
    );
    expect(events.length).toBeLessThanOrEqual(5);
  });

  it("finds a goalie's side-to-side scramble that no speed threshold would catch", () => {
    const events = detectEvents(
      segment({ endTime: 6 }),
      // Post-to-post and back: sustained lateral pushes inside a narrow band,
      // never leaving the crease. This is what a goalie highlight looks like,
      // and no forward-speed threshold would ever find it.
      path(30, (i) => ({
        x: 500 + Math.sin((i / 30) * Math.PI * 6) * 0.2 * FRAME_HEIGHT,
        y: 700,
      })),
      { frameHeight: FRAME_HEIGHT },
    );
    expect(events.some((e) => e.kind === "crease_action")).toBe(true);
  });

  it("keeps every event inside its segment's span", () => {
    const s = segment();
    const events = detectEvents(
      s,
      path(30, (i) => ({ x: i * 0.15 * FRAME_HEIGHT, y: 500 })),
      { frameHeight: FRAME_HEIGHT },
    );
    for (const event of events) {
      expect(event.startTime).toBeGreaterThanOrEqual(0);
      expect(event.peakTime).toBeGreaterThanOrEqual(event.startTime);
      expect(event.peakTime).toBeLessThanOrEqual(event.endTime);
      expect(event.strength).toBeGreaterThanOrEqual(0);
      expect(event.strength).toBeLessThanOrEqual(1);
    }
  });
});
