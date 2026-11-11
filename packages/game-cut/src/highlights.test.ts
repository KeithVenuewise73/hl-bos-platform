import { describe, expect, it } from "vitest";

import { clipsFromTimes } from "./highlights.ts";
import { formatTime, parseTimestamps } from "./timestamps.ts";

describe("reading times a person typed", () => {
  it("reads M:SS, H:MM:SS and plain seconds, with names", () => {
    const { moments, problems } = parseTimestamps(
      ["12:34 big hit", "1:02:15 - goal, 14U", "41:02", "754 (seconds)", "0:05"].join(
        "\n",
      ),
    );
    expect(problems).toEqual([]);
    expect(moments.map((m) => [m.seconds, m.label])).toEqual([
      [754, "big hit"],
      [3735, "goal, 14U"],
      [2462, ""],
      [754, "(seconds)"],
      [5, ""],
    ]);
  });

  it("reports unreadable lines with their number and why, and keeps the good ones", () => {
    const { moments, problems } = parseTimestamps(
      [
        "12:34 hit",
        "goal late in the second",
        "9:75 bad seconds",
        "1:75:00 bad minutes",
        "",
        "# a note",
      ].join("\n"),
    );
    expect(moments).toHaveLength(1);
    expect(problems.map((p) => p.line)).toEqual([2, 3, 4]);
    expect(problems[0]!.why).toMatch(/does not start with a time/);
    expect(problems[1]!.why).toMatch(/seconds go up to 59/);
    expect(problems[2]!.why).toMatch(/minutes go up to 59/);
  });

  it("handles Windows line endings and keeps the real line numbers", () => {
    const { moments } = parseTimestamps("\r\n10:00 a\r\n\r\n20:00 b\r\n");
    expect(moments.map((m) => m.line)).toEqual([2, 4]);
  });

  it("writes times back the way people write them", () => {
    expect(formatTime(754)).toBe("12:34");
    expect(formatTime(3735)).toBe("1:02:15");
    expect(formatTime(0)).toBe("0:00");
  });
});

describe("clips around the times", () => {
  const at = (seconds: number, label = "", line = 1) => ({ seconds, label, line });

  it("keeps some before and some after each time", () => {
    const { clips } = clipsFromTimes([at(100, "goal")], 600, {
      beforeSeconds: 8,
      afterSeconds: 6,
    });
    expect(clips).toHaveLength(1);
    expect([clips[0]!.startSeconds, clips[0]!.endSeconds]).toEqual([92, 106]);
    expect(clips[0]!.label).toBe("goal");
    expect(clips[0]!.camera).toBe("A");
  });

  it("joins clips that overlap, so a play is never shown twice, and keeps both names", () => {
    const { clips } = clipsFromTimes([at(100, "shot"), at(105, "rebound goal")], 600);
    expect(clips).toHaveLength(1);
    expect(clips[0]!.label).toBe("shot + rebound goal");
    expect(clips[0]!.startSeconds).toBe(92);
    expect(clips[0]!.endSeconds).toBe(111);
  });

  it("puts clips in time order whatever order they were typed", () => {
    const { clips } = clipsFromTimes([at(500), at(100), at(300)], 600);
    expect(clips.map((c) => c.startSeconds)).toEqual([92, 292, 492]);
  });

  it("reports a time past the end of the video instead of dropping it silently", () => {
    const { clips, skipped } = clipsFromTimes([at(100), at(9000, "late", 7)], 600);
    expect(clips).toHaveLength(1);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ line: 7, seconds: 9000 });
    expect(skipped[0]!.why).toMatch(/past the end/);
  });

  it("does not run before the start or past the end of the video", () => {
    const { clips } = clipsFromTimes([at(2), at(598)], 600);
    expect(clips[0]!.startSeconds).toBe(0);
    expect(clips[1]!.endSeconds).toBe(600);
  });

  it("uses the camera the picker chooses, cutting at that camera's own time", () => {
    const { clips } = clipsFromTimes([at(100)], 600, {}, (start) => ({
      camera: "B",
      clipStartSeconds: start - 7.3,
    }));
    expect(clips[0]!.camera).toBe("B");
    expect(clips[0]!.clipStartSeconds).toBeCloseTo(92 - 7.3, 5);
  });

  it("reports a moment no camera has footage for", () => {
    const { clips, skipped } = clipsFromTimes([at(100)], 600, {}, () => null);
    expect(clips).toEqual([]);
    expect(skipped[0]!.why).toMatch(/No camera has footage/);
  });
});
