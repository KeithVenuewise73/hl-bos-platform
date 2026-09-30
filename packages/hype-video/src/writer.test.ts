import { describe, expect, it } from "vitest";

import { FULL, MINIMAL, request } from "./fixtures.test-helpers.ts";
import { reviewDraft } from "./provider/index.ts";
import { TEMPLATES } from "./templates.ts";
import { TEMPLATE_KEYS, TONES } from "./types.ts";
import { buildHashtags, fill, writeWithTemplate } from "./writer.ts";

describe("template writer", () => {
  // The property the whole product rests on: the fallback writer can never
  // be the thing that invents a stat or leaks a phone number.
  for (const template of TEMPLATE_KEYS) {
    for (const tone of TONES) {
      it(`passes every check: ${template} / ${tone}`, () => {
        for (const details of [FULL, MINIMAL]) {
          const req = request(details, template, tone);
          const pkg = writeWithTemplate(req);
          expect(reviewDraft(pkg, req)).toEqual([]);
          expect(pkg.title.length).toBeGreaterThan(0);
          expect(pkg.script15).toMatch(/^\[0:00\]/);
          expect(pkg.script30).toMatch(/^\[0:00\]/);
          expect(pkg.onScreenText.length).toBeGreaterThan(0);
        }
      });
    }
  }

  it("is deterministic", () => {
    expect(writeWithTemplate(request(FULL))).toEqual(writeWithTemplate(request(FULL)));
  });

  it("uses the entered achievements and nothing else", () => {
    const pkg = writeWithTemplate(request(FULL, "athlete_spotlight", "cinematic"));
    expect(pkg.script30).toContain("Scored 31 points against Central.");
    expect(pkg.script30).toContain(
      "Known for: Quiet leader who lets the game do the talking.",
    );
  });

  it("writes a sponsor callout only when a sponsor was entered", () => {
    expect(writeWithTemplate(request(FULL)).sponsorCallout).toContain(
      "Main Street Pizza",
    );
    expect(writeWithTemplate(request(MINIMAL)).sponsorCallout).toBeNull();
  });

  it("says plainly when there is no footage", () => {
    const pkg = writeWithTemplate({ ...request(MINIMAL), media: [] });
    expect(pkg.videoPrompt).toContain("No media was uploaded");
  });

  it("names the team, not a person, for a team intro", () => {
    const pkg = writeWithTemplate(request(FULL, "team_intro", "aggressive"));
    expect(pkg.title).toBe("This Is Lincoln High Lions");
    expect(pkg.hashtags).not.toContain("JordanReyes");
  });

  it("drops a missing slot together with its punctuation", () => {
    const slots = {
      name: "Ava",
      team: "Riverside FC",
      sport: "Soccer",
      jersey: "",
      position: "Keeper",
      class: "",
    };
    expect(fill("#{jersey} · {position}", slots)).toBe("Keeper");
    expect(fill("{name}. {position}. {class}.", slots)).toBe("Ava. Keeper.");
    expect(fill("{name} | {position} | {class} | Recruiting Intro", slots)).toBe(
      "Ava | Keeper | Recruiting Intro",
    );
  });

  it("builds clean, unique hashtags", () => {
    const tags = buildHashtags(FULL, TEMPLATES[0]!);
    expect(tags.length).toBeLessThanOrEqual(10);
    for (const t of tags) expect(t).toMatch(/^[A-Za-z0-9]+$/);
    expect(new Set(tags.map((t) => t.toLowerCase())).size).toBe(tags.length);
    expect(tags).toContain("JordanReyes");
  });

  it("never names a real artist or song in the music prompt", () => {
    for (const tone of TONES) {
      const pkg = writeWithTemplate(request(FULL, "game_day", tone));
      expect(pkg.musicPrompt).toContain("Do not imitate any named artist");
    }
  });
});
