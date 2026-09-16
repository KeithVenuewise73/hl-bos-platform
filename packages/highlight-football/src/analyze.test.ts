import { describe, expect, it } from "vitest";
import { analyzeGame } from "./analyze";
import {
  FIXTURE_DESCRIPTIONS,
  FIXTURE_NAMES,
  demoGame,
  fixture,
} from "./mock/fixtures";
import { demoAdapterSet } from "./mock/adapters";
import type { FixtureName } from "./mock/fixtures";
import type { SyntheticGame } from "./mock/synthetic";
import { jerseyOcrAccuracy, precisionRecall, segmentationAccuracy } from "./metrics";
import { assembleReel } from "./reel";
import { demoAdapterNames, isFullyReal } from "./adapters";
import { planSpotlight } from "./spotlight";
import { planCropPath } from "./crop";
import type { CropInput } from "./crop";
import { boxCenter } from "./types";

function analyze(game: SyntheticGame) {
  return analyzeGame({
    game: game.game,
    target: game.target,
    signals: game.signals,
    tracks: game.tracks,
    ball: game.ball,
    events: game.events,
  });
}

/** Did we claim exactly the tracks that really are the athlete? */
function identityScore(game: SyntheticGame, claimed: readonly string[]) {
  const truth = new Set(game.truth.athleteTrackIds);
  const claimedSet = new Set(claimed);
  return precisionRecall({
    truePositives: [...claimedSet].filter((t) => truth.has(t)).length,
    falsePositives: [...claimedSet].filter((t) => !truth.has(t)).length,
    falseNegatives: [...truth].filter((t) => !claimedSet.has(t)).length,
  });
}

describe.each([...FIXTURE_NAMES])("fixture: %s", (name: FixtureName) => {
  const game = fixture(name);
  const result = analyze(game);
  const claimed = result.decisions.filter((d) => d.isAthlete).map((d) => d.trackId);

  it(`is what it says it is — ${FIXTURE_DESCRIPTIONS[name]}`, () => {
    expect(FIXTURE_DESCRIPTIONS[name].length).toBeGreaterThan(20);
    expect(game.truth.plays.length).toBeGreaterThan(0);
  });

  it("finds every play and invents none", () => {
    const accuracy = segmentationAccuracy(
      result.plays.map((p) => ({
        startSeconds: p.startAt.seconds,
        endSeconds: p.endAt.seconds,
        snapSeconds: p.snapAt?.seconds ?? null,
      })),
      game.truth.plays,
    );
    expect(accuracy.missed).toBe(0);
    expect(accuracy.spurious).toBe(0);
    expect(accuracy.meanSnapErrorSeconds ?? 99).toBeLessThan(0.6);
  });

  it("claims every track that is the athlete and no track that is not", () => {
    const score = identityScore(game, claimed);
    expect(score.precision).toBe(1);
    expect(score.recall).toBe(1);
  });

  it("never claims an opposing player", () => {
    expect(claimed.some((t) => t.startsWith("opponent"))).toBe(false);
  });

  it("never claims a teammate", () => {
    expect(claimed.some((t) => t.startsWith("teammate"))).toBe(false);
  });

  it("produces clips that always contain the end of their play", () => {
    const playsById = new Map(result.plays.map((p) => [p.playId, p] as const));
    for (const candidate of result.selected) {
      const play = playsById.get(candidate.playId);
      expect(play).toBeDefined();
      if (play === undefined) continue;
      expect(candidate.window.endSeconds).toBeGreaterThanOrEqual(
        Math.min(play.endAt.seconds, game.game.durationSeconds) - 1e-9,
      );
      expect(candidate.window.startSeconds).toBeGreaterThanOrEqual(0);
      expect(candidate.window.endSeconds).toBeLessThanOrEqual(
        game.game.durationSeconds + 1e-9,
      );
    }
  });

  it("gives every candidate a reason a human can read", () => {
    for (const candidate of result.candidates) {
      expect(candidate.reasons.length).toBeGreaterThan(0);
      expect(candidate.score).toBeGreaterThanOrEqual(0);
      expect(candidate.score).toBeLessThanOrEqual(5);
    }
  });
});

describe("the vertical slice, end to end", () => {
  const game = demoGame();
  const result = analyze(game);

  it("upload → identify → track → find plays → cut clips → build reel", () => {
    // 1. Ten plays in the file; the segmenter finds ten.
    expect(result.summary.playsAnalyzed).toBe(game.truth.plays.length);

    // 2. He was off the field for two of them, and we say so rather than
    //    quietly scoring him on plays he never took.
    expect(result.summary.playerAppearances).toBe(8);

    // 3. Identity is exact across every fragment his track was split into.
    const claimed = result.decisions.filter((d) => d.isAthlete).map((d) => d.trackId);
    const score = identityScore(game, claimed);
    expect(score.precision).toBe(1);
    expect(score.recall).toBe(1);

    // 4. Clips exist and are rankable.
    expect(result.selected.length).toBeGreaterThan(0);

    // 5. A reel assembles from them.
    const reel = assembleReel(
      result.selected.map((c) => ({
        candidateId: c.candidateId,
        gameId: game.game.id,
        playId: c.playId,
        window: c.window,
        score: c.score,
        title: c.events[0] ?? "Play",
      })),
      {
        mode: "game",
        profile: {
          name: game.target.name,
          number: String(game.target.number),
          team: "West Seneca",
          positions: "Safety / WR",
          season: "2026",
        },
      },
    );
    expect(reel.clips.length).toBe(result.selected.length);
    expect(reel.opening?.headline).toBe("DOMINIC HERMAN");
    expect(reel.totalSeconds).toBeGreaterThan(0);
  });

  it("scores the touchdown above the play where he merely stood on the field", () => {
    const scores = result.candidates.map((c) => c.score);
    expect(Math.max(...scores)).toBeGreaterThan(Math.min(...scores) + 1);
  });

  it("reports plays he was present for but did nothing on, instead of padding them", () => {
    expect(result.summary.presenceOnlyPlays).toBeGreaterThan(0);
    const presenceOnly = result.involvements.filter(
      (i) => i.playerPresent && i.involvement === 1,
    );
    for (const i of presenceOnly) {
      expect(i.reasons.join(" ")).toContain("no involvement in the play was detected");
    }
  });

  it("does not attribute an event to the athlete while he is occluded", () => {
    // He is buried in a pile when the run stop happens. We cannot see who made
    // it, so we do not claim he did — and the play scores accordingly.
    const occluded = fixture("occluded_player");
    const occludedResult = analyze(occluded);
    const firstPlay = occludedResult.involvements[0];
    expect(firstPlay?.playerPresent).toBe(true);
    expect(firstPlay?.visibilityPercentage ?? 1).toBeLessThan(0.7);
    expect(firstPlay?.events).toHaveLength(0);
  });

  it("reads jersey numbers correctly when it reads them at all, and abstains often", () => {
    const readings = game.truth.jerseyReadings;
    const attempted = readings.length;
    const accuracy = jerseyOcrAccuracy(readings);
    expect(accuracy.readable).toBeLessThan(attempted * 0.5); // mostly unreadable, as in real film
    expect(accuracy.accuracy ?? 0).toBeGreaterThan(0.75);
  });

  it("can plan a spotlight and a vertical crop for the first selected clip", () => {
    const candidate = result.selected[0];
    expect(candidate).toBeDefined();
    if (candidate === undefined) return;
    const play = result.plays.find((p) => p.playId === candidate.playId);
    const track = result.involvements.find(
      (i) => i.playId === candidate.playId,
    )?.trackId;
    const athlete = game.tracks.find((t) => t.trackId === track);
    expect(play).toBeDefined();
    expect(athlete).toBeDefined();
    if (play === undefined || athlete === undefined) return;

    const frames = athlete.detections.map((d) => ({
      frame: d.at.frame,
      seconds: d.at.seconds,
      player: d.box,
      ball: null,
    }));
    const spotlight = planSpotlight(
      candidate.window,
      play.snapAt?.seconds ?? play.startAt.seconds,
      frames,
      {
        name: game.target.name,
        number: String(game.target.number),
        team: "West Seneca",
      },
    );
    expect(spotlight.markers.length).toBeGreaterThan(0);

    const cropInputs: CropInput[] = frames.map((f) => ({
      frame: f.frame,
      player: f.player,
      ball: null,
    }));
    const path = planCropPath(cropInputs, { target: "9:16", sourceAspect: 16 / 9 });
    expect(path).toHaveLength(cropInputs.length);
    // The athlete's centre is inside every crop window.
    for (let i = 0; i < path.length; i++) {
      const window = path[i]?.window;
      const player = cropInputs[i]?.player;
      if (window === undefined || player == null) continue;
      const c = boxCenter(player);
      expect(c.x).toBeGreaterThanOrEqual(window.x - 1e-9);
      expect(c.x).toBeLessThanOrEqual(window.x + window.w + 1e-9);
    }
  });

  it("is reproducible: the same game analysed twice reaches the same conclusions", () => {
    const again = analyze(demoGame());
    expect(again.summary).toEqual(result.summary);
    expect(again.selected.map((c) => [c.playId, c.score])).toEqual(
      result.selected.map((c) => [c.playId, c.score]),
    );
  });
});

describe("demo mode is labelled as demo", () => {
  it("never claims a demo adapter set is real", () => {
    const set = demoAdapterSet(demoGame());
    expect(isFullyReal(set)).toBe(false);
    expect(demoAdapterNames(set)).toHaveLength(9);
  });

  it("runs the REAL colour clustering and segmenter inside demo mode", async () => {
    const game = demoGame();
    const set = demoAdapterSet(game);
    const samples = game.tracks
      .flatMap((t) => t.detections.map((d) => d.jerseyColor))
      .filter((c): c is NonNullable<typeof c> => c !== null);
    const fitted = await set.teamClassifier.fit(samples);
    expect(fitted.length).toBe(2);

    const detection = game.tracks[0]?.detections[0];
    expect(detection).toBeDefined();
    if (detection !== undefined) {
      const classified = await set.teamClassifier.classify(detection);
      expect(classified.teamId).not.toBeUndefined();
    }

    const plays = await set.segmenter.segment(game.signals, game.game.frameRate);
    expect(plays.length).toBe(game.truth.plays.length);
  });

  it("returns real, low ball-detection confidence rather than a comfortable number", async () => {
    const game = demoGame();
    const set = demoAdapterSet(game);
    const frame = {
      at: game.ball.detections[10]?.at ?? { frame: 0, seconds: 0 },
      width: 1280,
      height: 720,
      pixels: null,
    };
    const detections = await set.ballDetector.detect(frame);
    expect(detections.length).toBeGreaterThan(0);
    expect(detections[0]?.confidence ?? 1).toBeLessThan(0.7);
  });

  it("exposes the tracker's split tracks, occlusion gaps included", async () => {
    const game = fixture("occluded_player");
    const set = demoAdapterSet(game);
    const tracks = await set.tracker.flush();
    expect(tracks.length).toBeGreaterThan(game.truth.plays.length);
    expect(await set.tracker.update({ frame: 0, seconds: 0 }, [])).toEqual([]);
  });

  it("uses the real ranking and re-identification code paths", async () => {
    const game = demoGame();
    const set = demoAdapterSet(game);
    const result = analyze(game);
    const ranked = await set.ranker.rank(result.candidates);
    expect(ranked[0]?.score ?? 0).toBeGreaterThanOrEqual(
      ranked[ranked.length - 1]?.score ?? 0,
    );

    const detection = game.tracks[0]?.detections[0];
    if (detection !== undefined) {
      const embedding = await set.reIdentifier.embed(
        { at: detection.at, width: 1280, height: 720, pixels: null },
        detection,
      );
      expect(embedding?.length).toBe(16);
    }
  });

  it("reads a jersey number as unreadable when the generator hid it", async () => {
    const game = fixture("number_invisible");
    const set = demoAdapterSet(game);
    const hidden = game.tracks
      .flatMap((t) => t.detections)
      .find((d) => d.jerseyNumber === null);
    expect(hidden).toBeDefined();
    if (hidden !== undefined) {
      const reading = await set.jerseyRecognizer.read(
        { at: hidden.at, width: 1280, height: 720, pixels: null },
        hidden,
      );
      expect(reading.number).toBeNull();
    }
  });

  it("classifies events only inside the play window it was asked about", async () => {
    const game = demoGame();
    const set = demoAdapterSet(game);
    const result = analyze(game);
    const play = result.plays[0];
    expect(play).toBeDefined();
    if (play === undefined) return;
    const events = await set.eventClassifier.classify(play, game.tracks, game.ball);
    for (const e of events) {
      expect(e.at.frame).toBeGreaterThanOrEqual(play.startAt.frame);
      expect(e.at.frame).toBeLessThanOrEqual(play.endAt.frame);
    }
  });

  it("detects players frame by frame", async () => {
    const game = demoGame();
    const set = demoAdapterSet(game);
    const detection = game.tracks[0]?.detections[5];
    expect(detection).toBeDefined();
    if (detection === undefined) return;
    const found = await set.playerDetector.detect({
      at: detection.at,
      width: 1280,
      height: 720,
      pixels: null,
    });
    expect(found.length).toBeGreaterThan(0);
    const none = await set.playerDetector.detect({
      at: { frame: 999999, seconds: 33333 },
      width: 1280,
      height: 720,
      pixels: null,
    });
    expect(none).toEqual([]);
  });
});
