import { describe, expect, it } from "vitest";
import {
  actorsIn,
  applyReciprocal,
  capToCeiling,
  graphIntimacy,
  includeBystanders,
  isValidGraph,
  renderGraph,
  validateGraph,
} from "./graph";
import { labelFor } from "./cast";
import type { CastMemberId, SceneInteractionGraph } from "./types";

const CAST: readonly CastMemberId[] = ["person_a", "person_b", "person_c", "person_d"];

describe("validateGraph", () => {
  it("accepts a well-formed graph", () => {
    const graph: SceneInteractionGraph = [
      { actors: ["person_a", "person_b"], type: "embrace" },
      { actors: ["person_c"], type: "observing" },
    ];
    expect(isValidGraph(graph, CAST, "romantic")).toBe(true);
  });

  it("rejects an actor who is not in the cast", () => {
    const issues = validateGraph(
      [{ actors: ["person_a", "person_h"], type: "embrace" }],
      CAST,
      "romantic",
    );
    expect(issues.map((i) => i.code)).toContain("unknown_member");
  });

  it("rejects an interaction with itself", () => {
    const issues = validateGraph(
      [{ actors: ["person_a", "person_a"], type: "kiss" }],
      CAST,
      "passionate",
    );
    expect(issues.map((i) => i.code)).toContain("duplicate_actor");
  });

  it("rejects too few actors for a two-person act", () => {
    const issues = validateGraph(
      [{ actors: ["person_a"], type: "kiss" }],
      CAST,
      "passionate",
    );
    expect(issues.map((i) => i.code)).toContain("too_few_actors");
  });

  it("rejects too many actors for a pair-only act", () => {
    const issues = validateGraph(
      [{ actors: ["person_a", "person_b", "person_c"], type: "kiss" }],
      CAST,
      "passionate",
    );
    expect(issues.map((i) => i.code)).toContain("too_many_actors");
  });

  it("rejects an unknown interaction type outright", () => {
    const issues = validateGraph(
      // Deliberately outside the closed vocabulary.
      [{ actors: ["person_a", "person_b"], type: "undress" as never }],
      CAST,
      "private-romance",
    );
    expect(issues.map((i) => i.code)).toEqual(["unknown_interaction"]);
  });

  it("enforces the intimacy ceiling the user chose", () => {
    const kiss: SceneInteractionGraph = [
      { actors: ["person_a", "person_b"], type: "kiss" },
    ];
    expect(isValidGraph(kiss, CAST, "warm")).toBe(false);
    expect(validateGraph(kiss, CAST, "warm").map((i) => i.code)).toContain(
      "above_intimacy_ceiling",
    );
    expect(isValidGraph(kiss, CAST, "passionate")).toBe(true);
  });
});

describe("applyReciprocal", () => {
  it("returns an appropriate non-explicit counterpart", () => {
    const out = applyReciprocal(
      [{ actors: ["person_a", "person_b"], type: "touch-arm" }],
      "passionate",
    );
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual({
      actors: ["person_b", "person_a"],
      type: "touch-waist",
      reciprocal: true,
    });
  });

  it("adds nothing for an act that is already mutual", () => {
    const out = applyReciprocal(
      [{ actors: ["person_a", "person_b"], type: "kiss" }],
      "passionate",
    );
    expect(out).toHaveLength(1);
  });

  it("never escalates past the ceiling", () => {
    // touch-arm's counterpart is touch-waist, which is "passionate". At a
    // "warm" ceiling the reciprocal must be dropped, not delivered.
    const out = applyReciprocal(
      [{ actors: ["person_a", "person_b"], type: "touch-arm" }],
      "warm",
    );
    expect(out).toHaveLength(1);
  });

  it("does not reciprocate a reciprocal, so it cannot run away", () => {
    const once = applyReciprocal(
      [{ actors: ["person_a", "person_b"], type: "touch-shoulder" }],
      "passionate",
    );
    const twice = applyReciprocal(once, "passionate");
    expect(twice).toHaveLength(once.length);
  });

  it("does not duplicate an edge the user already added", () => {
    const out = applyReciprocal(
      [
        { actors: ["person_a", "person_b"], type: "touch-shoulder" },
        { actors: ["person_b", "person_a"], type: "touch-upper-back" },
      ],
      "passionate",
    );
    expect(out).toHaveLength(2);
  });
});

describe("includeBystanders", () => {
  it("gives every unengaged cast member a place in the scene", () => {
    const out = includeBystanders(
      [{ actors: ["person_a", "person_b"], type: "kiss" }],
      CAST,
    );
    expect(actorsIn(out)).toEqual(
      expect.arrayContaining(["person_a", "person_b", "person_c", "person_d"]),
    );
    expect(out.filter((e) => e.type === "observing")).toHaveLength(2);
  });

  it("leaves a fully engaged cast alone", () => {
    const graph: SceneInteractionGraph = [
      { actors: ["person_a", "person_b"], type: "kiss" },
      { actors: ["person_c", "person_d"], type: "talk" },
    ];
    expect(includeBystanders(graph, CAST)).toHaveLength(2);
  });
});

describe("graphIntimacy and capToCeiling", () => {
  it("reports the highest intimacy present", () => {
    expect(
      graphIntimacy([
        { actors: ["person_a", "person_b"], type: "talk" },
        { actors: ["person_a", "person_b"], type: "kiss" },
      ]),
    ).toBe("passionate");
  });

  it("returns null for an empty graph", () => {
    expect(graphIntimacy([])).toBeNull();
  });

  it("drops edges above the ceiling", () => {
    const out = capToCeiling(
      [
        { actors: ["person_a", "person_b"], type: "talk" },
        { actors: ["person_a", "person_b"], type: "kiss" },
      ],
      "warm",
    );
    expect(out.map((e) => e.type)).toEqual(["talk"]);
  });
});

describe("renderGraph", () => {
  it("states each edge in the prompt's language, not as a type name", () => {
    const text = renderGraph(
      [{ actors: ["person_a", "person_b"], type: "touch-clothed-knee" }],
      labelFor,
    );
    expect(text).toBe(
      "- Person A and Person B: a hand resting on the other's clothed knee",
    );
  });

  it("marks a returned touch so the generator reads it as mutual", () => {
    const text = renderGraph(
      [{ actors: ["person_b", "person_a"], type: "touch-waist", reciprocal: true }],
      labelFor,
    );
    expect(text).toContain("(returned)");
  });
});
