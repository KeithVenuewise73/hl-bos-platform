import { describe, expect, it } from "vitest";
import {
  fileSize,
  filmStatus,
  playerLabel,
  ratio,
  scoreline,
  shortDate,
  statOrNothing,
  timecode,
} from "./format";

describe("timecode", () => {
  it("formats minutes and seconds", () => {
    expect(timecode(0)).toBe("0:00");
    expect(timecode(75)).toBe("1:15");
    expect(timecode(599)).toBe("9:59");
  });

  it("adds hours for full game film", () => {
    expect(timecode(3661)).toBe("1:01:01");
  });

  it("says so rather than showing 0:00 when there is no time", () => {
    expect(timecode(null)).toBe("--:--");
    expect(timecode(undefined)).toBe("--:--");
    expect(timecode(Number.NaN)).toBe("--:--");
  });
});

describe("fileSize", () => {
  it("reaches the sizes real game film actually is", () => {
    expect(fileSize(4 * 1024 ** 3)).toBe("4.0 GB");
    expect(fileSize(6_800_000_000)).toBe("6.3 GB");
    expect(fileSize(1536)).toBe("1.5 KB");
    // Bytes are whole: "1.5 B" is not a size.
    expect(fileSize(900)).toBe("900 B");
  });

  it("does not render a missing size as 0", () => {
    expect(fileSize(null)).toBe("unknown size");
    expect(fileSize(0)).toBe("unknown size");
  });
});

describe("filmStatus", () => {
  it("only calls one status playable", () => {
    const playable = (
      ["registered", "uploading", "stored", "ready", "failed", "demo_no_video"] as const
    ).filter((s) => filmStatus(s).playable);
    expect(playable).toEqual(["ready"]);
  });

  // The demo state is the one that could quietly become a lie: it must never
  // offer a play button, and it must explain itself.
  it("says demo film has no video behind it", () => {
    const demo = filmStatus("demo_no_video");
    expect(demo.playable).toBe(false);
    expect(demo.meaning).toContain("no video file");
  });

  it("explains every status in plain words", () => {
    for (const status of [
      "registered",
      "uploading",
      "stored",
      "ready",
      "failed",
      "demo_no_video",
    ] as const) {
      expect(filmStatus(status).meaning.length).toBeGreaterThan(20);
    }
  });
});

describe("scoreline", () => {
  it("reads W / L / T", () => {
    expect(scoreline(21, 17)).toBe("W 21-17");
    expect(scoreline(14, 28)).toBe("L 14-28");
    expect(scoreline(7, 7)).toBe("T 7-7");
  });

  // An unplayed game has no score. Rendering 0-0 would show it as a loss.
  it("is null when the game has not been played", () => {
    expect(scoreline(null, null)).toBeNull();
    expect(scoreline(21, null)).toBeNull();
    expect(scoreline(null, 17)).toBeNull();
  });
});

describe("statOrNothing", () => {
  it("distinguishes a measured zero from no measurement", () => {
    expect(statOrNothing(0)).toEqual({ text: "0", measured: true });
    expect(statOrNothing(null)).toEqual({ text: "Not recorded", measured: false });
    expect(statOrNothing(undefined).measured).toBe(false);
  });
});

describe("ratio", () => {
  it("refuses to divide by nothing", () => {
    expect(ratio(0, 0)).toBe("No plays tagged");
  });

  it("shows the numerator and denominator, not just the percent", () => {
    expect(ratio(3, 11)).toBe("3 of 11 (27%)");
  });
});

describe("playerLabel", () => {
  it("writes the name the way a coach does", () => {
    expect(
      playerLabel({ jersey_number: 24, first_name: "Dominic", last_name: "Reyes" }),
    ).toBe("#24 Dominic Reyes");
  });

  it("omits the number when there is not one, rather than showing #null", () => {
    expect(
      playerLabel({ jersey_number: null, first_name: "Sam", last_name: "Doyle" }),
    ).toBe("Sam Doyle");
  });
});

describe("shortDate", () => {
  it("says there is no date rather than rendering an invalid one", () => {
    expect(shortDate(null)).toBe("no date");
    expect(shortDate("not a date")).toBe("no date");
  });
});
