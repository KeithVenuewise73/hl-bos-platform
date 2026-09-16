import { describe, expect, it } from "vitest";
import { bestMatch, embeddingSimilarity, similarity } from "./reid";
import type { PlayerSignature } from "./reid";
import { COLOR_REFERENCE } from "./color";
import { timestamp } from "./types";

const FPS = 30;
const unit = (v: number[]): number[] => {
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};

const sig = (over: Partial<PlayerSignature> = {}): PlayerSignature => ({
  trackId: "t1",
  at: timestamp(0, FPS),
  box: { x: 0.4, y: 0.4, w: 0.06, h: 0.14 },
  jerseyColor: COLOR_REFERENCE.blue,
  helmetColor: COLOR_REFERENCE.navy,
  pantsColor: COLOR_REFERENCE.white,
  numberColor: COLOR_REFERENCE.white,
  jerseyNumber: 23,
  numberConfidence: 0.9,
  embedding: unit([1, 0.2, 0.3, 0.1]),
  field: null,
  velocity: null,
  ...over,
});

describe("embeddingSimilarity", () => {
  it("is 1 for identical vectors and 0.5 for orthogonal ones", () => {
    expect(embeddingSimilarity([1, 0], [1, 0])).toBeCloseTo(1, 6);
    expect(embeddingSimilarity([1, 0], [0, 1])).toBeCloseTo(0.5, 6);
  });

  it("returns null — not zero — when either side is missing or mismatched", () => {
    expect(embeddingSimilarity(null, [1, 0])).toBeNull();
    expect(embeddingSimilarity([1, 0], null)).toBeNull();
    expect(embeddingSimilarity([1, 0], [1, 0, 0])).toBeNull();
    expect(embeddingSimilarity([], [])).toBeNull();
    expect(embeddingSimilarity([0, 0], [1, 0])).toBeNull();
  });
});

describe("similarity — hard gates", () => {
  it("vetoes two confident, conflicting jersey numbers", () => {
    const result = similarity(
      sig(),
      sig({ trackId: "t2", jerseyNumber: 28, numberConfidence: 0.9 }),
    );
    expect(result.score).toBe(0);
    expect(result.vetoed).toContain("conflicting numbers");
  });

  it("does NOT veto when one of the readings is unconfident", () => {
    const result = similarity(
      sig(),
      sig({ trackId: "t2", jerseyNumber: 28, numberConfidence: 0.4 }),
    );
    expect(result.vetoed).toBeNull();
  });

  it("vetoes a candidate no human could have reached in the time available", () => {
    const known = sig({
      at: timestamp(0, FPS),
      box: { x: 0.05, y: 0.5, w: 0.06, h: 0.14 },
    });
    const impossible = sig({
      trackId: "t2",
      at: timestamp(6, FPS), // 0.2 seconds later
      box: { x: 0.9, y: 0.5, w: 0.06, h: 0.14 },
    });
    const result = similarity(known, impossible);
    expect(result.score).toBe(0);
    expect(result.vetoed).toContain("physically unreachable");
  });

  it("allows a fast but possible move", () => {
    const known = sig({
      at: timestamp(0, FPS),
      box: { x: 0.3, y: 0.5, w: 0.06, h: 0.14 },
    });
    const fast = sig({
      trackId: "t2",
      at: timestamp(30, FPS), // one second later
      box: { x: 0.7, y: 0.5, w: 0.06, h: 0.14 },
    });
    expect(similarity(known, fast).vetoed).toBeNull();
  });

  it("stops applying the motion gate once the gap is long enough that position means nothing", () => {
    const known = sig({
      at: timestamp(0, FPS),
      box: { x: 0.05, y: 0.5, w: 0.06, h: 0.14 },
    });
    const later = sig({
      trackId: "t2",
      at: timestamp(300, FPS), // ten seconds later — a different play
      box: { x: 0.95, y: 0.5, w: 0.06, h: 0.14 },
    });
    const result = similarity(known, later);
    expect(result.vetoed).toBeNull();
    expect(result.parts.motion).toBeNull();
  });
});

describe("similarity — signals", () => {
  it("rewards arriving where the previous velocity predicted", () => {
    const known = sig({
      at: timestamp(0, FPS),
      box: { x: 0.3, y: 0.5, w: 0.06, h: 0.14 },
      velocity: { vx: 0.4, vy: 0 },
    });
    const onRoute = sig({
      trackId: "a",
      at: timestamp(15, FPS),
      box: { x: 0.5, y: 0.5, w: 0.06, h: 0.14 },
    });
    const offRoute = sig({
      trackId: "b",
      at: timestamp(15, FPS),
      box: { x: 0.3, y: 0.68, w: 0.06, h: 0.14 },
    });
    const onMotion = similarity(known, onRoute).parts.motion ?? 0;
    const offMotion = similarity(known, offRoute).parts.motion ?? 0;
    expect(onMotion).toBeGreaterThan(offMotion);
  });

  it("ignores an absent signal instead of treating it as dissimilarity", () => {
    const withEmbedding = similarity(sig(), sig({ trackId: "t2" }));
    const withoutEmbedding = similarity(
      sig({ embedding: null }),
      sig({ trackId: "t2", embedding: null }),
    );
    expect(withoutEmbedding.parts.embedding).toBeNull();
    // Dropping a perfectly-matching signal must not raise the score.
    expect(withoutEmbedding.score).toBeLessThanOrEqual(withEmbedding.score + 1e-9);
    expect(withoutEmbedding.score).toBeGreaterThan(0.5);
  });

  it("scores an opponent in different colours well below a teammate", () => {
    const teammate = sig({ trackId: "mate", jerseyNumber: null, numberConfidence: 0 });
    const opponent = sig({
      trackId: "opp",
      jerseyNumber: null,
      numberConfidence: 0,
      jerseyColor: COLOR_REFERENCE.white,
      helmetColor: COLOR_REFERENCE.white,
      pantsColor: COLOR_REFERENCE.red,
      embedding: unit([0.1, 1, 0.2, 0.9]),
    });
    const known = sig({ jerseyNumber: null, numberConfidence: 0 });
    expect(similarity(known, teammate).score).toBeGreaterThan(
      similarity(known, opponent).score,
    );
  });

  it("returns 0 when there is no signal at all to compare", () => {
    const blank: PlayerSignature = {
      trackId: "blank",
      at: timestamp(0, FPS),
      box: { x: 0, y: 0, w: 0, h: 0 },
      jerseyColor: null,
      helmetColor: null,
      pantsColor: null,
      numberColor: null,
      jerseyNumber: null,
      numberConfidence: 0,
      embedding: null,
      field: null,
      velocity: null,
    };
    expect(similarity(blank, { ...blank, trackId: "other" }).score).toBe(0);
  });
});

describe("bestMatch — refusing is a first-class outcome", () => {
  it("picks the clearly better candidate", () => {
    const known = sig();
    const good = sig({ trackId: "good" });
    const bad = sig({
      trackId: "bad",
      jerseyColor: COLOR_REFERENCE.white,
      helmetColor: COLOR_REFERENCE.white,
      pantsColor: COLOR_REFERENCE.red,
      jerseyNumber: null,
      numberConfidence: 0,
      embedding: unit([0, 1, 0, 1]),
    });
    expect(bestMatch(known, [bad, good])?.trackId).toBe("good");
  });

  it("refuses when two teammates look equally like him", () => {
    // The dangerous football case: identical uniforms, number unreadable.
    const known = sig({ jerseyNumber: null, numberConfidence: 0 });
    const twinA = sig({ trackId: "a", jerseyNumber: null, numberConfidence: 0 });
    const twinB = sig({ trackId: "b", jerseyNumber: null, numberConfidence: 0 });
    expect(bestMatch(known, [twinA, twinB])).toBeNull();
  });

  it("refuses when nothing is good enough", () => {
    const known = sig();
    const stranger = sig({
      trackId: "x",
      jerseyColor: COLOR_REFERENCE.orange,
      helmetColor: COLOR_REFERENCE.black,
      pantsColor: COLOR_REFERENCE.black,
      jerseyNumber: null,
      numberConfidence: 0,
      embedding: unit([0, 0, 1, 0]),
    });
    expect(bestMatch(known, [stranger], { minScore: 0.9 })).toBeNull();
  });

  it("refuses on an empty candidate list", () => {
    expect(bestMatch(sig(), [])).toBeNull();
  });
});
