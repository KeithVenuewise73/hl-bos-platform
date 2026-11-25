import { describe, expect, it } from "vitest";

import {
  ALL_CHOICES,
  checkSentence,
  defaultBaseFolder,
  doneLines,
  importSteps,
  isClean,
  liveLine,
  lookBackDays,
  lookBackSentence,
  noun,
  phoneFolder,
  phoneFolders,
  type StepResult,
} from "./iphone-import";

const GB = 1024 ** 3;

describe("where each phone's files go", () => {
  it("keeps a folder per phone, split into clips, photos and game footage", () => {
    expect(phoneFolders("D:\\Phone Imports", "Game phone 13 Pro")).toEqual({
      clips: "D:\\Phone Imports\\Game phone 13 Pro\\Short Clips",
      photos: "D:\\Phone Imports\\Game phone 13 Pro\\Photos",
      games: "D:\\Phone Imports\\Game phone 13 Pro\\Game Footage",
    });
  });
  it("copes with a trailing slash and forward slashes", () => {
    expect(phoneFolder("D:\\Imports\\", "A", "Photos")).toBe("D:\\Imports\\A\\Photos");
    expect(phoneFolder("/mnt/d/imports", "A", "Photos")).toBe(
      "/mnt/d/imports/A/Photos",
    );
  });
});

describe("what one press brings in", () => {
  it("is short clips, then photos, then game footage, each with the right kind and size", () => {
    const steps = importSteps("D:\\P", "Ph", ALL_CHOICES);
    expect(steps.map((s) => [s.id, s.kind, s.size])).toEqual([
      ["clips", "videos", "small"],
      ["photos", "photos", "all"],
      ["games", "videos", "large"],
    ]);
    expect(steps[2]!.folder).toBe("D:\\P\\Ph\\Game Footage");
  });
  it("leaves out what is unticked", () => {
    const steps = importSteps("D:\\P", "Ph", {
      clips: true,
      photos: false,
      games: false,
    });
    expect(steps.map((s) => s.id)).toEqual(["clips"]);
    expect(
      importSteps("D:\\P", "Ph", { clips: false, photos: false, games: false }),
    ).toEqual([]);
  });
});

describe("how far back to ask the phone", () => {
  const now = new Date("2026-11-25T12:00:00Z");
  it("is a month the first time", () => {
    expect(lookBackDays(null, now)).toBe(30);
    expect(lookBackDays(undefined, now)).toBe(30);
    expect(lookBackDays("not a time", now)).toBe(30);
  });
  it("is the time since last time plus a few days' slack, never under a week", () => {
    expect(lookBackDays("2026-11-20T12:00:00Z", now)).toBe(8); // 5 days + 3
    expect(lookBackDays("2026-11-24T12:00:00Z", now)).toBe(7); // 1 + 3 = 4, raised to 7
    expect(lookBackDays("2026-08-27T12:00:00Z", now)).toBe(93); // 90 + 3
  });
  it("falls back to a month for a time in the future", () => {
    expect(lookBackDays("2027-01-01T00:00:00Z", now)).toBe(30);
  });
  it("says which it is doing", () => {
    expect(lookBackSentence(null, 30)).toMatch(/First time for this phone/);
    expect(lookBackSentence("2026-11-20T12:00:00Z", 8)).toMatch(/since the last time/);
  });
});

const step = (id: "clips" | "photos" | "games") =>
  importSteps("D:\\P", "Ph", ALL_CHOICES).find((s) => s.id === id)!;
const result = (
  id: "clips" | "photos" | "games",
  o: Partial<StepResult> = {},
): StepResult => ({
  step: step(id),
  copied: 0,
  already: 0,
  conflicts: 0,
  failed: [],
  short: [],
  bytes: 0,
  todo: 0,
  todoBytes: 0,
  ...o,
});

describe("the words", () => {
  it("counts in plain nouns", () => {
    expect(noun(step("clips"), 1)).toBe("1 short clip");
    expect(noun(step("clips"), 12)).toBe("12 short clips");
    expect(noun(step("games"), 3)).toBe("3 game recordings");
    expect(noun(step("photos"), 1)).toBe("1 photo");
  });
  it("answers Check first with each step and the total size", () => {
    expect(
      checkSentence([
        result("clips", { todo: 12, todoBytes: 1.2 * GB }),
        result("photos", { todo: 0 }),
        result("games", { todo: 2, todoBytes: 20 * GB }),
      ]),
    ).toBe(
      "New on this phone: 12 short clips (1.2 GB), no new photos, 2 game recordings (20.0 GB). 21.2 GB in all.",
    );
    expect(checkSentence([result("clips"), result("photos")])).toBe(
      "Nothing new to bring in from this phone.",
    );
  });
  it("reports what was brought in, what was already there and what failed", () => {
    const lines = doneLines([
      result("clips", { copied: 5, already: 2 }),
      result("photos", { copied: 0, failed: ["202611_a\\IMG_1.HEIC"] }),
    ]);
    expect(lines[0]).toBe("5 short clips brought in, 2 already there.");
    expect(lines.join(" ")).toMatch(
      /1 photo could not be copied \(202611_a\\IMG_1\.HEIC\)/,
    );
  });
  it("is clean only when nothing is left to retry", () => {
    expect(isClean([result("clips", { copied: 3 })])).toBe(true);
    expect(isClean([result("clips", { failed: ["x"] })])).toBe(false);
    expect(isClean([result("clips", { short: ["x"] })])).toBe(false);
  });
  it("gives one plain live line", () => {
    expect(liveLine(step("clips"), 0, 3, 4, 12, null)).toBe(
      "Step 1 of 3: bringing in short clips: 4 of 12",
    );
    expect(liveLine(step("games"), 2, 3, 1, 2, 1200)).toBe(
      "Step 3 of 3: bringing in game footage: 1 of 2, about 20 minutes left",
    );
    expect(liveLine(step("clips"), 0, 1, 0, 0, null)).toBe(
      "looking at the phone for short clips…",
    );
  });
});

describe("where to suggest keeping everything", () => {
  const ok = () => null;
  it("is a Phone Imports folder beside the old photos folder", () => {
    expect(defaultBaseFolder("D:\\Iphone Photos", ok)).toBe("D:\\Phone Imports");
  });
  it("is nothing when there is nothing to go by or the place is poor", () => {
    expect(defaultBaseFolder(null, ok)).toBeNull();
    expect(defaultBaseFolder("", ok)).toBeNull();
    expect(defaultBaseFolder("C:\\Pictures", () => "C: fills up")).toBeNull();
  });
});
