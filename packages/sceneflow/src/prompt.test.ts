import { describe, expect, it } from "vitest";
import { composePrompt, composeVariationPrompt } from "./prompt.js";
import { buildContinuityContext, castDescriptions } from "./continuity.js";
import { DEFAULT_SCENE_LOCK, unlock } from "./sceneLock.js";
import { sampleCast, sampleScene } from "./mock/fixtures.js";
import type { SceneLock } from "./types.js";

const cast = sampleCast(4);
const parent = sampleScene(cast);

function build(lock: SceneLock = DEFAULT_SCENE_LOCK, focus: string[] = []) {
  const context = buildContinuityContext({
    storyId: "s1",
    cast,
    parentScene: parent,
    parentSceneId: "scene-3",
    previousSceneDescription: "They were talking on the sofa.",
    narrativePosition: 4,
    lock,
    changes: focus.length > 0 ? { focusCharacterIds: focus as never } : {},
    interactions: [{ actors: ["person_a", "person_b"], type: "embrace" }],
  });
  return composePrompt({
    context,
    characterDescriptions: castDescriptions(cast),
    sceneDescription: "They embrace by the window.",
    lock,
    aspectRatio: "4:5",
  });
}

describe("composePrompt", () => {
  it("is deterministic", () => {
    expect(build().text).toBe(build().text);
  });

  it("states cast, positions, interactions, environment and wardrobe", () => {
    const text = build().text;
    for (const heading of [
      "PRESERVE CAST",
      "CURRENT POSITIONS",
      "CURRENT INTERACTIONS",
      "ENVIRONMENT",
      "WARDROBE",
      "NEXT MOMENT",
      "CONTINUITY",
      "VISUAL QUALITY",
      "REAL-PERSON SAFETY",
    ]) {
      expect(text).toContain(heading);
    }
  });

  it("always ends with the safety clause, whatever else is in the prompt", () => {
    const text = build(unlock(DEFAULT_SCENE_LOCK, "room")).text;
    const safetyAt = text.indexOf("REAL-PERSON SAFETY");
    expect(safetyAt).toBeGreaterThan(-1);
    expect(text.slice(safetyAt)).toContain("Keep intimate anatomy covered");
    expect(text.indexOf("VISUAL QUALITY")).toBeLessThan(safetyAt);
  });

  it("names what each character is wearing, or says to keep the source", () => {
    expect(build().text).toContain("Person A: dark evening dress");
  });

  it("carries every character reference for identity conditioning", () => {
    expect(build().referencePaths).toHaveLength(4);
  });

  it("drops an unlocked attribute from the continuity promise", () => {
    expect(build().text).toContain("the same location");
    expect(build(unlock(DEFAULT_SCENE_LOCK, "room")).text).not.toContain(
      "the same location",
    );
  });

  it("tells the generator not to delete the rest of the cast when a pair is in focus", () => {
    const text = build(DEFAULT_SCENE_LOCK, ["person_a", "person_d"]).text;
    expect(text).toContain("FOCUS");
    expect(text).toContain("must not be removed from the frame");
  });

  it("includes the previous scene so the next one continues from it", () => {
    expect(build().text).toContain("They were talking on the sofa.");
  });
});

describe("composeVariationPrompt", () => {
  it("holds everything and varies only expression, angle and framing", () => {
    const context = buildContinuityContext({
      storyId: "s1",
      cast,
      parentScene: parent,
      parentSceneId: "scene-3",
      previousSceneDescription: "",
      narrativePosition: 4,
      lock: DEFAULT_SCENE_LOCK,
      changes: {},
      interactions: [],
    });
    const text = composeVariationPrompt({
      context,
      characterDescriptions: castDescriptions(cast),
      sceneDescription: "They embrace.",
      lock: DEFAULT_SCENE_LOCK,
      aspectRatio: "1:1",
    }).text;
    expect(text).toContain("VARIATION");
    expect(text).toContain("not a new moment");
    expect(text).toContain("REAL-PERSON SAFETY");
  });
});
