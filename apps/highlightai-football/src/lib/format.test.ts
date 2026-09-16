import { describe, expect, it } from "vitest";
import {
  clock,
  confidenceTone,
  decimal,
  duration,
  eventLabel,
  involvementLabel,
  percent,
  playClassification,
} from "./format";

describe("clock and duration", () => {
  it("formats a game clock", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(65)).toBe("1:05");
    expect(clock(1935)).toBe("32:15");
  });

  it("never shows negative time", () => {
    expect(clock(-5)).toBe("0:00");
  });

  it("shows short clips in seconds and long ones on the clock", () => {
    expect(duration(21.4)).toBe("21.4s");
    expect(duration(95)).toBe("1:35");
  });
});

describe("an unmeasured value never renders as zero", () => {
  it("says so in words for a null percentage", () => {
    expect(percent(null)).toBe("Not measured");
    expect(percent(0)).toBe("0%");
  });

  it("says so in words for a null decimal", () => {
    expect(decimal(null)).toBe("Not measured");
    expect(decimal(0)).toBe("0.0");
  });

  it("allows the caller to say it differently", () => {
    expect(percent(null, "No reviews yet")).toBe("No reviews yet");
  });

  it("does not render NaN as a number", () => {
    expect(percent(Number.NaN)).toBe("Not measured");
    expect(decimal(Number.NaN)).toBe("Not measured");
  });
});

describe("involvement labels", () => {
  it("covers the whole 0..5 scale", () => {
    for (let i = 0; i <= 5; i++) expect(involvementLabel(i)).not.toBe("Unknown");
    expect(involvementLabel(1)).toBe("On the field");
    expect(involvementLabel(5)).toBe("Major highlight");
  });

  it("does not invent a label for a score outside the scale", () => {
    expect(involvementLabel(9)).toBe("Unknown");
  });
});

describe("confidenceTone matches the review threshold", () => {
  it("turns warn exactly where a play starts needing review", () => {
    expect(confidenceTone(0.95)).toBe("ok");
    expect(confidenceTone(0.8)).toBe("ok");
    expect(confidenceTone(0.79)).toBe("warn");
    expect(confidenceTone(0.6)).toBe("warn");
    expect(confidenceTone(0.59)).toBe("danger");
  });
});

describe("football wording", () => {
  it("writes event names the way a coach says them", () => {
    expect(eventLabel("pass_breakup")).toBe("Pass breakup");
    expect(eventLabel("run_stop")).toBe("Run stop");
    expect(eventLabel("tackle")).toBe("Tackle");
  });

  it("classifies a play by what was detected, not by the athlete's position", () => {
    expect(playClassification(["tackle"], ["WR"])).toBe("Defensive play");
    expect(playClassification(["catch"], ["S"])).toBe("Offensive play");
    expect(playClassification(["return"], ["S"])).toBe("Special teams");
  });

  it("falls back to the athlete's position when nothing was detected", () => {
    expect(playClassification([], ["S"])).toBe("Defensive snap");
  });

  it("says unclassified rather than guessing", () => {
    expect(playClassification([], ["WR"])).toBe("Unclassified");
  });
});
