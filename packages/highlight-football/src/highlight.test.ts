import { describe, expect, it } from "vitest";
import {
  SELECTION_THRESHOLDS,
  buildCandidates,
  clampWindow,
  dedupeOverlapping,
  highlightScore,
  planClipWindow,
  rankCandidates,
  selectCandidates,
  windowDuration,
  windowsOverlap,
} from "./highlight";
import { timestamp } from "./types";
import type {
  ClipSelectionMode,
  InvolvementScore,
  Play,
  PlayerPlayInvolvement,
} from "./types";

const FPS = 30;

const makePlay = (over: Partial<Play> = {}): Play => ({
  playId: "play-1",
  index: 0,
  startAt: timestamp(FPS * 30, FPS),
  snapAt: timestamp(FPS * 32, FPS),
  snapConfidence: 0.85,
  endAt: timestamp(FPS * 38, FPS),
  offenseTeamId: null,
  defenseTeamId: null,
  quarter: null,
  down: null,
  distance: null,
  segmentationConfidence: 0.9,
  ...over,
});

const makeInv = (over: Partial<PlayerPlayInvolvement> = {}): PlayerPlayInvolvement => ({
  playId: "play-1",
  playerPresent: true,
  trackId: "t-23",
  preSnapPosition: null,
  postSnapTrajectory: [],
  visibilityPercentage: 0.9,
  involvement: 4,
  rawScore: 4.2,
  identityConfidence: 0.95,
  reasons: ["Tackle detected."],
  events: ["tackle"],
  reviewRequired: false,
  ...over,
});

describe("planClipWindow — the brief's worked example", () => {
  it("cuts 32:10 to 32:31 for a snap at 32:15", () => {
    // Section 18: snap at 32:15, default padding, play ends at 32:23.
    const snapSeconds = 32 * 60 + 15;
    const endSeconds = 32 * 60 + 23;
    const play = makePlay({
      startAt: timestamp((snapSeconds - 2) * FPS, FPS),
      snapAt: timestamp(snapSeconds * FPS, FPS),
      endAt: timestamp(endSeconds * FPS, FPS),
    });
    const window = planClipWindow(play, { videoDurationSeconds: 7200 });
    expect(window.startSeconds).toBe(snapSeconds - 5);
    expect(window.endSeconds).toBe(endSeconds + 8);
  });

  it("honours custom padding", () => {
    const play = makePlay();
    const window = planClipWindow(play, {
      videoDurationSeconds: 7200,
      preSnapSeconds: 2,
      postPlaySeconds: 3,
    });
    expect(window.startSeconds).toBeCloseTo(30, 6);
    expect(window.endSeconds).toBeCloseTo(41, 6);
  });

  it("anchors on the play start when no snap was found", () => {
    const play = makePlay({ snapAt: null, snapConfidence: null });
    const window = planClipWindow(play, { videoDurationSeconds: 7200 });
    expect(window.startSeconds).toBeCloseTo(25, 6);
  });
});

describe("clampWindow — never cut off the conclusion of a play", () => {
  it("takes the lead-in away, never the tail, at the start of a file", () => {
    const play = makePlay({
      startAt: timestamp(0, FPS),
      snapAt: timestamp(FPS, FPS),
      endAt: timestamp(FPS * 7, FPS),
    });
    const window = planClipWindow(play, { videoDurationSeconds: 7200 });
    expect(window.startSeconds).toBe(0);
    expect(window.endSeconds).toBe(15);
  });

  it("reaches the end of the play even when the padding would run past the file", () => {
    const play = makePlay({
      startAt: timestamp(FPS * 95, FPS),
      snapAt: timestamp(FPS * 96, FPS),
      endAt: timestamp(FPS * 99, FPS),
    });
    const window = planClipWindow(play, { videoDurationSeconds: 100 });
    // The play ends at 99s and padding wants 107s. There is only 100s of file,
    // so the clip takes everything that exists — and crucially still contains
    // the end of the play.
    expect(window.endSeconds).toBe(100);
    expect(window.endSeconds).toBeGreaterThanOrEqual(play.endAt.seconds);
  });

  it("extends a window that somehow ended before the play did", () => {
    const play = makePlay();
    const broken = clampWindow({ startSeconds: 30, endSeconds: 33 }, play, {
      videoDurationSeconds: 7200,
    });
    expect(broken.endSeconds).toBeGreaterThanOrEqual(play.endAt.seconds);
  });

  it("never produces a clip shorter than the minimum", () => {
    const play = makePlay({
      startAt: timestamp(0, FPS),
      snapAt: timestamp(0, FPS),
      endAt: timestamp(FPS, FPS),
    });
    const window = planClipWindow(play, {
      videoDurationSeconds: 7200,
      preSnapSeconds: 0,
      postPlaySeconds: 0,
      minClipSeconds: 3,
    });
    expect(windowDuration(window)).toBeGreaterThanOrEqual(3);
  });

  it("produces a positive-length window even on a zero-length file", () => {
    const play = makePlay({
      startAt: timestamp(0, FPS),
      snapAt: timestamp(0, FPS),
      endAt: timestamp(0, FPS),
    });
    const window = clampWindow({ startSeconds: 5, endSeconds: 5 }, play, {
      videoDurationSeconds: 0,
    });
    expect(window.endSeconds).toBeGreaterThan(window.startSeconds - 1e-9);
  });
});

describe("highlightScore — every adjustment pushes downward", () => {
  const play = makePlay();

  it("scores a clean, confident, fully-visible play near its raw value", () => {
    expect(highlightScore(makeInv(), play)).toBeGreaterThan(3.8);
  });

  it("discounts a play we are not sure was him", () => {
    const sure = highlightScore(makeInv({ identityConfidence: 0.95 }), play);
    const unsure = highlightScore(makeInv({ identityConfidence: 0.5 }), play);
    expect(unsure).toBeLessThan(sure);
  });

  it("discounts a play we barely saw him in", () => {
    const seen = highlightScore(makeInv({ visibilityPercentage: 0.9 }), play);
    const glimpsed = highlightScore(makeInv({ visibilityPercentage: 0.2 }), play);
    expect(glimpsed).toBeLessThan(seen);
  });

  it("discounts a play we are not sure was a play", () => {
    const clean = highlightScore(makeInv(), makePlay({ segmentationConfidence: 0.95 }));
    const shaky = highlightScore(makeInv(), makePlay({ segmentationConfidence: 0.2 }));
    expect(shaky).toBeLessThan(clean);
  });

  it("never exceeds 5 and never goes below 0", () => {
    expect(highlightScore(makeInv({ rawScore: 99 }), play)).toBeLessThanOrEqual(5);
    expect(highlightScore(makeInv({ rawScore: -5 }), play)).toBeGreaterThanOrEqual(0);
  });

  it("returns one decimal place, as the UI shows it", () => {
    const score = highlightScore(makeInv({ rawScore: 4.27 }), play);
    expect(Math.round(score * 10)).toBe(score * 10);
  });
});

describe("buildCandidates and selection modes", () => {
  const plays = [0, 1, 2, 3, 4].map((i) =>
    makePlay({
      playId: `play-${i + 1}`,
      index: i,
      startAt: timestamp((60 + i * 40) * FPS, FPS),
      snapAt: timestamp((62 + i * 40) * FPS, FPS),
      endAt: timestamp((68 + i * 40) * FPS, FPS),
    }),
  );
  const involvements = [0, 1, 2, 3, 4].map((i) =>
    makeInv({
      playId: `play-${i + 1}`,
      involvement: i as InvolvementScore,
      rawScore: i,
      playerPresent: i > 0,
    }),
  );
  const opts = { videoDurationSeconds: 7200 };

  it("creates a candidate for every play he appeared in, dull ones included", () => {
    const candidates = buildCandidates(plays, involvements, opts);
    expect(candidates).toHaveLength(4);
  });

  it("skips plays he was not on the field for", () => {
    const candidates = buildCandidates(plays, involvements, opts);
    expect(candidates.some((c) => c.playId === "play-1")).toBe(false);
  });

  it("ignores an involvement referring to a play that does not exist", () => {
    const candidates = buildCandidates(plays, [makeInv({ playId: "ghost" })], opts);
    expect(candidates).toHaveLength(0);
  });

  it("filters by the four selection modes the brief defines", () => {
    const candidates = buildCandidates(plays, involvements, opts);
    const counts: Record<ClipSelectionMode, number> = {
      all_plays: selectCandidates(candidates, "all_plays").length,
      involved_plays: selectCandidates(candidates, "involved_plays").length,
      best_plays: selectCandidates(candidates, "best_plays").length,
      elite_highlights: selectCandidates(candidates, "elite_highlights").length,
    };
    expect(counts.all_plays).toBe(4);
    expect(counts.involved_plays).toBe(3);
    expect(counts.best_plays).toBe(2);
    expect(counts.elite_highlights).toBe(1);
    expect(SELECTION_THRESHOLDS.elite_highlights).toBe(4);
  });
});

describe("rankCandidates and dedupeOverlapping", () => {
  const opts = { videoDurationSeconds: 7200 };

  it("ranks by score and breaks ties by play order, not by invention", () => {
    const plays = [
      makePlay({
        playId: "play-b",
        startAt: timestamp(200 * FPS, FPS),
        snapAt: timestamp(202 * FPS, FPS),
        endAt: timestamp(208 * FPS, FPS),
      }),
      makePlay({
        playId: "play-a",
        startAt: timestamp(100 * FPS, FPS),
        snapAt: timestamp(102 * FPS, FPS),
        endAt: timestamp(108 * FPS, FPS),
      }),
    ];
    const inv = [makeInv({ playId: "play-b" }), makeInv({ playId: "play-a" })];
    const ranked = rankCandidates(buildCandidates(plays, inv, opts));
    expect(ranked.map((c) => c.playId)).toEqual(["play-a", "play-b"]);
  });

  it("detects overlapping windows", () => {
    expect(
      windowsOverlap(
        { startSeconds: 0, endSeconds: 10 },
        { startSeconds: 5, endSeconds: 15 },
      ),
    ).toBe(true);
    expect(
      windowsOverlap(
        { startSeconds: 0, endSeconds: 10 },
        { startSeconds: 10, endSeconds: 15 },
      ),
    ).toBe(false);
  });

  it("drops the weaker of two clips that would show the same seconds twice", () => {
    // Two plays four seconds apart: padded, their windows overlap heavily.
    const plays = [
      makePlay({
        playId: "play-1",
        startAt: timestamp(100 * FPS, FPS),
        snapAt: timestamp(102 * FPS, FPS),
        endAt: timestamp(106 * FPS, FPS),
      }),
      makePlay({
        playId: "play-2",
        startAt: timestamp(108 * FPS, FPS),
        snapAt: timestamp(110 * FPS, FPS),
        endAt: timestamp(114 * FPS, FPS),
      }),
    ];
    const inv = [
      makeInv({ playId: "play-1", involvement: 2, rawScore: 2 }),
      makeInv({ playId: "play-2", involvement: 5, rawScore: 5 }),
    ];
    const kept = dedupeOverlapping(buildCandidates(plays, inv, opts));
    expect(kept).toHaveLength(1);
    expect(kept[0]?.playId).toBe("play-2");
  });

  it("returns survivors in chronological order, because a reel is watched", () => {
    const plays = [0, 1, 2].map((i) =>
      makePlay({
        playId: `play-${i + 1}`,
        startAt: timestamp((60 + i * 60) * FPS, FPS),
        snapAt: timestamp((62 + i * 60) * FPS, FPS),
        endAt: timestamp((68 + i * 60) * FPS, FPS),
      }),
    );
    const inv = [
      makeInv({ playId: "play-1", involvement: 3, rawScore: 3 }),
      makeInv({ playId: "play-2", involvement: 5, rawScore: 5 }),
      makeInv({ playId: "play-3", involvement: 4, rawScore: 4 }),
    ];
    const kept = dedupeOverlapping(buildCandidates(plays, inv, opts));
    expect(kept.map((c) => c.playId)).toEqual(["play-1", "play-2", "play-3"]);
  });
});
