import { describe, expect, it } from "vitest";
import { PRESETS, planSingle, planStory, preset } from "./planner";
import { intimacyRank } from "./vocabulary";
import { isInteractionType } from "./vocabulary";
import type { CastMemberId } from "./types";

const CAST: readonly CastMemberId[] = ["person_a", "person_b"];

describe("presets", () => {
  it("ships the six presets the brief names, plus the group progression", () => {
    expect(PRESETS.map((p) => p.slug)).toEqual([
      "luxury-suite",
      "date-night",
      "tuscany",
      "island-escape",
      "cozy-night",
      "group-night",
      "group-progression",
    ]);
  });

  it("gives every preset exactly six beats", () => {
    for (const p of PRESETS) expect(p.beats).toHaveLength(6);
  });

  it("uses only interactions from the closed vocabulary", () => {
    // A preset that names an act outside the vocabulary would be a way to
    // reach one without a user ever typing it.
    for (const p of PRESETS) {
      for (const beat of p.beats) {
        expect(isInteractionType(beat.interaction)).toBe(true);
      }
    }
  });

  it("never escalates backwards within a preset", () => {
    for (const p of PRESETS) {
      const ranks = p.beats.map((b) => intimacyRank(b.intimacy));
      // The last beat is never gentler than the first: a story has a shape.
      expect(ranks[ranks.length - 1]).toBeGreaterThanOrEqual(ranks[0]!);
    }
  });

  it("returns null for an unknown slug", () => {
    expect(preset("nope")).toBeNull();
  });
});

describe("planStory", () => {
  it("builds six numbered beats", () => {
    const plan = planStory("luxury-suite", CAST, 6);
    expect(plan.scenes.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(plan.scenes.map((s) => s.title)).toEqual([
      "Arrival",
      "Close Conversation",
      "Cuddle",
      "Whisper",
      "Kiss",
      "Goodnight",
    ]);
  });

  it("derives a 3-scene plan with an opening, a turn and a close", () => {
    const plan = planStory("luxury-suite", CAST, 3);
    // Not beats 1-2-3, which would be three openings and no story.
    expect(plan.scenes.map((s) => s.title)).toEqual([
      "Arrival",
      "Whisper",
      "Goodnight",
    ]);
    expect(plan.scenes.map((s) => s.number)).toEqual([1, 2, 3]);
  });

  it("uses the emotional peak for a single scene", () => {
    expect(planStory("luxury-suite", CAST, 1).scenes[0]?.title).toBe("Kiss");
  });

  it("substitutes rather than truncates when a ceiling is set", () => {
    const plan = planStory("luxury-suite", CAST, 6, { ceiling: "warm" });
    // Still six scenes — a user who chose Warm gets a whole story.
    expect(plan.scenes).toHaveLength(6);
    for (const scene of plan.scenes) {
      expect(intimacyRank(scene.intimacy)).toBeLessThanOrEqual(intimacyRank("warm"));
    }
    // And the beat keeps its title, so the storyboard still reads as a story.
    expect(plan.scenes[4]?.title).toBe("Kiss");
    expect(plan.scenes[4]?.interaction).not.toBe("kiss");
  });

  it("never stages the same action twice in a row after capping", () => {
    // Found by running the page: capping Luxury Suite at Passionate gave
    // scene 5 "Kiss" and scene 6 "Goodnight", both staged as a kiss.
    for (const p of PRESETS) {
      for (const ceiling of ["warm", "romantic", "passionate"] as const) {
        const plan = planStory(p.slug, CAST, 6, { ceiling });
        const acts = plan.scenes.map((s) => s.interaction);
        for (let i = 1; i < acts.length; i += 1) {
          expect(
            acts[i],
            `${p.slug} at ${ceiling}: scene ${i + 1} repeats scene ${i}`,
          ).not.toBe(acts[i - 1]);
        }
      }
    }
  });

  it("keeps a capped beat's own title, so the story still reads as one", () => {
    // WHICH permitted action stands in is a taste judgement and is deliberately
    // not frozen here. What must hold is that the beat keeps its name and does
    // not exceed the ceiling.
    const plan = planStory("luxury-suite", CAST, 6, { ceiling: "passionate" });
    const close = plan.scenes[5];
    expect(close?.title).toBe("Goodnight");
    expect(intimacyRank(close!.intimacy)).toBeLessThanOrEqual(
      intimacyRank("passionate"),
    );
  });

  it("leaves beats alone when they are already under the ceiling", () => {
    const plan = planStory("luxury-suite", CAST, 6, { ceiling: "private-romance" });
    expect(plan.scenes[4]?.interaction).toBe("kiss");
  });

  it("accepts a custom title", () => {
    expect(planStory("tuscany", CAST, 3, { title: "Our Trip" }).title).toBe("Our Trip");
  });

  it("throws on an unknown preset", () => {
    expect(() => planStory("nope", CAST, 3)).toThrow(/unknown_preset/);
  });
});

describe("planSingle", () => {
  it("builds a one-beat plan with no preset", () => {
    const plan = planSingle(CAST, "embrace", "romantic");
    expect(plan.presetSlug).toBeNull();
    expect(plan.scenes).toHaveLength(1);
  });
});
