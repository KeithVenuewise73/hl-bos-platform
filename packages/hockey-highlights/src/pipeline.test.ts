import { describe, expect, it } from "vitest";

import {
  PROXY_MAX_HEIGHT,
  detectAndTrack,
  identifyAndDetectEvents,
  planClips,
  preprocess,
  strideFor,
} from "./pipeline.ts";
import {
  ReplayVisionProvider,
  REPLAY_DETECTION_SOURCE,
  isFixtureSource,
} from "./vision/replay.ts";
import { UnavailableVisionProvider } from "./vision/unavailable.ts";
import { HttpVisionProvider } from "./vision/http.ts";
import { selectProvider } from "./vision/index.ts";
import type { Athlete, Observation, PlayerTrack } from "./types.ts";
import type { VideoProbe } from "./vision/types.ts";

const ATHLETE: Athlete = {
  id: "a-1",
  name: "Sam Herman",
  jerseyNumber: "17",
  jerseyColorId: "navy",
  position: "forward",
};

const PROBE: VideoProbe = {
  durationSeconds: 3600,
  width: 1920,
  height: 1080,
  frameRate: 30,
  sizeBytes: 4_000_000_000,
};

function skater(id: string, number: string | null, colour: string): PlayerTrack {
  const observations: Observation[] = Array.from({ length: 40 }, (_, i) => ({
    frame: i,
    timeSeconds: 100 + i / 5,
    box: { x: i * 0.15 * 1080, y: 400, width: 40, height: 90 },
    detectionScore: 0.9,
    jerseyColorId: colour,
    jerseyColorScore: 0.9,
    jerseyNumber: number,
    jerseyNumberScore: number === null ? 0 : 0.9,
  }));
  return { id, observations };
}

describe("provider selection", () => {
  it("refuses honestly when no service is configured", async () => {
    const provider = selectProvider({ serviceUrl: undefined });
    expect(provider).toBeInstanceOf(UnavailableVisionProvider);
    const availability = await provider.availability();
    expect(availability.available).toBe(false);
    expect(availability.remedy).not.toBeNull();
  });

  it("treats blank configuration as no configuration", () => {
    expect(selectProvider({ serviceUrl: "   " })).toBeInstanceOf(
      UnavailableVisionProvider,
    );
  });

  it("uses the real service when one is configured", () => {
    expect(selectProvider({ serviceUrl: "http://localhost:4700" })).toBeInstanceOf(
      HttpVisionProvider,
    );
  });

  // The failure mode the HighlightAI evidence audit warned about by name.
  it("never silently substitutes fixtures for a missing service", async () => {
    const provider = selectProvider({ serviceUrl: undefined });
    // An empty result would let a user conclude the analysis ran and their
    // child did nothing all game. It must throw instead.
    await expect(provider.probe("originals/game.mp4")).rejects.toThrow();
    await expect(
      provider.track({
        proxyStorageKey: "x",
        frameStride: 6,
        jerseyColorId: "navy",
        jerseyNumber: "17",
      }),
    ).rejects.toThrow();
  });

  it("marks every fixture-derived detection as such", async () => {
    const provider = new ReplayVisionProvider({
      probe: PROBE,
      tracks: [skater("t-1", "17", "navy")],
      frameWidth: 1920,
      frameHeight: 1080,
    });
    const result = await provider.track({
      proxyStorageKey: "x",
      frameStride: 6,
      jerseyColorId: "navy",
      jerseyNumber: "17",
    });
    expect(result.detectionSource).toBe(REPLAY_DETECTION_SOURCE);
    expect(isFixtureSource(result.detectionSource)).toBe(true);
    expect(isFixtureSource("yolov8n+bytetrack")).toBe(false);
  });

  it("says a reference photo was not used rather than implying it was", async () => {
    const provider = new ReplayVisionProvider({
      probe: PROBE,
      tracks: [],
      frameWidth: 1920,
      frameHeight: 1080,
    });
    const result = await provider.track({
      proxyStorageKey: "x",
      frameStride: 6,
      jerseyColorId: "navy",
      jerseyNumber: "17",
      referencePhotoKey: "photos/sam.jpg",
    });
    expect(result.usedReferencePhoto).toBe(false);
    expect(result.notes.join(" ")).toContain("cannot compare photos");
  });
});

describe("pipeline stages", () => {
  const provider = new ReplayVisionProvider({
    probe: PROBE,
    tracks: [skater("t-1", "17", "navy"), skater("t-2", "9", "white")],
    frameWidth: 1920,
    frameHeight: 1080,
  });

  it("analyses at 5 frames a second whatever the source rate", () => {
    expect(strideFor(30)).toBe(6);
    expect(strideFor(60)).toBe(12);
    expect(strideFor(24)).toBe(5);
    expect(strideFor(0)).toBeGreaterThan(0);
    expect(strideFor(Number.NaN)).toBeGreaterThan(0);
  });

  it("probes and builds a proxy without touching the original", async () => {
    const result = await preprocess(provider, "originals/game.mp4");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.probe.durationSeconds).toBe(3600);
    expect(result.proxyStorageKey).not.toBe("originals/game.mp4");
    expect(PROXY_MAX_HEIGHT).toBeLessThan(1080);
  });

  it("reports an unreadable file as not-retryable rather than looping forever", async () => {
    const broken = new ReplayVisionProvider({
      probe: { ...PROBE, durationSeconds: 0 },
      tracks: [],
      frameWidth: 0,
      frameHeight: 0,
    });
    const result = await preprocess(broken, "originals/broken.mp4");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("unreadable_video");
    expect(result.retryable).toBe(false);
  });

  it("turns an unavailable service into a failure that will not be retried", async () => {
    const result = await preprocess(
      new UnavailableVisionProvider(),
      "originals/game.mp4",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("vision_unavailable");
    // A Try Again button that cannot work is a control that controls nothing.
    expect(result.retryable).toBe(false);
  });

  it("distinguishes 'we saw nobody' from 'we could not look'", async () => {
    const empty = new ReplayVisionProvider({
      probe: PROBE,
      tracks: [],
      frameWidth: 1920,
      frameHeight: 1080,
    });
    const result = await detectAndTrack(empty, {
      proxyStorageKey: "p",
      athlete: ATHLETE,
      frameRate: 30,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tracks).toHaveLength(0);
    expect(result.notes.join(" ")).toContain("No players were detected");
  });

  it("picks the athlete out of a crowd and ignores the other team", () => {
    const output = identifyAndDetectEvents({
      projectId: "p-1",
      athlete: ATHLETE,
      tracks: [skater("t-1", "17", "navy"), skater("t-2", "9", "white")],
      detectionSource: "test",
      frameHeight: 1080,
    });
    expect(output.segments).toHaveLength(1);
    expect(output.segments[0]?.trackId).toBe("t-1");
    expect(output.events.length).toBeGreaterThan(0);
  });

  it("explains an empty result instead of showing a blank screen", () => {
    const output = identifyAndDetectEvents({
      projectId: "p-1",
      athlete: ATHLETE,
      tracks: [skater("t-2", "9", "white")],
      detectionSource: "test",
      frameHeight: 1080,
    });
    expect(output.segments).toHaveLength(0);
    expect(output.notes[0]).toContain("player paths were found");
    expect(output.notes[0]).toContain("17");
  });

  it("says nothing was detected when nothing was detected", () => {
    const output = identifyAndDetectEvents({
      projectId: "p-1",
      athlete: ATHLETE,
      tracks: [],
      detectionSource: "test",
      frameHeight: 1080,
    });
    expect(output.notes[0]).toContain("No players were detected");
  });

  it("runs end to end from tracks to a review queue", () => {
    const output = identifyAndDetectEvents({
      projectId: "p-1",
      athlete: ATHLETE,
      tracks: [skater("t-1", "17", "navy")],
      detectionSource: "test",
      frameHeight: 1080,
    });
    const clips = planClips(output.events, PROBE.durationSeconds);
    expect(clips.length).toBeGreaterThan(0);
    for (const clip of clips) {
      expect(clip.decision).toBe("pending");
      expect(clip.endTime).toBeLessThanOrEqual(PROBE.durationSeconds);
      expect(clip.startTime).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("http provider", () => {
  it("treats an unreachable service as unavailable, not as an empty result", async () => {
    const provider = new HttpVisionProvider({
      baseUrl: "http://localhost:1",
      fetchImpl: () => Promise.reject(new Error("ECONNREFUSED")),
    });
    const availability = await provider.availability();
    expect(availability.available).toBe(false);
    expect(availability.detail).toContain("not answering");
  });

  it("raises an error on a refusal rather than returning nothing", async () => {
    const provider = new HttpVisionProvider({
      baseUrl: "http://localhost:4700",
      fetchImpl: () => Promise.resolve(new Response("model missing", { status: 503 })),
    });
    await expect(provider.probe("x")).rejects.toThrow(/503/);
  });

  // The bug that produced a stored clip with no end time. `width` and `height`
  // are spelled the same on both sides, so a passed-through response looked
  // correct until something read a field that was not.
  it("maps EVERY probe field, including the ones whose names differ", async () => {
    const provider = new HttpVisionProvider({
      baseUrl: "http://localhost:4700",
      fetchImpl: () =>
        Promise.resolve(
          Response.json({
            duration_seconds: 3600.5,
            width: 1920,
            height: 1080,
            frame_rate: 29.97,
            size_bytes: 4_200_000_000,
          }),
        ),
    });
    const probe = await provider.probe("originals/game.mp4");
    expect(probe.durationSeconds).toBe(3600.5);
    expect(probe.frameRate).toBe(29.97);
    expect(probe.sizeBytes).toBe(4_200_000_000);
    expect(probe.width).toBe(1920);
    expect(probe.height).toBe(1080);
    for (const value of Object.values(probe)) {
      expect(value).toBeTypeOf("number");
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it("maps the service's snake_case wire format onto the engine's types", async () => {
    const provider = new HttpVisionProvider({
      baseUrl: "http://localhost:4700",
      fetchImpl: () =>
        Promise.resolve(
          Response.json({
            tracks: [
              {
                id: "t-1",
                observations: [
                  {
                    frame: 30,
                    time_seconds: 1,
                    box: { x: 1, y: 2, width: 3, height: 4 },
                    detection_score: 0.8,
                    jersey_color_id: "navy",
                    jersey_color_score: 0.7,
                    jersey_number: "17",
                    jersey_number_score: 0.6,
                  },
                ],
              },
            ],
            detection_source: "yolov8n+bytetrack",
            frames_analysed: 900,
            frame_width: 960,
            frame_height: 540,
            used_reference_photo: false,
            notes: [],
          }),
        ),
    });
    const result = await provider.track({
      proxyStorageKey: "p",
      frameStride: 6,
      jerseyColorId: "navy",
      jerseyNumber: "17",
    });
    expect(result.detectionSource).toBe("yolov8n+bytetrack");
    expect(result.tracks[0]?.observations[0]).toMatchObject({
      timeSeconds: 1,
      jerseyNumber: "17",
      jerseyNumberScore: 0.6,
    });
  });
});
