import { describe, expect, it } from "vitest";

import {
  clock,
  durationWords,
  estimateBytes,
  secondsLeft,
  sizeText,
} from "./format.ts";

describe("words for times and sizes", () => {
  it("clock", () => {
    expect(clock(754)).toBe("12:34");
    expect(clock(4400)).toBe("1:13:20");
    expect(clock(9)).toBe("0:09");
    expect(clock(-5)).toBe("0:00");
  });
  it("size", () => {
    expect(sizeText(9.4e9)).toBe("8.8 GB");
    expect(sizeText(800_000)).toBe("1 MB");
    expect(sizeText(512 * 1024 ** 2)).toBe("512 MB");
  });
  it("a draft is estimated smaller than a full video", () => {
    expect(estimateBytes(3600, "draft")).toBeLessThan(estimateBytes(3600, "full") / 2);
  });
  it("time left is unknown until enough has happened, then follows the speed so far", () => {
    expect(secondsLeft(0.01, 100)).toBeNull();
    expect(secondsLeft(0.5, 10)).toBeNull();
    expect(secondsLeft(1, 500)).toBeNull();
    expect(secondsLeft(0.25, 100)).toBe(300);
  });
  it("durations in words", () => {
    expect(durationWords(20)).toBe("less than a minute");
    expect(durationWords(90)).toBe("about 2 minutes");
    expect(durationWords(5400)).toBe("about 1 hour 30 minutes");
    expect(durationWords(7200)).toBe("about 2 hours");
  });
});
