import { describe, expect, it } from "vitest";

import { screenFields, screenText } from "./moderation.ts";

describe("content screen (placeholder)", () => {
  it("flags contact details", () => {
    expect(screenText("Call 555-123-4567").allowed).toBe(false);
    expect(screenText("DM mom at jordan.mom@example.com").allowed).toBe(false);
    expect(screenText("Lives at 123 Oak Ridge Dr").allowed).toBe(false);
    expect(screenText("pick up at 42 maple street").allowed).toBe(false);
  });

  it("does not flag ordinary sports sentences", () => {
    for (const ok of [
      "Scored 20 points on the way to a win",
      "Ran 40 yards down the sideline",
      "Destroy the defense. Attack the rim.",
      "Class of 2027, 4.0 GPA",
      "Main Street Pizza",
    ]) {
      expect(screenText(ok).allowed, ok).toBe(true);
    }
  });

  it("flags profanity as whole words only", () => {
    expect(screenText("this is shit").allowed).toBe(false);
    expect(screenText("Scunthorpe United, Dickinson State").allowed).toBe(true);
  });

  it("flags threats at people but not sports intensity", () => {
    expect(screenText("we're gonna kill him after the game").allowed).toBe(false);
    expect(screenText("killed it on the court").allowed).toBe(true);
  });

  it("names the field without echoing the word back", () => {
    const r = screenFields({ "Personality notes": "call 555 123 4567" });
    expect(r.flags[0]?.reason).toMatch(/^Personality notes: /);
    expect(r.flags[0]?.reason).not.toContain("555");
    expect(r.screenedBy).toBe("keyword-screen-placeholder");
  });
});
