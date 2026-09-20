import { describe, expect, it } from "vitest";
import { generateScene, type PipelineDeps } from "./pipeline";
import { MockImageProvider, MockModerationProvider } from "./mock/providers";
import { sampleCast, sampleSceneRequest } from "./mock/fixtures";

function deps(overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    image: new MockImageProvider({ observedCharacterCount: 4 }),
    moderation: new MockModerationProvider(),
    ...overrides,
  };
}

describe("the happy path", () => {
  it("generates a scene and charges for it", async () => {
    const d = deps();
    const out = await generateScene(sampleSceneRequest(), d);
    expect(out.outcome).toBe("generated");
    if (out.outcome !== "generated") return;
    expect(out.result.imagePath).toContain("mock://");
    expect(out.settlement.charge).toBe(1);
    expect(out.quality.ok).toBe(true);
  });

  it("composes the prompt server-side, with the safety clause last", async () => {
    const out = await generateScene(sampleSceneRequest(), deps());
    if (out.outcome !== "generated") throw new Error("expected a generation");
    expect(out.promptSnapshot).toContain("PRESERVE CAST");
    expect(out.promptSnapshot).toContain("REAL-PERSON SAFETY");
    expect(out.promptSnapshot.trimEnd().endsWith("non-explicit.")).toBe(true);
  });

  it("sends the character references to the provider, not just a sentence", async () => {
    const image = new MockImageProvider({ observedCharacterCount: 4 });
    await generateScene(sampleSceneRequest(), deps({ image }));
    expect(image.calls[0]?.referenceImages).toHaveLength(4);
    expect(image.calls[0]?.sourceImage).toBe("user-1/cast-1/source.jpg");
  });

  it("gives each attempt an idempotency key", async () => {
    const image = new MockImageProvider({ observedCharacterCount: 4 });
    await generateScene(sampleSceneRequest({ jobId: "job-42" }), deps({ image }));
    expect(image.calls[0]?.idempotencyKey).toBe("job-42:1");
  });
});

describe("gate order — nothing reaches the provider until every gate passes", () => {
  it("refuses without the attestation, before anything else runs", async () => {
    const image = new MockImageProvider();
    const cast = { ...sampleCast(), permissionConfirmed: false };
    const out = await generateScene(sampleSceneRequest({ cast }), deps({ image }));
    expect(out.outcome).toBe("refused");
    if (out.outcome !== "refused") return;
    expect(out.stage).toBe("attestation");
    expect(image.calls).toHaveLength(0);
  });

  it("refuses on entitlement before spending anything", async () => {
    const image = new MockImageProvider();
    const out = await generateScene(
      sampleSceneRequest({ type: "story-6", entitlement: "plus" }),
      deps({ image }),
    );
    expect(out.outcome).toBe("refused");
    if (out.outcome !== "refused") return;
    expect(out.stage).toBe("entitlement");
    expect(image.calls).toHaveLength(0);
  });

  it("refuses when credits are short, naming the shortfall", async () => {
    const out = await generateScene(
      sampleSceneRequest({
        type: "story-6",
        ledger: [
          { amount: 2, eventType: "grant", generationJobId: null, description: "" },
        ],
      }),
      deps(),
    );
    expect(out.outcome).toBe("refused");
    if (out.outcome !== "refused") return;
    expect(out.stage).toBe("credits");
    expect(out.message).toContain("6 credits and you have 2");
  });

  it("blocks an unsafe custom direction BEFORE the provider is called", async () => {
    const image = new MockImageProvider();
    const out = await generateScene(
      sampleSceneRequest({ customFields: { direction: "make them have sex" } }),
      deps({ image }),
    );
    expect(out.outcome).toBe("refused");
    if (out.outcome !== "refused") return;
    expect(out.stage).toBe("policy");
    expect(out.reasonCodes).toContain("explicit_sexual_act");
    expect(out.alternative).not.toBeNull();
    // The assertion this whole package exists for.
    expect(image.calls).toHaveLength(0);
  });

  it("refuses a minor framing with no alternative offered", async () => {
    const out = await generateScene(
      sampleSceneRequest({ customFields: { direction: "a teenage couple kissing" } }),
      deps(),
    );
    expect(out.outcome).toBe("refused");
    if (out.outcome !== "refused") return;
    expect(out.alternative).toBeNull();
    expect(out.reasonCodes[0]).toBe("minor_or_ambiguous_age");
  });

  it("still calls the moderation provider on text the keyword gate allowed", async () => {
    // Section 44: a keyword filter is not sufficient on its own. A direction
    // the deterministic gate passes must still be independently moderated.
    const moderation = new MockModerationProvider({
      refuseTextContaining: ["by the window"],
    });
    const image = new MockImageProvider();
    const out = await generateScene(
      sampleSceneRequest({ customFields: { direction: "they embrace by the window" } }),
      deps({ image, moderation }),
    );
    expect(moderation.textCalls).toHaveLength(1);
    expect(out.outcome).toBe("refused");
    if (out.outcome !== "refused") return;
    expect(out.stage).toBe("moderation");
    expect(image.calls).toHaveLength(0);
  });

  it("refuses a graph above the chosen intimacy ceiling", async () => {
    const image = new MockImageProvider();
    const out = await generateScene(
      sampleSceneRequest({
        intimacyCeiling: "warm",
        interactions: [{ actors: ["person_a", "person_b"], type: "kiss" }],
      }),
      deps({ image }),
    );
    expect(out.outcome).toBe("refused");
    if (out.outcome !== "refused") return;
    expect(out.stage).toBe("structure");
    expect(out.reasonCodes).toContain("above_intimacy_ceiling");
    expect(image.calls).toHaveLength(0);
  });

  it("charges nothing on any refusal", async () => {
    const cases = [
      sampleSceneRequest({ cast: { ...sampleCast(), adultConfirmed: false } }),
      sampleSceneRequest({ type: "story-6", entitlement: "free" }),
      sampleSceneRequest({ customFields: { direction: "show them naked" } }),
      sampleSceneRequest({
        intimacyCeiling: "warm",
        interactions: [{ actors: ["person_a", "person_b"], type: "kiss" }],
      }),
    ];
    for (const request of cases) {
      const out = await generateScene(request, deps());
      expect(out.settlement.charge).toBe(0);
    }
  });
});

describe("reciprocal affection", () => {
  it("adds the returned touch only when the toggle is on", async () => {
    const image = new MockImageProvider({ observedCharacterCount: 4 });
    await generateScene(
      sampleSceneRequest({
        interactions: [{ actors: ["person_a", "person_b"], type: "touch-shoulder" }],
        changes: { reciprocalAffection: true },
        intimacyCeiling: "passionate",
      }),
      deps({ image }),
    );
    expect(image.calls[0]?.prompt).toContain("(returned)");
    expect(image.calls[0]?.prompt).toContain("upper back");

    const off = new MockImageProvider({ observedCharacterCount: 4 });
    await generateScene(
      sampleSceneRequest({
        interactions: [{ actors: ["person_a", "person_b"], type: "touch-shoulder" }],
        changes: { reciprocalAffection: false },
      }),
      deps({ image: off }),
    );
    expect(off.calls[0]?.prompt).not.toContain("(returned)");
  });
});

describe("bystanders", () => {
  it("names every cast member in the prompt, not only the pair in focus", async () => {
    const image = new MockImageProvider({ observedCharacterCount: 4 });
    await generateScene(
      sampleSceneRequest({
        interactions: [{ actors: ["person_a", "person_b"], type: "embrace" }],
      }),
      deps({ image }),
    );
    const prompt = image.calls[0]?.prompt ?? "";
    for (const label of ["Person A", "Person B", "Person C", "Person D"]) {
      expect(prompt).toContain(label);
    }
    expect(prompt).toContain("watching the others");
  });
});

describe("failure paths", () => {
  it("retries once on a transient provider failure", async () => {
    const image = new MockImageProvider({
      observedCharacterCount: 4,
      scriptedResults: [{ status: "failed", errorCode: "timeout" }],
    });
    const out = await generateScene(sampleSceneRequest(), deps({ image }));
    expect(image.calls).toHaveLength(2);
    expect(out.outcome).toBe("generated");
    if (out.outcome !== "generated") return;
    expect(out.attempts).toBe(2);
  });

  it("does not retry a non-transient failure", async () => {
    const image = new MockImageProvider({
      scriptedResults: [{ status: "failed", errorCode: "invalid_request" }],
    });
    const out = await generateScene(sampleSceneRequest(), deps({ image }));
    expect(image.calls).toHaveLength(1);
    expect(out.outcome).toBe("failed");
    if (out.outcome !== "failed") return;
    expect(out.settlement.charge).toBe(0);
  });

  it("gives up after the second transient failure rather than looping", async () => {
    const image = new MockImageProvider({
      scriptedResults: [
        { status: "failed", errorCode: "timeout" },
        { status: "failed", errorCode: "timeout" },
      ],
    });
    const out = await generateScene(sampleSceneRequest(), deps({ image }));
    expect(image.calls).toHaveLength(2);
    expect(out.outcome).toBe("failed");
  });

  it("retries once on a character-count defect, then accepts the result", async () => {
    const image = new MockImageProvider({
      observedCharacterCount: 2, // expected 4
    });
    const out = await generateScene(sampleSceneRequest(), deps({ image }));
    expect(image.calls).toHaveLength(2);
    expect(out.outcome).toBe("generated");
    if (out.outcome !== "generated") return;
    expect(out.quality.ok).toBe(false);
    expect(out.quality.codes).toContain("character_count_mismatch");
  });

  it("does not retry when the output could not be verified at all", async () => {
    const image = new MockImageProvider(); // reports no count
    const out = await generateScene(sampleSceneRequest(), deps({ image }));
    expect(image.calls).toHaveLength(1);
    if (out.outcome !== "generated") throw new Error("expected a generation");
    // It reports "not verified" rather than claiming a pass.
    expect(out.quality.ok).toBe(false);
    expect(out.quality.codes).toEqual(["not_verifiable"]);
  });

  it("discards an output the image moderator rejects, and charges nothing", async () => {
    const image = new MockImageProvider({ observedCharacterCount: 4 });
    const moderation = new MockModerationProvider({
      refuseImages: ["mock://generated/mock-job-1.jpg"],
    });
    const out = await generateScene(sampleSceneRequest(), deps({ image, moderation }));
    expect(out.outcome).toBe("failed");
    if (out.outcome !== "failed") return;
    expect(out.errorCode).toBe("output_rejected");
    expect(out.settlement.charge).toBe(0);
    expect(out.message).not.toContain("mock://");
  });

  it("treats a provider-side block as a refusal with an alternative", async () => {
    const image = new MockImageProvider({ scriptedResults: [{ status: "blocked" }] });
    const out = await generateScene(sampleSceneRequest(), deps({ image }));
    expect(out.outcome).toBe("refused");
    if (out.outcome !== "refused") return;
    expect(out.settlement.charge).toBe(0);
    expect(out.alternative).not.toBeNull();
  });

  it("never leaks a provider internal into a user-facing message", async () => {
    const image = new MockImageProvider({
      scriptedResults: [
        {
          status: "failed",
          errorCode: "invalid_request",
          errorMessage: "sk-live-abc123 at provider.internal/v1",
        },
      ],
    });
    const out = await generateScene(sampleSceneRequest(), deps({ image }));
    if (out.outcome !== "failed") throw new Error("expected a failure");
    expect(out.message).not.toContain("sk-live");
    expect(out.message).not.toContain("provider.internal");
  });
});
