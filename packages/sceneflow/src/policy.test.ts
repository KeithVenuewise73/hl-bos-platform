import { describe, expect, it } from "vitest";
import {
  attestationSatisfied,
  evaluateFields,
  evaluateText,
  normalizeText,
  type PolicyReasonCode,
} from "./policy.js";

/** Convenience: the worst reason code, or null when allowed. */
function codeOf(text: string): PolicyReasonCode | null {
  const v = evaluateText(text);
  return v.allowed ? null : (v.reasonCodes[0] ?? null);
}

describe("normalizeText", () => {
  it("keeps digits in the plain variant and folds leetspeak in the folded one", () => {
    const v = normalizeText("Under 18!");
    expect(v.plain).toBe("under 18");
    expect(v.folded).toBe("under i8");
  });

  it("strips accents and collapses punctuation", () => {
    expect(normalizeText("Café — terrace, sunset.").plain).toBe("cafe terrace sunset");
  });

  it("clamps runs of a repeated letter so 'kisssss' reads as 'kiss'-like", () => {
    expect(normalizeText("kissssss").folded).toBe("kiss");
  });

  it("produces a separator-free variant", () => {
    expect(normalizeText("s.e.x.u.a.l").flat).toBe("sexual");
  });
});

describe("allowed romantic requests pass", () => {
  const allowed = [
    "Have Person B kiss Person D while the others move closer.",
    "Everyone keeps talking, then they move toward the windows.",
    "Person A puts a hand on Person C's shoulder.",
    "A slow dance in the suite, warm amber lighting.",
    "Cuddling on the couch in sleepwear, a goodnight moment.",
    "Person A rests a hand on Person B's clothed knee.",
    "They embrace on the balcony at sunset, then laugh together.",
    "Move to the bedroom area and relax together, fully dressed.",
    "Elegant evening wear, stockings, a glamorous hotel suite.",
    "A forehead kiss before they sleep.",
  ];

  for (const text of allowed) {
    it(`allows: ${text}`, () => {
      expect(evaluateText(text).allowed).toBe(true);
    });
  }
});

describe("false positives — ordinary words that must NOT trip the gate", () => {
  // Each of these contains a substring of a blocked term. A gate that fires on
  // them is a gate people learn to work around.
  const innocent = [
    "Make minor adjustments to the lighting.",
    "Run an analysis of the scene composition.",
    "Assemble the group near the fireplace.",
    "A classic portrait, shot at eye level.",
    "Use forced perspective so the skyline reads larger.",
    "She gives a forced smile, then relaxes.",
    "Fifteen people were at the party; keep only our cast.",
    "They are kidding around by the bar.",
    "A comic strip layout for the storyboard.",
    "Sunset Strip at night, neon signs.",
    "Keep her childhood home in the background.",
    "Grapes and a cocktail on the coffee table.",
    "Passionate conversation about the trip.",
    "A canteen in the background of the terrace shot.",
    "The top less formal of the two outfits.",
    "He is a titan of industry at the dinner table.",
  ];

  for (const text of innocent) {
    it(`allows: ${text}`, () => {
      const verdict = evaluateText(text);
      expect(verdict.reasonCodes).toEqual([]);
      expect(verdict.allowed).toBe(true);
    });
  }
});

describe("explicit sexual requests are blocked and redirected", () => {
  const blocked = [
    "Make them have sex on the bed.",
    "Show sexual contact between Person A and Person B.",
    "Generate an explicit porn scene.",
    "Have Person C perform oral sex.",
    "An erotic scene in the suite.",
    "Make love in the hotel room.",
  ];

  for (const text of blocked) {
    it(`blocks: ${text}`, () => {
      const verdict = evaluateText(text);
      expect(verdict.allowed).toBe(false);
      expect(verdict.reasonCodes).toContain("explicit_sexual_act");
    });
  }

  it("offers the nearest permitted romantic alternative, not a refusal", () => {
    const verdict = evaluateText("Make them have sex.");
    expect(verdict.hardRefusal).toBe(false);
    expect(verdict.alternative).toContain("embrace");
    expect(verdict.message).toContain("romantic scenes, not sexual ones");
  });

  it("sees through spaced-out obfuscation", () => {
    expect(codeOf("make it s e x u a l")).toBe("explicit_sexual_act");
    expect(codeOf("s.e.x.u.a.l contact")).toBe("explicit_sexual_act");
  });

  it("sees through leetspeak", () => {
    expect(codeOf("make it s3xu4l")).toBe("explicit_sexual_act");
    expect(codeOf("p0rn scene")).toBe("explicit_sexual_act");
  });
});

describe("nudity and undressing are blocked and redirected", () => {
  it("blocks nudity", () => {
    expect(codeOf("Show them naked on the bed.")).toBe("explicit_nudity");
    expect(codeOf("topless on the balcony")).toBe("explicit_nudity");
    expect(codeOf("exposed breasts")).toBe("explicit_nudity");
  });

  it("blocks undressing to expose", () => {
    expect(codeOf("Have him take off her dress.")).toBe("undressing_to_expose");
    expect(codeOf("She undresses slowly.")).toBe("undressing_to_expose");
    expect(codeOf("Unbutton her shirt.")).toBe("undressing_to_expose");
  });

  it("still allows a wardrobe change that stays covered", () => {
    expect(evaluateText("Change her into sleepwear and his into a robe.").allowed).toBe(
      true,
    );
  });

  it("redirects rather than refusing", () => {
    const verdict = evaluateText("Show them naked.");
    expect(verdict.hardRefusal).toBe(false);
    expect(verdict.alternative).not.toBeNull();
  });
});

describe("minors are refused outright, never redirected", () => {
  const refused = [
    "A teen couple kissing.",
    "Put a child in the scene.",
    "She is 16 years old.",
    "A 17 year old at the party.",
    "underage subjects",
    "a schoolgirl in the hotel suite",
    "a young girl next to Person A",
    "everyone is under 18",
  ];

  for (const text of refused) {
    it(`refuses: ${text}`, () => {
      const verdict = evaluateText(text);
      expect(verdict.allowed).toBe(false);
      expect(verdict.reasonCodes[0]).toBe("minor_or_ambiguous_age");
      expect(verdict.hardRefusal).toBe(true);
      // The critical assertion: no "nearest romantic alternative" is offered.
      expect(verdict.alternative).toBeNull();
    });
  }

  it("does not read an adult age as a minor", () => {
    expect(evaluateText("She is 28 years old.").allowed).toBe(true);
    expect(evaluateText("They are both 41 years old.").allowed).toBe(true);
  });

  it("outranks an explicit code when both fire", () => {
    const verdict = evaluateText("sexual scene with a teen");
    expect(verdict.reasonCodes[0]).toBe("minor_or_ambiguous_age");
    expect(verdict.reasonCodes).toContain("explicit_sexual_act");
    expect(verdict.alternative).toBeNull();
  });
});

describe("non-consent framing is refused outright", () => {
  const refused = [
    "Force her to kiss him.",
    "She is unwilling but he embraces her anyway.",
    "against her will",
    "while she is unconscious",
    "a non consensual scene",
  ];

  for (const text of refused) {
    it(`refuses: ${text}`, () => {
      const verdict = evaluateText(text);
      expect(verdict.reasonCodes[0]).toBe("non_consent");
      expect(verdict.hardRefusal).toBe(true);
      expect(verdict.alternative).toBeNull();
    });
  }
});

describe("public figures are refused outright", () => {
  it("refuses a celebrity framing", () => {
    const verdict = evaluateText("Make Person A kiss a famous actress.");
    expect(verdict.reasonCodes[0]).toBe("public_figure");
    expect(verdict.hardRefusal).toBe(true);
    expect(verdict.alternative).toBeNull();
  });

  it("refuses a political framing", () => {
    expect(codeOf("a scene with the president")).toBe("public_figure");
  });
});

describe("evaluateFields", () => {
  it("passes when every field is clean", () => {
    const result = evaluateFields({
      direction: "They embrace by the window.",
      wardrobe: "evening wear",
      setting: "luxury suite",
    });
    expect(result.verdict.allowed).toBe(true);
    expect(result.field).toBeNull();
  });

  it("a clean direction does not redeem a wardrobe asking for nudity", () => {
    const result = evaluateFields({
      direction: "They embrace by the window.",
      wardrobe: "topless",
    });
    expect(result.verdict.allowed).toBe(false);
    expect(result.field).toBe("wardrobe");
  });

  it("a hard refusal in any field outranks an explicit block in another", () => {
    const result = evaluateFields({
      direction: "make it sexual",
      setting: "a high school gym",
    });
    expect(result.verdict.hardRefusal).toBe(true);
    expect(result.verdict.alternative).toBeNull();
    expect(result.field).toBe("setting");
  });

  it("ignores fields that were not supplied", () => {
    expect(evaluateFields({ direction: undefined }).verdict.allowed).toBe(true);
  });
});

describe("attestation gate", () => {
  it("requires both boxes", () => {
    expect(
      attestationSatisfied({ adultConfirmed: true, permissionConfirmed: true }),
    ).toBe(true);
    expect(
      attestationSatisfied({ adultConfirmed: true, permissionConfirmed: false }),
    ).toBe(false);
    expect(
      attestationSatisfied({ adultConfirmed: false, permissionConfirmed: true }),
    ).toBe(false);
  });
});
