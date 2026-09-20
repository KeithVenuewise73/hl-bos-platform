import { describe, expect, it } from "vitest";
import { normalizeCustomDirection } from "./direction";
import type { CastMemberId } from "./types";

const CAST: readonly CastMemberId[] = [
  "person_a",
  "person_b",
  "person_c",
  "person_d",
  "person_e",
];

describe("normalizeCustomDirection", () => {
  it("reads the brief's own example into structure", () => {
    const out = normalizeCustomDirection(
      "Have Person B kiss Person D while the others move closer.",
      CAST,
      { ceiling: "passionate" },
    );
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    expect(out.actors).toEqual(["person_b", "person_d"]);
    expect(out.interaction).toBe("kiss");
    expect(out.otherCharacters).toBe("move-closer");
    expect(out.edge).toEqual({ actors: ["person_b", "person_d"], type: "kiss" });
  });

  it("keeps the order the actors were named in", () => {
    const out = normalizeCustomDirection("Person D whispers to Person A.", CAST, {
      ceiling: "romantic",
    });
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    expect(out.actors).toEqual(["person_d", "person_a"]);
  });

  it("accepts a bare letter for B..H", () => {
    const out = normalizeCustomDirection("B and D embrace.", CAST, {
      ceiling: "romantic",
    });
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    expect(out.actors).toEqual(["person_b", "person_d"]);
  });

  it("does not read the article 'a' as Person A", () => {
    // "a warm moment" must not nominate Person A into an intimate scene.
    const out = normalizeCustomDirection("B and C share a warm moment and hug.", CAST, {
      ceiling: "romantic",
    });
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    expect(out.actors).toEqual(["person_b", "person_c"]);
    expect(out.actors).not.toContain("person_a");
  });

  it("accepts the raw id as typed", () => {
    const out = normalizeCustomDirection("person_a and person_c hold hands", CAST);
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    expect(out.actors).toEqual(["person_a", "person_c"]);
  });

  it("maps a longer phrase before a shorter one it contains", () => {
    const out = normalizeCustomDirection(
      "Person A gives Person B a kiss on the forehead",
      CAST,
      {
        ceiling: "romantic",
      },
    );
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    expect(out.interaction).toBe("forehead-kiss");
  });

  it("picks up a stated mood", () => {
    const out = normalizeCustomDirection(
      "Person A and Person B embrace, playful.",
      CAST,
      {
        ceiling: "romantic",
      },
    );
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    expect(out.mood).toBe("playful");
  });
});

describe("the policy gate runs before any interpretation", () => {
  it("blocks an explicit direction and offers an alternative", () => {
    const out = normalizeCustomDirection("Have Person B and Person D have sex.", CAST);
    expect(out.kind).toBe("blocked");
    if (out.kind !== "blocked") return;
    expect(out.verdict.reasonCodes).toContain("explicit_sexual_act");
    expect(out.verdict.alternative).not.toBeNull();
  });

  it("refuses a minor framing without offering anything", () => {
    const out = normalizeCustomDirection("Person B kisses a teenager.", CAST);
    expect(out.kind).toBe("blocked");
    if (out.kind !== "blocked") return;
    expect(out.verdict.hardRefusal).toBe(true);
    expect(out.verdict.alternative).toBeNull();
  });

  it("does not hand back recognised fragments of an unsafe direction", () => {
    // A blocked result carries no actors and no interaction. Preserving the
    // "safe parts" of an unsafe sentence is how a refused request gets
    // resubmitted one word at a time.
    const out = normalizeCustomDirection("Person B and Person D strip naked.", CAST);
    expect(out.kind).toBe("blocked");
    expect(Object.keys(out)).toEqual(["kind", "verdict"]);
  });
});

describe("unrecognised directions are reported, not guessed at", () => {
  it("reports an action with no vocabulary member", () => {
    const out = normalizeCustomDirection(
      "Person A does a backflip off the sofa.",
      CAST,
    );
    expect(out.kind).toBe("unrecognized");
    if (out.kind !== "unrecognized") return;
    expect(out.actors).toEqual(["person_a"]);
    expect(out.message).toContain("did not recognise");
  });

  it("refuses to guess the second person in a two-person act", () => {
    const out = normalizeCustomDirection("Person A kisses.", CAST, {
      ceiling: "passionate",
    });
    expect(out.kind).toBe("unrecognized");
    if (out.kind !== "unrecognized") return;
    expect(out.message).toContain("needs 2 people");
    expect(out.actors).toEqual(["person_a"]);
  });

  it("refuses an action above the chosen intimacy level", () => {
    const out = normalizeCustomDirection("Person A and Person B kiss.", CAST, {
      ceiling: "warm",
    });
    expect(out.kind).toBe("unrecognized");
    if (out.kind !== "unrecognized") return;
    expect(out.message).toContain("above the intimacy level");
  });

  it("trims extra actors down to what the act supports", () => {
    const out = normalizeCustomDirection(
      "Person A, Person B and Person C kiss.",
      CAST,
      { ceiling: "passionate" },
    );
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    expect(out.actors).toHaveLength(2);
  });
});
