import { describe, expect, it } from "vitest";
import {
  INTERACTIONS,
  interactionSpec,
  intimacyRank,
  isInteractionType,
  matchInteractionPhrase,
  reciprocalEdge,
} from "./vocabulary";
import { applyReciprocal } from "./graph";
import { evaluateText, normalizeText } from "./policy";

describe("the vocabulary stays closed and non-explicit", () => {
  it("every member's phrasing describes something clothed or non-exposing", () => {
    // The phrasing is what reaches the model. A member whose own words describe
    // exposure would put it in a prompt no matter what the text filter says.
    const forbidden =
      /\b(naked|nude|topless|bare (breast|chest|bottom)|genital|nipple|undress|unbutton|unzip|strip)\b/i;
    for (const spec of INTERACTIONS) {
      expect(spec.phrasing, spec.type).not.toMatch(forbidden);
    }
  });

  it("never answers anything with a private-romance act", () => {
    // A reciprocal CAN sit above what it answers — section 17 of the brief
    // gives exactly that example: a hand on the arm (warm) is returned with an
    // arm around the waist (passionate), two rungs up. What contains that is
    // the ceiling filter in applyReciprocal, which drops any reply above the
    // level the user chose; graph.test.ts proves it.
    //
    // What must never happen is a reply landing on the TOP rung, which is the
    // bedroom one. Nothing should be able to arrive there by reciprocity — it
    // has to be asked for.
    for (const spec of INTERACTIONS) {
      if (spec.reciprocal === null || spec.reciprocal === "mutual") continue;
      const reply = interactionSpec(spec.reciprocal);
      expect(reply.intimacy, `${spec.type} -> ${spec.reciprocal}`).not.toBe(
        "private-romance",
      );
    }
  });

  it("never ADDS a reply above the ceiling, whatever the mapping says", () => {
    // The practical guarantee, as behaviour rather than as a table. Only the
    // edges applyReciprocal ADDED are checked: it filters the reply, not the
    // act being replied to, so an original passionate edge staying passionate
    // is correct and not what this is about.
    for (const ceiling of ["warm", "romantic", "passionate"] as const) {
      for (const spec of INTERACTIONS) {
        if (spec.reciprocal === null || spec.reciprocal === "mutual") continue;
        const added = applyReciprocal(
          [{ actors: ["person_a", "person_b"], type: spec.type }],
          ceiling,
        ).filter((e) => e.reciprocal === true);
        for (const edge of added) {
          expect(
            intimacyRank(interactionSpec(edge.type).intimacy),
            `${spec.type} at ${ceiling}`,
          ).toBeLessThanOrEqual(intimacyRank(ceiling));
        }
      }
    }
  });

  it("every reciprocal target is itself in the closed set", () => {
    for (const spec of INTERACTIONS) {
      if (spec.reciprocal === null || spec.reciprocal === "mutual") continue;
      expect(isInteractionType(spec.reciprocal), spec.type).toBe(true);
    }
  });
});

describe("the new, more intimate additions", () => {
  const added = [
    "neck-kiss",
    "forehead-to-forehead",
    "embrace-from-behind",
    "head-on-chest",
    "hand-in-hair",
    "hand-on-chest",
    "share-blanket",
    "lift",
    "pull-close",
    "loosen-tie",
    "remove-jacket",
    "wake-together",
  ] as const;

  for (const type of added) {
    it(`${type} exists and has staging words`, () => {
      expect(isInteractionType(type)).toBe(true);
      expect(interactionSpec(type).phrasing.length).toBeGreaterThan(8);
    });
  }

  it("keeps a hand on the chest explicitly over clothing", () => {
    expect(interactionSpec("hand-on-chest").phrasing).toContain("over their clothing");
  });

  it("keeps waking together clothed and covered", () => {
    expect(interactionSpec("wake-together").phrasing).toContain("clothed and covered");
  });

  it("says the jacket comes off over clothing that stays on", () => {
    expect(interactionSpec("remove-jacket").phrasing).toContain(
      "fully dressed beneath",
    );
  });
});

describe("outerwear is the boundary, and it did not move", () => {
  // Loosening a tie and taking off a jacket are in. Opening anything worn OVER
  // intimate anatomy is not, and has no vocabulary member at all — so it cannot
  // be composed into a prompt even if every text check were removed.
  const absent = [
    "unbutton-shirt",
    "unzip",
    "unzip-trousers",
    "remove-shirt",
    "remove-trousers",
    "remove-dress",
    "undress",
    "strip",
  ];

  for (const type of absent) {
    it(`${type} has no member in the closed set`, () => {
      expect(isInteractionType(type)).toBe(false);
    });
  }

  it("still blocks undressing when it is typed in words", () => {
    for (const text of [
      "she unbuttons his trousers",
      "she unzips his pants",
      "unzip his trousers",
      "she takes off his shirt",
      "he removes her dress",
    ]) {
      const verdict = evaluateText(text);
      expect(verdict.allowed, text).toBe(false);
      expect(verdict.reasonCodes, text).toContain("undressing_to_expose");
    }
  });

  it("still allows the outerwear equivalents in words", () => {
    for (const text of [
      "she loosens his tie",
      "she takes off his jacket",
      "a hand on his chest over his shirt",
      "a kiss on the neck",
    ]) {
      expect(evaluateText(text).allowed, text).toBe(true);
    }
  });

  it("reads the permitted ones into the right action", () => {
    expect(matchInteractionPhrase(normalizeText("she loosens his tie").plain)).toBe(
      "loosen-tie",
    );
    expect(matchInteractionPhrase(normalizeText("a kiss on the neck").plain)).toBe(
      "neck-kiss",
    );
    expect(
      matchInteractionPhrase(normalizeText("he holds her from behind").plain),
    ).toBe("embrace-from-behind");
  });
});

describe("reciprocalEdge on the new members", () => {
  it("answers a neck kiss with a hand in the hair", () => {
    expect(reciprocalEdge("neck-kiss", ["person_a", "person_b"])).toEqual({
      actors: ["person_b", "person_a"],
      type: "hand-in-hair",
    });
  });

  it("treats waking together as already mutual", () => {
    expect(reciprocalEdge("wake-together", ["person_a", "person_b"])).toBeNull();
  });
});
