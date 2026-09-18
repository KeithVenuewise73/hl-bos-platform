import { describe, expect, it } from "vitest";

import { buildClips, clipDuration, effectiveWindow } from "./clips.ts";
import type { CandidateEvent } from "./types.ts";

function event(overrides: Partial<CandidateEvent> = {}): CandidateEvent {
  return {
    id: "e-1",
    projectId: "p-1",
    segmentId: "s-1",
    kind: "burst",
    startTime: 60,
    endTime: 64,
    peakTime: 62,
    strength: 0.7,
    identityConfidence: 0.9,
    rationale: "Skating hard.",
    ...overrides,
  };
}

const DURATION = 3600;

describe("clip planning", () => {
  it("produces nothing from nothing", () => {
    expect(buildClips([], { videoDurationSeconds: DURATION })).toEqual([]);
  });

  it("gives the moment a run-up and a hold", () => {
    const [clip] = buildClips([event()], { videoDurationSeconds: DURATION });
    expect(clip?.startTime).toBeLessThan(60);
    expect(clip?.endTime).toBeGreaterThan(64);
  });

  it("starts every clip pending, because nothing is approved by default", () => {
    const [clip] = buildClips([event()], { videoDurationSeconds: DURATION });
    expect(clip?.decision).toBe("pending");
    expect(clip?.mediaAssetId).toBeNull();
  });

  it("never runs off the start of the video", () => {
    const [clip] = buildClips([event({ startTime: 0.5, endTime: 2, peakTime: 1 })], {
      videoDurationSeconds: DURATION,
    });
    expect(clip?.startTime).toBeGreaterThanOrEqual(0);
  });

  it("never runs off the end of the video", () => {
    const [clip] = buildClips(
      [event({ startTime: 3598, endTime: 3599.5, peakTime: 3599 })],
      { videoDurationSeconds: DURATION },
    );
    expect(clip?.endTime).toBeLessThanOrEqual(DURATION);
  });

  it("merges two moments of the same play into one clip", () => {
    const clips = buildClips(
      [event({ id: "a", startTime: 60, endTime: 63, peakTime: 61 }),
       event({ id: "b", startTime: 64, endTime: 67, peakTime: 65 })],
      { videoDurationSeconds: DURATION },
    );
    // Ruling on the same play twice wastes the one resource the reviewer has.
    expect(clips).toHaveLength(1);
    expect(clips[0]?.startTime).toBeLessThan(60);
    expect(clips[0]?.endTime).toBeGreaterThan(67);
  });

  it("keeps two genuinely separate plays separate", () => {
    const clips = buildClips(
      [event({ id: "a", startTime: 60, endTime: 63, peakTime: 61 }),
       event({ id: "b", startTime: 600, endTime: 603, peakTime: 601 })],
      { videoDurationSeconds: DURATION },
    );
    expect(clips).toHaveLength(2);
  });

  it("orders the queue by time, not by strength", () => {
    // The reviewer is reliving a game they attended; third period before first
    // makes every clip harder to place.
    const clips = buildClips(
      [event({ id: "late", startTime: 2000, endTime: 2004, peakTime: 2002, strength: 0.2 }),
       event({ id: "early", startTime: 100, endTime: 104, peakTime: 102, strength: 0.99 })],
      { videoDurationSeconds: DURATION },
    );
    expect(clips[0]?.startTime).toBeLessThan(clips[1]?.startTime ?? 0);
    expect(clips.map((c) => c.order)).toEqual([0, 1]);
  });

  it("trims a long merged window around the peak, not off the end", () => {
    const events = Array.from({ length: 12 }, (_, i) =>
      event({ id: `e-${i}`, startTime: 100 + i * 3, endTime: 102 + i * 3, peakTime: 101 + i * 3,
              strength: i === 11 ? 1 : 0.1 }),
    );
    const [clip] = buildClips(events, { videoDurationSeconds: DURATION, maxSeconds: 20 });
    expect(clip).toBeDefined();
    expect(clipDuration(clip!)).toBeLessThanOrEqual(20.01);
    // The strongest moment is at 134s; cutting the tail would have removed it.
    expect(clip!.startTime).toBeLessThanOrEqual(134);
    expect(clip!.endTime).toBeGreaterThanOrEqual(134);
  });

  it("stretches a very short moment up to something watchable", () => {
    const [clip] = buildClips(
      [event({ startTime: 100, endTime: 100.2, peakTime: 100.1 })],
      { videoDurationSeconds: DURATION, leadSeconds: 0, tailSeconds: 0, minSeconds: 3 },
    );
    expect(clipDuration(clip!)).toBeGreaterThanOrEqual(2.99);
  });

  it("still yields one clip when the source is shorter than the minimum", () => {
    const clips = buildClips([event({ startTime: 0.1, endTime: 1, peakTime: 0.5 })], {
      videoDurationSeconds: 2,
      minSeconds: 3,
    });
    expect(clips).toHaveLength(1);
    expect(clips[0]?.startTime).toBe(0);
    expect(clips[0]?.endTime).toBeLessThanOrEqual(2);
  });

  it("reports the proposed window until a person trims it", () => {
    const [clip] = buildClips([event()], { videoDurationSeconds: DURATION });
    expect(effectiveWindow(clip!)).toEqual({ start: clip!.startTime, end: clip!.endTime });
    const trimmed = { ...clip!, trimmedStart: 60, trimmedEnd: 62 };
    expect(effectiveWindow(trimmed)).toEqual({ start: 60, end: 62 });
    expect(clipDuration(trimmed)).toBe(2);
  });
});
