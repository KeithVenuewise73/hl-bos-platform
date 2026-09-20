import { describe, expect, it } from "vitest";
import { STORY_PRESETS, planStoryScenes, type StoryInput } from "./sceneflow-story";

function input(overrides: Partial<StoryInput> = {}): StoryInput {
  return {
    castSize: 2,
    adultConfirmed: true,
    permissionConfirmed: true,
    presetSlug: "luxury-suite",
    scenes: 6,
    intimacy: "private-romance",
    reciprocal: false,
    setting: "luxury suite",
    wardrobe: "evening wear",
    customDirection: "",
    ...overrides,
  };
}

describe("the presets reach the console", () => {
  it("offers all seven", () => {
    expect(STORY_PRESETS).toHaveLength(7);
    expect(STORY_PRESETS.map((p) => p.slug)).toContain("luxury-suite");
    expect(STORY_PRESETS.map((p) => p.slug)).toContain("group-progression");
  });
});

describe("a six-scene story", () => {
  const out = planStoryScenes(input());

  it("plans six numbered panels", () => {
    expect(out.kind).toBe("planned");
    if (out.kind !== "planned") return;
    expect(out.panels.map((p) => p.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(out.title).toBe("Luxury Suite");
  });

  it("gives each panel its own instruction", () => {
    if (out.kind !== "planned") return;
    const prompts = new Set(out.panels.map((p) => p.prompt));
    // Six identical prompts would be six versions of one moment, not a story.
    expect(prompts.size).toBe(6);
  });

  it("carries continuity: every panel after the first names the one before", () => {
    if (out.kind !== "planned") return;
    expect(out.panels[0]?.prompt).not.toContain("PREVIOUS SCENE");
    expect(out.panels[1]?.prompt).toContain("PREVIOUS SCENE");
    expect(out.panels[1]?.prompt).toContain("Arrival");
    expect(out.panels[5]?.prompt).toContain("Kiss");
  });

  it("never claims a picture was made", () => {
    if (out.kind !== "planned") return;
    expect(out.modelConnected).toBe(false);
  });

  it("ends the safety clause on every single panel", () => {
    if (out.kind !== "planned") return;
    for (const panel of out.panels) {
      expect(panel.prompt.trimEnd().endsWith("non-explicit.")).toBe(true);
    }
  });
});

describe("a three-scene story", () => {
  it("is an opening, a turn and a close — not the first three beats", () => {
    const out = planStoryScenes(input({ scenes: 3 }));
    if (out.kind !== "planned") throw new Error("expected a plan");
    expect(out.panels.map((p) => p.title)).toEqual(["Arrival", "Whisper", "Goodnight"]);
  });
});

describe("the intimacy ceiling holds across the whole story", () => {
  it("still gives six panels at Warm, rather than four and a gap", () => {
    const out = planStoryScenes(input({ intimacy: "warm" }));
    if (out.kind !== "planned") throw new Error("expected a plan");
    expect(out.panels).toHaveLength(6);
  });

  it("stages nothing above the level that was chosen", () => {
    const out = planStoryScenes(input({ intimacy: "warm" }));
    if (out.kind !== "planned") throw new Error("expected a plan");
    const all = out.panels.flatMap((p) => p.interactions).join(" ");
    expect(all).not.toContain("conventional kiss");
  });

  it("allows the kiss once the level is raised", () => {
    const out = planStoryScenes(input({ intimacy: "passionate" }));
    if (out.kind !== "planned") throw new Error("expected a plan");
    expect(out.panels.flatMap((p) => p.interactions).join(" ")).toContain(
      "conventional kiss",
    );
  });
});

describe("the safety boundary applies to a whole story too", () => {
  it("refuses an explicit direction before planning anything", () => {
    const out = planStoryScenes(input({ customDirection: "make them have sex" }));
    expect(out.kind).toBe("refused");
    if (out.kind !== "refused") return;
    expect(out.stage).toBe("policy");
    expect(out.alternative).not.toBeNull();
  });

  it("refuses a minor framing with nothing offered", () => {
    const out = planStoryScenes(input({ setting: "a high school gym" }));
    expect(out.kind).toBe("refused");
    if (out.kind !== "refused") return;
    expect(out.alternative).toBeNull();
  });

  it("refuses without the attestation", () => {
    const out = planStoryScenes(input({ permissionConfirmed: false }));
    expect(out.kind).toBe("refused");
    if (out.kind !== "refused") return;
    expect(out.stage).toBe("attestation");
  });
});

describe("a group story", () => {
  const out = planStoryScenes(input({ castSize: 6, presetSlug: "group-progression" }));

  it("keeps all six people in every panel", () => {
    if (out.kind !== "planned") throw new Error("expected a plan");
    for (const panel of out.panels) expect(panel.placements).toHaveLength(6);
  });

  it("never drops anyone out of the frame", () => {
    if (out.kind !== "planned") throw new Error("expected a plan");
    for (const panel of out.panels) {
      const named = panel.interactions.join(" ");
      for (const label of ["Person A", "Person F"]) expect(named).toContain(label);
    }
  });
});

describe("reciprocal affection across a story", () => {
  it("returns touches when asked, and not otherwise", () => {
    const on = planStoryScenes(
      input({ presetSlug: "group-progression", castSize: 4, reciprocal: true }),
    );
    const off = planStoryScenes(
      input({ presetSlug: "group-progression", castSize: 4, reciprocal: false }),
    );
    if (on.kind !== "planned" || off.kind !== "planned")
      throw new Error("expected plans");
    const onText = on.panels.flatMap((p) => p.interactions).join(" ");
    const offText = off.panels.flatMap((p) => p.interactions).join(" ");
    expect(onText).toContain("(returned)");
    expect(offText).not.toContain("(returned)");
  });
});
