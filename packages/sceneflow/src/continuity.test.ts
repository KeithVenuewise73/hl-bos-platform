import { describe, expect, it } from "vitest";
import { buildContinuityContext, describeChanges, nextSceneState } from "./continuity";
import { DEFAULT_SCENE_LOCK, resolveAttributes, unlock } from "./sceneLock";
import { sampleCast, sampleScene } from "./mock/fixtures";
import type { SceneChangeRequest, SceneLock } from "./types";

const cast = sampleCast(4);
const parent = sampleScene(cast);

function context(lock: SceneLock, changes: SceneChangeRequest) {
  return buildContinuityContext({
    storyId: "story-1",
    cast,
    parentScene: parent,
    parentSceneId: "scene-3",
    previousSceneDescription: "They were talking on the sofa.",
    narrativePosition: 4,
    lock,
    changes,
    interactions: [{ actors: ["person_a", "person_b"], type: "embrace" }],
  });
}

describe("inheritance precedence", () => {
  it("carries the room, wardrobe and lighting forward when nothing is unlocked", () => {
    const ctx = context(DEFAULT_SCENE_LOCK, {});
    expect(ctx.environment.type).toBe(parent.environment.type);
    expect(ctx.lighting).toBe("warm amber");
    expect(ctx.wardrobeMap).toEqual(parent.wardrobe);
    expect(ctx.timeOfDay).toBe("night");
  });

  it("lets an explicit change override a LOCKED environment attribute", () => {
    // Precedence rule 2: asking for a new location while "Room" is still
    // ticked is a contradiction, and the user's explicit ask wins.
    const ctx = context(DEFAULT_SCENE_LOCK, {
      environment: { type: "beach at sunset" },
    });
    expect(ctx.environment.type).toBe("beach at sunset");
    expect(ctx.lighting).toBe("warm amber");
  });

  it("merges a partial wardrobe change over the inherited map", () => {
    const ctx = context(DEFAULT_SCENE_LOCK, { wardrobe: { person_b: "silk robe" } });
    expect(ctx.wardrobeMap["person_b"]).toBe("silk robe");
    expect(ctx.wardrobeMap["person_a"]).toBe(parent.wardrobe["person_a"]);
  });

  it("never lets identity be overridden — it is not an unlockable attribute", () => {
    const ctx = context(unlock(DEFAULT_SCENE_LOCK, "room"), {
      environment: { type: "penthouse" },
    });
    expect(ctx.cast).toEqual(["person_a", "person_b", "person_c", "person_d"]);
    expect(ctx.characterDescriptors["person_a"]).toEqual(cast.members[0]?.appearance);
    expect(Object.keys(ctx.characterReferences)).toHaveLength(4);
  });

  it("reports an unlocked attribute with no explicit change as free", () => {
    const resolved = resolveAttributes(
      parent,
      unlock(DEFAULT_SCENE_LOCK, "camera"),
      {},
    );
    expect(resolved.free).toContain("camera");
  });

  it("does not report an unlocked attribute as free once it is set explicitly", () => {
    const resolved = resolveAttributes(parent, unlock(DEFAULT_SCENE_LOCK, "camera"), {
      camera: { shot: "closer" },
    });
    expect(resolved.free).not.toContain("camera");
    expect(resolved.camera.shot).toBe("closer");
  });

  it("treats an explicit change as an implied unlock", () => {
    const resolved = resolveAttributes(parent, DEFAULT_SCENE_LOCK, {
      wardrobe: { person_a: "sleepwear" },
    });
    expect(resolved.wardrobe["person_a"]).toBe("sleepwear");
  });
});

describe("focus characters", () => {
  it("keeps the whole cast present even when a pair is in focus", () => {
    const ctx = context(DEFAULT_SCENE_LOCK, {
      focusCharacterIds: ["person_a", "person_d"],
    });
    expect(ctx.cast).toHaveLength(4);
    expect(ctx.focusCharacterIds).toEqual(["person_a", "person_d"]);
  });

  it("drops a stale focus id that is no longer in the cast", () => {
    // A branch taken before someone was removed must not put them back.
    const ctx = context(DEFAULT_SCENE_LOCK, {
      focusCharacterIds: ["person_a", "person_h"],
    });
    expect(ctx.focusCharacterIds).toEqual(["person_a"]);
  });
});

describe("nextSceneState", () => {
  it("produces the state the following scene will inherit", () => {
    const ctx = context(DEFAULT_SCENE_LOCK, { environment: { type: "balcony" } });
    const next = nextSceneState(ctx, parent);
    expect(next.environment.type).toBe("balcony");
    expect(next.characters.map((c) => c.id)).toEqual(ctx.cast);
    expect(next.interactions).toEqual(ctx.currentInteractionGraph);
  });

  it("chains: scene 3 -> scene 4 -> scene 5 keeps the changed location", () => {
    const three = nextSceneState(context(DEFAULT_SCENE_LOCK, {}), parent);
    const four = nextSceneState(
      buildContinuityContext({
        storyId: "s",
        cast,
        parentScene: three,
        parentSceneId: "3",
        previousSceneDescription: "",
        narrativePosition: 4,
        lock: DEFAULT_SCENE_LOCK,
        changes: { environment: { type: "bedroom" } },
        interactions: [],
      }),
      three,
    );
    expect(four.environment.type).toBe("bedroom");

    const five = nextSceneState(
      buildContinuityContext({
        storyId: "s",
        cast,
        parentScene: four,
        parentSceneId: "4",
        previousSceneDescription: "",
        narrativePosition: 5,
        lock: DEFAULT_SCENE_LOCK,
        changes: {},
        interactions: [],
      }),
      four,
    );
    // The change made at scene 4 must still be there at scene 5.
    expect(five.environment.type).toBe("bedroom");
  });
});

describe("describeChanges", () => {
  it("says plainly when nothing changed", () => {
    expect(describeChanges(parent, context(DEFAULT_SCENE_LOCK, {}))[0]).toContain(
      "carried over",
    );
  });

  it("names what actually moved", () => {
    const notes = describeChanges(
      parent,
      context(DEFAULT_SCENE_LOCK, {
        environment: { type: "balcony" },
        wardrobe: { person_a: "sleepwear" },
      }),
    );
    expect(notes.join(" ")).toContain("luxury nighttime suite → balcony");
    expect(notes.join(" ")).toContain("person_a wardrobe");
  });
});
