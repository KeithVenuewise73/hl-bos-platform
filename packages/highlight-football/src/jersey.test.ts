import { describe, expect, it } from "vitest";
import { isValidJerseyNumber, matchNumber, temporalVote } from "./jersey";
import type { JerseyObservation } from "./jersey";
import { timestamp } from "./types";

const FPS = 30;
const obs = (
  frame: number,
  number: number | null,
  confidence: number,
): JerseyObservation => ({
  at: timestamp(frame, FPS),
  number,
  confidence,
});

describe("temporalVote — the brief's worked example", () => {
  /**
   * Section 5, verbatim:
   *   Frame 14300 -> #23 confidence .81
   *   Frame 14305 -> unreadable
   *   Frame 14310 -> #23 confidence .92
   *   Frame 14315 -> unreadable
   * "Track should remain Player #23."
   */
  it("stays on #23 through two unreadable frames", () => {
    const vote = temporalVote([
      obs(14300, 23, 0.81),
      obs(14305, null, 0),
      obs(14310, 23, 0.92),
      obs(14315, null, 0),
    ]);
    expect(vote.number).toBe(23);
    expect(vote.confidence).toBeGreaterThan(0.9);
    expect(vote.supportingFrames).toBe(2);
    expect(vote.abstainingFrames).toBe(2);
  });

  it("is unmoved by extending the unreadable run to several seconds", () => {
    const observations = [obs(14300, 23, 0.81), obs(14310, 23, 0.92)];
    for (let f = 14320; f < 14500; f += 5) observations.push(obs(f, null, 0));
    const vote = temporalVote(observations);
    expect(vote.number).toBe(23);
    expect(vote.abstainingFrames).toBe(36);
  });
});

describe("temporalVote", () => {
  it("returns null rather than guessing when nothing was readable", () => {
    const vote = temporalVote([obs(10, null, 0), obs(20, null, 0)]);
    expect(vote.number).toBeNull();
    expect(vote.confidence).toBe(0);
    expect(vote.abstainingFrames).toBe(2);
  });

  it("returns null for no observations at all", () => {
    expect(temporalVote([]).number).toBeNull();
  });

  it("refuses to decide when two numbers are evenly supported", () => {
    const vote = temporalVote([
      obs(100, 23, 0.8),
      obs(105, 28, 0.8),
      obs(110, 23, 0.8),
      obs(115, 28, 0.8),
    ]);
    expect(vote.number).toBeNull();
    expect(vote.confidence).toBeLessThan(0.6);
    expect(vote.distribution).toHaveLength(2);
    expect(vote.supportingFrames).toBe(4);
  });

  it("lets a sustained recent reading overcome a stale one", () => {
    // Identity genuinely changed: the tracker latched onto someone else.
    const observations: JerseyObservation[] = [obs(0, 23, 0.9), obs(5, 23, 0.9)];
    for (let f = 900; f <= 1000; f += 10) observations.push(obs(f, 28, 0.9));
    const vote = temporalVote(observations);
    expect(vote.number).toBe(28);
  });

  it("weights a back number above a shoulder number", () => {
    const back = temporalVote([
      { at: timestamp(0, FPS), number: 23, confidence: 0.8, surface: "back" },
    ]);
    const shoulder = temporalVote([
      { at: timestamp(0, FPS), number: 23, confidence: 0.8, surface: "shoulder" },
    ]);
    // Same single-candidate share, but the shoulder reading carries less
    // absolute support and so falls below the support floor.
    expect(back.number).toBe(23);
    expect(shoulder.number).toBeNull();
  });

  it("discards readings below the confidence floor and counts them as abstentions", () => {
    const vote = temporalVote([obs(0, 23, 0.9), obs(5, 71, 0.1)]);
    expect(vote.number).toBe(23);
    expect(vote.abstainingFrames).toBe(1);
    expect(vote.distribution).toHaveLength(1);
  });

  it("does not let one weak reading carry a decision", () => {
    const vote = temporalVote([obs(0, 23, 0.36)]);
    // It is the only candidate, so its SHARE is total — but the absolute
    // evidence behind it is one marginal glimpse, and the support floor is
    // what stops that becoming an identity.
    expect(vote.confidence).toBe(1);
    expect(vote.number).toBeNull();
  });

  it("does accept two corroborating mid-confidence readings", () => {
    expect(temporalVote([obs(0, 23, 0.36), obs(5, 23, 0.36)]).number).toBe(23);
  });

  it("requires a clear majority, not a bare one", () => {
    // 50.5% is a coin landing, not a jersey number.
    const vote = temporalVote([
      obs(100, 23, 0.8),
      obs(105, 28, 0.8),
      obs(110, 23, 0.8),
      obs(115, 28, 0.8),
    ]);
    expect(vote.confidence).toBeGreaterThan(0.5);
    expect(vote.confidence).toBeLessThan(0.6);
    expect(vote.number).toBeNull();
  });

  it("can be asked what the number was at an earlier moment", () => {
    const observations = [obs(0, 23, 0.95), obs(3000, 28, 0.95)];
    const early = temporalVote(observations, { asOfSeconds: 1 });
    expect(early.number).toBe(23);
  });
});

describe("matchNumber", () => {
  it("matches the target", () => {
    const m = matchNumber(temporalVote([obs(0, 23, 0.95), obs(5, 23, 0.95)]), 23);
    expect(m.matches).toBe(true);
    expect(m.confusable).toBe(false);
  });

  it("does not match an undecided vote", () => {
    expect(matchNumber(temporalVote([]), 23).matches).toBe(false);
  });

  it("flags 23 vs 28 as a confusable misread rather than a clean rejection", () => {
    const m = matchNumber(temporalVote([obs(0, 28, 0.95), obs(5, 28, 0.95)]), 23);
    expect(m.matches).toBe(false);
    expect(m.confusable).toBe(true);
  });

  it("does not flag genuinely different numbers as confusable", () => {
    const m = matchNumber(temporalVote([obs(0, 55, 0.95), obs(5, 55, 0.95)]), 23);
    expect(m.confusable).toBe(false);
  });

  it("compares 7 and 07 at the same glyph width", () => {
    const m = matchNumber(temporalVote([obs(0, 1, 0.95), obs(5, 1, 0.95)]), 7);
    expect(m.matches).toBe(false);
    expect(m.confusable).toBe(true);
  });
});

describe("isValidJerseyNumber", () => {
  it("accepts 0 through 99 and nothing else", () => {
    expect(isValidJerseyNumber(0)).toBe(true);
    expect(isValidJerseyNumber(99)).toBe(true);
    expect(isValidJerseyNumber(100)).toBe(false);
    expect(isValidJerseyNumber(-1)).toBe(false);
    expect(isValidJerseyNumber(23.5)).toBe(false);
  });
});
