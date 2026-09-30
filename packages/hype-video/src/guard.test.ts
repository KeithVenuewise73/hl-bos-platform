import { describe, expect, it } from "vitest";

import { FULL, MINIMAL, request } from "./fixtures.test-helpers.ts";
import { checkFabrication } from "./guard.ts";
import { templateOrThrow } from "./templates.ts";
import { writeWithTemplate } from "./writer.ts";

const game = templateOrThrow("game_day");

describe("fabrication guard", () => {
  it("refuses a number the user never entered", () => {
    const pkg = {
      ...writeWithTemplate(request(MINIMAL)),
      script30: "[0:00] Ava dropped 40 goals.",
    };
    const result = checkFabrication(pkg, MINIMAL, game);
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain('"40"');
  });

  it("allows a number that was entered", () => {
    const pkg = {
      ...writeWithTemplate(request(FULL)),
      script30: "[0:00] 31 points. Number 23.",
    };
    expect(checkFabrication(pkg, FULL, game).ok).toBe(true);
  });

  it("ignores script timestamps", () => {
    const pkg = { ...writeWithTemplate(request(MINIMAL)), script30: "[0:17] Ava." };
    expect(checkFabrication(pkg, MINIMAL, game).ok).toBe(true);
  });

  it("catches a number hidden in a hashtag", () => {
    const pkg = { ...writeWithTemplate(request(MINIMAL)), hashtags: ["Top100Recruit"] };
    expect(checkFabrication(pkg, MINIMAL, game).ok).toBe(false);
  });

  it("refuses an honour or recruiting claim that was not entered", () => {
    for (const phrase of [
      "State champion",
      "Ava is committed",
      "multiple offers",
      "the MVP",
      "undefeated",
    ]) {
      const pkg = { ...writeWithTemplate(request(MINIMAL)), socialCaption: phrase };
      expect(checkFabrication(pkg, MINIMAL, game).ok, phrase).toBe(false);
    }
  });

  it("allows a claim the user entered themselves", () => {
    const pkg = {
      ...writeWithTemplate(request(FULL)),
      socialCaption: "All-Conference guard.",
    };
    expect(checkFabrication(pkg, FULL, game).ok).toBe(true);
  });

  it("allows a template's own wording, like Birthday MVP", () => {
    const birthday = templateOrThrow("birthday_tribute");
    const pkg = writeWithTemplate(request(MINIMAL, "birthday_tribute", "fun"));
    expect(pkg.onScreenText.map((c) => c.text)).toContain("BIRTHDAY MVP");
    expect(checkFabrication(pkg, MINIMAL, birthday).ok).toBe(true);
  });
});
