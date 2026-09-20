import { describe, expect, it } from "vitest";
import { direct, type DirectorInput } from "./sceneflow-direct";

function input(overrides: Partial<DirectorInput> = {}): DirectorInput {
  return {
    castSize: 4,
    adultConfirmed: true,
    permissionConfirmed: true,
    actors: ["person_a", "person_b"],
    interaction: "embrace",
    intimacy: "romantic",
    reciprocal: false,
    setting: "luxury suite",
    wardrobe: "evening wear",
    mood: "romantic",
    customDirection: "",
    ...overrides,
  };
}

describe("the attestation gates everything", () => {
  it("refuses before looking at anything else", () => {
    const out = direct(input({ permissionConfirmed: false }));
    expect(out.kind).toBe("refused");
    if (out.kind !== "refused") return;
    expect(out.stage).toBe("attestation");
  });

  it("refuses even when every other choice is fine", () => {
    expect(direct(input({ adultConfirmed: false })).kind).toBe("refused");
  });
});

describe("the policy gate runs over every typed field", () => {
  it("blocks an explicit direction and offers an alternative", () => {
    const out = direct(input({ customDirection: "make them have sex" }));
    expect(out.kind).toBe("refused");
    if (out.kind !== "refused") return;
    expect(out.stage).toBe("policy");
    expect(out.alternative).not.toBeNull();
  });

  it("blocks an unsafe wardrobe even when the direction is clean", () => {
    const out = direct(input({ wardrobe: "topless" }));
    expect(out.kind).toBe("refused");
    if (out.kind !== "refused") return;
    expect(out.reasonCodes).toContain("explicit_nudity");
  });

  it("refuses a minor framing outright, with nothing offered", () => {
    const out = direct(input({ setting: "a high school gym" }));
    expect(out.kind).toBe("refused");
    if (out.kind !== "refused") return;
    expect(out.alternative).toBeNull();
    expect(out.reasonCodes[0]).toBe("minor_or_ambiguous_age");
  });
});

describe("structure", () => {
  it("refuses an interaction outside the closed vocabulary", () => {
    const out = direct(input({ interaction: "undress" }));
    expect(out.kind).toBe("refused");
    if (out.kind !== "refused") return;
    expect(out.reasonCodes).toEqual(["unknown_interaction"]);
  });

  it("refuses an action above the chosen intimacy level, and says which", () => {
    const out = direct(input({ interaction: "kiss", intimacy: "warm" }));
    expect(out.kind).toBe("refused");
    if (out.kind !== "refused") return;
    expect(out.message).toContain("above the intimacy level");
    expect(out.reasonCodes).toContain("above_intimacy_ceiling");
  });

  it("allows the same action once the level is raised", () => {
    expect(direct(input({ interaction: "kiss", intimacy: "passionate" })).kind).toBe(
      "directed",
    );
  });
});

describe("a directed scene", () => {
  const out = direct(input());

  it("composes a prompt with the safety clause last", () => {
    expect(out.kind).toBe("directed");
    if (out.kind !== "directed") return;
    expect(out.prompt).toContain("PRESERVE CAST");
    expect(out.prompt.trimEnd().endsWith("non-explicit.")).toBe(true);
  });

  it("never claims a model is connected", () => {
    if (out.kind !== "directed") return;
    expect(out.modelConnected).toBe(false);
  });

  it("keeps the whole cast in the frame, not just the pair in focus", () => {
    if (out.kind !== "directed") return;
    expect(out.placements).toHaveLength(4);
    expect(out.interactions.some((l) => l.includes("watching the others"))).toBe(true);
  });

  it("reports zero reference images, because nothing has been uploaded", () => {
    if (out.kind !== "directed") return;
    // An invented reference path would be an invented photograph.
    expect(out.referenceCount).toBe(0);
  });
});

describe("reciprocal affection", () => {
  it("adds the returned touch only when asked", () => {
    const on = direct(input({ interaction: "touch-shoulder", reciprocal: true }));
    const off = direct(input({ interaction: "touch-shoulder", reciprocal: false }));
    if (on.kind !== "directed" || off.kind !== "directed")
      throw new Error("expected both");
    expect(on.interactions.some((l) => l.includes("(returned)"))).toBe(true);
    expect(off.interactions.some((l) => l.includes("(returned)"))).toBe(false);
  });

  it("does not let a returned touch escalate past the chosen level", () => {
    // touch-arm's counterpart is touch-waist, which is "passionate".
    const out = direct(
      input({ interaction: "touch-arm", intimacy: "warm", reciprocal: true }),
    );
    if (out.kind !== "directed") throw new Error("expected a directed scene");
    expect(out.interactions.some((l) => l.includes("(returned)"))).toBe(false);
  });
});

describe("cast size", () => {
  it("handles a couple", () => {
    const out = direct(input({ castSize: 2 }));
    expect(out.kind).toBe("directed");
    if (out.kind !== "directed") return;
    expect(out.placements).toHaveLength(2);
  });

  it("handles a full group of eight", () => {
    const out = direct(input({ castSize: 8 }));
    if (out.kind !== "directed") throw new Error("expected a directed scene");
    expect(out.placements).toHaveLength(8);
  });

  it("throws rather than inventing a cast of one", () => {
    expect(() => direct(input({ castSize: 1 }))).toThrow();
  });
});
