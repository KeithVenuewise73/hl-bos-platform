import { describe, expect, it } from "vitest";

import { bandFor, describeBand, findPlayerSegments, scoreTrack } from "./identity.ts";
import type { Athlete, Observation, PlayerTrack } from "./types.ts";

const ATHLETE: Athlete = {
  id: "a-1",
  name: "Sam Herman",
  jerseyNumber: "17",
  jerseyColorId: "navy",
  position: "forward",
};

function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    frame: 0,
    timeSeconds: 0,
    box: { x: 100, y: 100, width: 40, height: 90 },
    detectionScore: 0.9,
    jerseyColorId: "navy",
    jerseyColorScore: 0.8,
    jerseyNumber: null,
    jerseyNumberScore: 0,
    ...overrides,
  };
}

function track(observations: Observation[], id = "t-1"): PlayerTrack {
  return { id, observations };
}

const OPTIONS = { detectionSource: "test" } as const;

describe("identity fusion", () => {
  it("returns nothing for an empty track rather than a zero-confidence claim", () => {
    expect(scoreTrack(track([]), ATHLETE, OPTIONS)).toBeNull();
  });

  it("reports the evidence that produced the number, not just the number", () => {
    const segment = scoreTrack(
      track([
        observation({ timeSeconds: 0, jerseyNumber: "17", jerseyNumberScore: 0.9 }),
        observation({ timeSeconds: 1, jerseyNumber: "17", jerseyNumberScore: 0.85 }),
      ]),
      ATHLETE,
      OPTIONS,
    );
    expect(segment).not.toBeNull();
    expect(segment?.evidence.observationCount).toBe(2);
    expect(segment?.evidence.numberReadCount).toBe(2);
    expect(segment?.evidence.colorAgreement).toBeGreaterThan(0.9);
    expect(segment?.detectionSource).toBe("test");
  });

  // The single most important test in this package.
  it("NEVER reaches 'confirmed' on jersey colour alone, however many frames agree", () => {
    const many = Array.from({ length: 500 }, (_, i) =>
      observation({ timeSeconds: i * 0.2, jerseyColorScore: 1 }),
    );
    const segment = scoreTrack(track(many), ATHLETE, OPTIONS);
    expect(segment).not.toBeNull();
    expect(segment?.evidence.numberReadCount).toBe(0);
    // 500 frames of "dark jersey in a dark rink" is one weak observation
    // repeated, not proof.
    expect(segment?.band).not.toBe("confirmed");
  });

  it("reaches 'confirmed' only when the number was read repeatedly and agreed", () => {
    const observations = Array.from({ length: 40 }, (_, i) =>
      observation({
        timeSeconds: i * 0.2,
        jerseyColorScore: 0.95,
        jerseyNumber: "17",
        jerseyNumberScore: 0.95,
      }),
    );
    const segment = scoreTrack(track(observations), ATHLETE, OPTIONS);
    expect(segment?.band).toBe("confirmed");
    expect(segment?.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("treats a wrong number as evidence against, not as a missing read", () => {
    const right = scoreTrack(
      track(
        Array.from({ length: 20 }, (_, i) =>
          observation({ timeSeconds: i * 0.2, jerseyNumber: "17", jerseyNumberScore: 0.9 }),
        ),
      ),
      ATHLETE,
      OPTIONS,
    );
    const wrong = scoreTrack(
      track(
        Array.from({ length: 20 }, (_, i) =>
          observation({ timeSeconds: i * 0.2, jerseyNumber: "23", jerseyNumberScore: 0.9 }),
        ),
      ),
      ATHLETE,
      OPTIONS,
    );
    expect(wrong?.confidence).toBeLessThan(right?.confidence ?? 1);
    // A team-mate in the same jersey is the exact case this must not confirm.
    expect(wrong?.band).not.toBe("confirmed");
  });

  it("forgives a known OCR confusion far more than a genuinely different number", () => {
    const build = (read: string) =>
      scoreTrack(
        track(
          Array.from({ length: 20 }, (_, i) =>
            observation({ timeSeconds: i * 0.2, jerseyNumber: read, jerseyNumberScore: 0.8 }),
          ),
        ),
        ATHLETE,
        OPTIONS,
      );
    // "17" misread as "11" is a 7->1 slip; "23" is somebody else.
    const slip = build("11");
    const other = build("23");
    expect(slip?.confidence).toBeGreaterThan(other?.confidence ?? 1);
  });

  it("does not invent a photo similarity when no photo was given", () => {
    const segment = scoreTrack(track([observation()]), ATHLETE, OPTIONS);
    expect(segment?.evidence.photoSimilarity).toBeNull();
  });

  it("does not penalise a track for a photo the user never uploaded", () => {
    const observations = Array.from({ length: 30 }, (_, i) =>
      observation({
        timeSeconds: i * 0.2,
        jerseyColorScore: 0.95,
        jerseyNumber: "17",
        jerseyNumberScore: 0.95,
      }),
    );
    const without = scoreTrack(track(observations), ATHLETE, OPTIONS);
    const with0 = scoreTrack(track(observations), ATHLETE, {
      ...OPTIONS,
      photoSimilarity: 0,
    });
    // Weight is redistributed, not defaulted: no photo must not score the same
    // as a photo that matched nothing.
    expect(without?.confidence).toBeGreaterThan(with0?.confidence ?? 1);
  });

  it("weights an uncertain read lower than a clear one", () => {
    const clear = scoreTrack(
      track(
        Array.from({ length: 10 }, (_, i) =>
          observation({ timeSeconds: i, jerseyNumber: "17", jerseyNumberScore: 0.95 }),
        ),
      ),
      ATHLETE,
      OPTIONS,
    );
    const murky = scoreTrack(
      track(
        Array.from({ length: 10 }, (_, i) =>
          observation({ timeSeconds: i, jerseyNumber: "17", jerseyNumberScore: 0.2 }),
        ),
      ),
      ATHLETE,
      OPTIONS,
    );
    expect(clear?.confidence).toBeGreaterThan(murky?.confidence ?? 1);
  });

  it("puts a contradicted colour below a matching one", () => {
    const wrongColour = scoreTrack(
      track(
        Array.from({ length: 10 }, (_, i) =>
          observation({ timeSeconds: i, jerseyColorId: "white", jerseyColorScore: 0.9 }),
        ),
      ),
      ATHLETE,
      OPTIONS,
    );
    expect(wrongColour?.confidence).toBeLessThan(0.4);
  });

  it("sorts candidates strongest first and drops the ones below the floor", () => {
    const strong = track(
      Array.from({ length: 20 }, (_, i) =>
        observation({ timeSeconds: i, jerseyNumber: "17", jerseyNumberScore: 0.9 }),
      ),
      "strong",
    );
    const weak = track(
      Array.from({ length: 20 }, (_, i) =>
        observation({
          timeSeconds: i,
          jerseyColorId: "white",
          jerseyColorScore: 0.9,
          jerseyNumber: "4",
          jerseyNumberScore: 0.9,
        }),
      ),
      "weak",
    );
    const segments = findPlayerSegments([weak, strong], ATHLETE, {
      projectId: "p-1",
      detectionSource: "test",
    });
    expect(segments).toHaveLength(1);
    expect(segments[0]?.trackId).toBe("strong");
    expect(segments[0]?.projectId).toBe("p-1");
  });

  it("keeps weak candidates when the caller asks for them", () => {
    const weak = track(
      Array.from({ length: 5 }, (_, i) =>
        observation({ timeSeconds: i, jerseyColorScore: 0.3 }),
      ),
    );
    const segments = findPlayerSegments([weak], ATHLETE, {
      projectId: "p-1",
      detectionSource: "test",
      minConfidence: 0,
    });
    expect(segments.length).toBeGreaterThan(0);
  });

  it("spans the first and last time the track was seen", () => {
    const segment = scoreTrack(
      track([
        observation({ timeSeconds: 12.5 }),
        observation({ timeSeconds: 3.25 }),
        observation({ timeSeconds: 9 }),
      ]),
      ATHLETE,
      OPTIONS,
    );
    expect(segment?.startTime).toBe(3.25);
    expect(segment?.endTime).toBe(12.5);
  });

  it("gates the top band on read count, not on the score alone", () => {
    const oneRead = {
      colorAgreement: 1,
      colorClarity: 0.9,
      numberAgreement: 1,
      numberClarity: 0.9,
      numberReadCount: 1,
      observationCount: 50,
      photoSimilarity: null,
    };
    expect(bandFor(0.99, oneRead)).toBe("likely");
    expect(bandFor(0.99, { ...oneRead, numberReadCount: 2 })).toBe("confirmed");
  });

  it("will not confirm on two agreeing reads that were barely legible", () => {
    expect(
      bandFor(0.99, {
        colorAgreement: 1,
        colorClarity: 0.9,
        numberAgreement: 1,
        numberClarity: 0.2,
        numberReadCount: 6,
        observationCount: 50,
        photoSimilarity: null,
      }),
    ).toBe("likely");
  });

  it("has wording for every band that tells the reader what to do", () => {
    for (const band of ["confirmed", "likely", "possible", "uncertain"] as const) {
      expect(describeBand(band).length).toBeGreaterThan(20);
    }
  });
});
