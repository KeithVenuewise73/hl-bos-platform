import { describe, expect, it } from "vitest";

import {
  durationText,
  estimateText,
  previewSentence,
  secondsLeft,
  sizeText,
} from "./iphone-progress.ts";

describe("sizes and times for the iPhone copy", () => {
  it("writes sizes in MB under a GB and GB above", () => {
    expect(sizeText(850 * 1024 ** 2)).toBe("850 MB");
    expect(sizeText(48.2 * 1024 ** 3)).toBe("48.2 GB");
    expect(sizeText(0)).toBe("0 MB");
  });

  it("writes durations plainly", () => {
    expect(durationText(20)).toBe("less than a minute");
    expect(durationText(90)).toBe("about 2 minutes");
    expect(durationText(3600)).toBe("about 1 hour");
    expect(durationText(7800)).toBe("about 2 hours 10 minutes");
  });

  it("gives a range from typical USB speeds, never a single promise", () => {
    // 48 GB at 20 to 40 MB/s: from about 20 minutes to about 41 minutes.
    const text = estimateText(48 * 1024 ** 3);
    expect(text).toMatch(/^between /);
    expect(text).toContain(" and ");
    expect(estimateText(10 * 1024 ** 2)).toBe("under a minute");
  });

  it("only trusts the speed it has seen once something real has been copied", () => {
    expect(secondsLeft(1000, 0, 100)).toBeNull(); // nothing copied yet
    expect(secondsLeft(1000, 100, 10)).toBeNull(); // too soon to mean anything
    expect(secondsLeft(1000, 100, 100)).toBe(900); // 1 byte/s, 900 left
    expect(secondsLeft(1000, 1200, 100)).toBe(0); // never negative
  });

  it("says what it found, what waits, and that the time is an estimate", () => {
    const s = previewSentence("videos", "small", {
      total: 14,
      todo: 12,
      todoBytes: 3 * 1024 ** 3,
      older: 5,
      held: 4,
    });
    expect(s).toContain("12 videos to bring in");
    expect(s).toContain("3.0 GB");
    expect(s).toContain("yours may differ");
    expect(s).toContain("4 larger files are left for later");
    expect(s).toContain("5 older files are left on the phone");
    expect(
      previewSentence("photos", "all", {
        total: 9,
        todo: 0,
        todoBytes: 0,
        older: 0,
        held: 0,
      }),
    ).toBe("Nothing new to bring in (9 photos here are already copied).");
    expect(
      previewSentence("videos", "large", {
        total: 2,
        todo: 1,
        todoBytes: 5 * 1024 ** 3,
        older: 0,
        held: 7,
      }),
    ).toContain("7 smaller files are left for later");
    expect(
      previewSentence("videos", "all", {
        total: 1,
        todo: 1,
        todoBytes: 2 ** 20,
        older: 0,
        held: 0,
      }),
    ).toContain("1 video to bring in");
  });
});
