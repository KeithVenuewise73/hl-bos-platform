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

import { picksFileText } from "./summarize.ts";
import type { PlanSummary } from "./types.ts";

describe("the picks list saved beside a finished video", () => {
  const plan: PlanSummary = {
    planId: "plan-x",
    mode: "broadcast",
    names: { a: "Shoot.MOV", b: "Defend.MOV" },
    hasSecondCamera: true,
    gameSeconds: 5210,
    keptSeconds: 4713,
    switches: 1,
    offsetSeconds: -117.4,
    confidence: 0.93,
    rows: [
      {
        n: 1,
        startSeconds: 0,
        endSeconds: 3200,
        lengthSeconds: 3200,
        camera: "A",
        label: "",
      },
      {
        n: 2,
        startSeconds: 3200,
        endSeconds: 3212,
        lengthSeconds: 12,
        camera: "B",
        label: "hit by my son",
      },
    ],
    notes: ["a note"],
    skipped: [],
    problems: [],
  };

  it("says what it is, how much was kept, and how the two clocks relate", () => {
    const t = picksFileText(plan, new Date("2026-11-11T12:00:00Z"));
    expect(t).toMatch(/whole game, one broadcast/);
    expect(t).toMatch(
      /2 pieces, 1:18:33 kept of a 1:26:50 recording, 1 camera switches/,
    );
    expect(t).toMatch(/second video started 117\.4 s BEFORE the first/);
    expect(t).toMatch(/plus 117\.4 s is the same moment on the second/);
    expect(t).toMatch(/Note: a note/);
  });

  it("lists every piece with its camera, the second video's time for it, and any name", () => {
    const t = picksFileText(plan);
    expect(t).toMatch(/1\. 0:00:00 to 0:53:20 .* first video \(Shoot\.MOV\)/);
    expect(t).toMatch(
      /2\. 0:53:20 to 0:53:32 .* second video \(Defend\.MOV\) {2}\(second video: 0:55:17\) {2}<- hit by my son/,
    );
  });

  it("is honest about a video that started after the first", () => {
    const t = picksFileText({ ...plan, offsetSeconds: 7.3 });
    expect(t).toMatch(/started 7\.3 s after the first/);
    expect(t).toMatch(/minus 7\.3 s is the same moment on the second/);
  });

  it("says so when the second video had not started yet at the start of a piece, instead of a wrong time", () => {
    const early = {
      ...plan,
      offsetSeconds: 7.3,
      rows: [
        {
          n: 1,
          startSeconds: 0,
          endSeconds: 60,
          lengthSeconds: 60,
          camera: "A" as const,
          label: "",
        },
      ],
    };
    const t = picksFileText(early);
    expect(t).toMatch(/\(second video had not started yet\)/);
    expect(t).not.toMatch(/second video: 0:00:00/);
  });
});
