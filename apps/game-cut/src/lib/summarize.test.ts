import { describe, expect, it } from "vitest";

import type { Analysis, HighlightPlanResult } from "@hl-bos/game-cut";

import { summarizeBroadcast, summarizeTimes } from "./summarize.ts";

const moment = (startSeconds: number, endSeconds: number, camera: "A" | "B") => ({
  startSeconds,
  endSeconds,
  camera,
  clipStartSeconds: startSeconds,
  peak: 5,
  scoreA: 1,
  scoreB: 1,
});

describe("how a plan is shown", () => {
  it("a broadcast: rows in order, kept time, camera switches, and the alignment", () => {
    const analysis = {
      moments: [
        moment(0, 40, "A"),
        moment(40, 100, "B"),
        moment(100, 130, "B"),
        moment(130, 200, "A"),
      ],
      gameSeconds: 4800,
      sync: { offsetSeconds: 7.3, confidence: 0.4 },
      notes: ["a note"],
    } as unknown as Analysis;
    const s = summarizeBroadcast("plan-1", { a: "A.mov", b: "B.mov" }, analysis);
    expect(s.rows.map((r) => [r.n, r.camera, r.lengthSeconds])).toEqual([
      [1, "A", 40],
      [2, "B", 60],
      [3, "B", 30],
      [4, "A", 70],
    ]);
    expect(s.keptSeconds).toBe(200);
    expect(s.gameSeconds).toBe(4800);
    expect(s.switches).toBe(2);
    expect(s).toMatchObject({
      mode: "broadcast",
      offsetSeconds: 7.3,
      confidence: 0.4,
      hasSecondCamera: true,
      notes: ["a note"],
    });
  });

  it("highlights: names carried through, and what could not be used", () => {
    const plan = {
      clips: [
        { ...moment(92, 106, "A"), label: "goal" },
        { ...moment(300, 314, "B"), label: "" },
      ],
      factsA: { durationSeconds: 4700 },
      hasSecondCamera: true,
      alignment: { sync: { offsetSeconds: 7.5, confidence: 0.5 } },
      skipped: [{ line: 4, seconds: 99999, why: "past the end" }],
      problems: [{ line: 2, text: "oops", why: "no time" }],
      notes: [],
    } as unknown as HighlightPlanResult;
    const s = summarizeTimes("plan-2", { a: "A.mov", b: "B.mov" }, plan);
    expect(s.rows.map((r) => r.label)).toEqual(["goal", ""]);
    expect(s.gameSeconds).toBe(4700);
    expect(s.keptSeconds).toBe(28);
    expect(s.skipped).toHaveLength(1);
    expect(s.problems).toHaveLength(1);
    expect(s.offsetSeconds).toBe(7.5);
  });

  it("with one camera there is no alignment to show", () => {
    const plan = {
      clips: [{ ...moment(0, 10, "A"), label: "" }],
      factsA: { durationSeconds: 100 },
      hasSecondCamera: false,
      alignment: null,
      skipped: [],
      problems: [],
      notes: [],
    } as unknown as HighlightPlanResult;
    const s = summarizeTimes("p", { a: "A.mov", b: null }, plan);
    expect(s).toMatchObject({
      hasSecondCamera: false,
      offsetSeconds: null,
      confidence: null,
    });
  });
});
