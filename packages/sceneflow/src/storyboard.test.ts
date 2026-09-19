import { describe, expect, it } from "vitest";
import { collageLabels, collageLayout, generateStoryboard } from "./storyboard.js";
import { planStory } from "./planner.js";
import { MockImageProvider, MockModerationProvider } from "./mock/providers.js";
import { sampleSceneRequest } from "./mock/fixtures.js";
import type { PanelProgress } from "./storyboard.js";

function request(scenes: 3 | 6 = 6) {
  const base = sampleSceneRequest({
    type: scenes === 6 ? "story-6" : "story-3",
    intimacyCeiling: "passionate",
  });
  const { sceneDescription: _d, narrativePosition: _n, jobId: _j, ...rest } = base;
  return {
    base: rest,
    plan: planStory("luxury-suite", ["person_a", "person_b"], scenes, {
      ceiling: "passionate",
    }),
    jobIdFor: (n: number) => `job-${n}`,
  };
}

const deps = (image: MockImageProvider) => ({
  image,
  moderation: new MockModerationProvider(),
});

describe("generateStoryboard", () => {
  it("generates panels individually, never as one collage request", async () => {
    const image = new MockImageProvider({ observedCharacterCount: 4 });
    const result = await generateStoryboard(request(6), deps(image));
    expect(image.calls).toHaveLength(6);
    expect(result.delivered).toBe(6);
    for (const call of image.calls) {
      expect(call.prompt).not.toMatch(/collage|grid|panel/i);
    }
  });

  it("carries continuity forward so each panel follows the one before it", async () => {
    const image = new MockImageProvider({ observedCharacterCount: 4 });
    await generateStoryboard(request(3), deps(image));
    // Panel 1 has no previous scene; panels 2 and 3 name theirs.
    expect(image.calls[0]?.prompt).not.toContain("PREVIOUS SCENE");
    expect(image.calls[1]?.prompt).toContain("PREVIOUS SCENE");
    expect(image.calls[1]?.prompt).toContain("Arrival");
    expect(image.calls[2]?.prompt).toContain("Whisper");
  });

  it("reports progress as named stages, never a percentage", async () => {
    const seen: PanelProgress[][] = [];
    await generateStoryboard(
      request(3),
      deps(new MockImageProvider({ observedCharacterCount: 4 })),
      (panels) => seen.push(panels.map((p) => ({ ...p }))),
    );
    const stages = new Set(seen.flat().map((p) => p.stage));
    expect(stages.has("creating")).toBe(true);
    expect(stages.has("done")).toBe(true);
    for (const panel of seen.flat()) {
      expect(typeof panel.stage).toBe("string");
      expect(panel.stage).not.toMatch(/\d/);
    }
  });

  it("keeps scenes 1-3 when scene 4 fails, and charges only for what landed", async () => {
    const image = new MockImageProvider({
      observedCharacterCount: 4,
      scriptedResults: [
        {},
        {},
        {},
        { status: "failed", errorCode: "invalid_request" },
        {},
        {},
      ],
    });
    const result = await generateStoryboard(request(6), deps(image));
    expect(result.delivered).toBe(5);
    expect(result.panels[3]?.outcome.outcome).toBe("failed");
    expect(result.panels[0]?.outcome.outcome).toBe("generated");
    expect(result.retryable).toEqual([4]);
    expect(result.settlement.charge).toBe(5);
    expect(result.settlement.refund).toBe(1);
  });

  it("stops on a refusal rather than repeating the same rejection five times", async () => {
    const image = new MockImageProvider({ observedCharacterCount: 4 });
    const req = request(6);
    const result = await generateStoryboard(
      {
        ...req,
        base: { ...req.base, customFields: { direction: "show them naked" } },
      },
      deps(image),
    );
    expect(image.calls).toHaveLength(0);
    expect(result.panels).toHaveLength(1);
    expect(result.delivered).toBe(0);
    expect(result.settlement.charge).toBe(0);
  });

  it("refunds everything when no panel was produced", async () => {
    const image = new MockImageProvider({
      scriptedResults: Array.from({ length: 6 }, () => ({
        status: "failed" as const,
        errorCode: "invalid_request",
      })),
    });
    const result = await generateStoryboard(request(6), deps(image));
    expect(result.delivered).toBe(0);
    expect(result.settlement.charge).toBe(0);
    expect(result.settlement.refund).toBe(6);
  });
});

describe("collage", () => {
  it("lays six panels out as 2 x 3", () => {
    expect(collageLayout(6)).toEqual({ rows: 2, columns: 3 });
    expect(collageLayout(3)).toEqual({ rows: 1, columns: 3 });
    expect(collageLayout(1)).toEqual({ rows: 1, columns: 1 });
  });

  it("labels only the panels that actually produced an image", async () => {
    const image = new MockImageProvider({
      observedCharacterCount: 4,
      scriptedResults: [{}, { status: "failed", errorCode: "invalid_request" }, {}],
    });
    const result = await generateStoryboard(request(3), deps(image));
    const labels = collageLabels(result);
    expect(labels).toHaveLength(2);
    expect(labels).not.toContain("2. WHISPER");
  });
});
