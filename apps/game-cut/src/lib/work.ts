import "server-only";

import { existsSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, parse } from "node:path";
import { stat, writeFile } from "node:fs/promises";

import {
  analyze,
  applyForced,
  bytesNeeded,
  checkRoom,
  chooseCamera,
  clipsFromTimes,
  freeBytes,
  parseTimestamps,
  planHighlights,
  render,
  toGameSeconds,
  type Analysis,
  type CameraChoice,
  type ClockBasis,
  type Moment,
  type Quality,
  type TimedMoment,
} from "@hl-bos/game-cut";

import { findTools } from "./engine.ts";
import type { JobContext } from "./jobs.ts";
import { getPlan, newPlanId, savePlan, type StoredPlan } from "./plans.ts";
import { picksFileText, summarizeBroadcast, summarizeTimes } from "./summarize.ts";
import type { JobResult, PlanSummary } from "./types.ts";

/**
 * The three kinds of work: look at two videos and plan a broadcast; plan
 * highlights from typed times; make the video from a plan. Each is given a
 * JobContext and reports through it. Nothing here touches an original.
 */

function needTools() {
  const tools = findTools();
  if (tools === null) {
    throw new Error(
      "ffmpeg is not installed on this computer, so nothing can be read or cut.",
    );
  }
  return tools;
}

function needFile(path: string, what: string): void {
  if (!isAbsolute(path) || !existsSync(path) || !statSync(path).isFile()) {
    throw new Error(`${what} could not be found: ${path}`);
  }
}

export interface BroadcastParams {
  readonly fileA: string;
  readonly fileB: string;
  /** Quiet stretches at least this long are cut; null keeps everything. */
  readonly quietCutSeconds: number | null;
}

export function planBroadcastWork(p: BroadcastParams) {
  return async (ctx: JobContext): Promise<JobResult> => {
    const tools = needTools();
    needFile(p.fileA, "The first video");
    needFile(p.fileB, "The second video");
    if (p.fileA === p.fileB)
      throw new Error("The two videos are the same file. Choose two different videos.");
    const analysis = await analyze(tools, p.fileA, p.fileB, {
      mode: "broadcast",
      broadcast:
        p.quietCutSeconds === null
          ? { quietCutSeconds: Infinity }
          : { quietCutSeconds: p.quietCutSeconds },
      signal: ctx.signal,
      onStep: (m) => ctx.step(m),
      onProgress: (f) => ctx.progress(f),
    });
    const id = newPlanId();
    await savePlan({ kind: "broadcast", id, fileA: p.fileA, fileB: p.fileB, analysis });
    return {
      kind: "plan",
      plan: summarizeBroadcast(
        id,
        { a: basename(p.fileA), b: basename(p.fileB) },
        analysis,
      ),
    };
  };
}

export interface TimesParams {
  readonly fileA: string;
  readonly fileB: string | null;
  readonly timesText: string;
  readonly beforeSeconds: number;
  readonly afterSeconds: number;
}

export function planTimesWork(p: TimesParams) {
  return async (ctx: JobContext): Promise<JobResult> => {
    const tools = needTools();
    needFile(p.fileA, "The first video");
    if (p.fileB !== null) needFile(p.fileB, "The second video");
    if (p.fileB === p.fileA)
      throw new Error(
        "The two videos are the same file. Choose two different videos, or leave the second one out.",
      );
    const plan = await planHighlights(tools, p.fileA, p.fileB, p.timesText, {
      beforeSeconds: p.beforeSeconds,
      afterSeconds: p.afterSeconds,
      signal: ctx.signal,
      onStep: (m) => ctx.step(m),
      onProgress: (f) => ctx.progress(f),
    });
    const id = newPlanId();
    await savePlan({ kind: "times", id, fileA: p.fileA, fileB: p.fileB, plan });
    return {
      kind: "plan",
      plan: summarizeTimes(
        id,
        { a: basename(p.fileA), b: p.fileB === null ? null : basename(p.fileB) },
        plan,
      ),
    };
  };
}

export interface MakeParams {
  readonly planId: string;
  readonly outFile: string;
  readonly quality: Quality;
}

export type MakeCheck =
  | { readonly ok: true; readonly warning: string | null; readonly seconds: number }
  | { readonly ok: false; readonly status: number; readonly message: string };

const driveName = (p: string) =>
  (/^[A-Za-z]:/.exec(p)?.[0] ?? "that drive").toUpperCase();

/** Everything that can be checked BEFORE a long job starts: said plainly, refused early. */
export async function checkMake(p: MakeParams): Promise<MakeCheck> {
  const plan = await getPlan(p.planId);
  if (plan === undefined) {
    return {
      ok: false,
      status: 404,
      message:
        "That plan is no longer available (Game Cut was restarted). Press the button that shows what it picks again.",
    };
  }
  if (findTools() === null) {
    return {
      ok: false,
      status: 422,
      message: "ffmpeg is not installed on this computer, so nothing can be made.",
    };
  }
  if (!isAbsolute(p.outFile) || !/\.mp4$/i.test(p.outFile)) {
    return {
      ok: false,
      status: 400,
      message: "Choose where to save the finished video first (a name ending in .mp4).",
    };
  }
  if (p.outFile === plan.fileA || p.outFile === plan.fileB) {
    return {
      ok: false,
      status: 400,
      message:
        "The finished video cannot replace one of the game videos. Choose a different name.",
    };
  }
  try {
    if (!(await stat(dirname(p.outFile))).isDirectory())
      throw new Error("not a folder");
  } catch {
    return {
      ok: false,
      status: 400,
      message: `The folder for the finished video does not exist: ${dirname(p.outFile)}`,
    };
  }
  for (const f of [plan.fileA, plan.fileB]) {
    if (f !== null && !existsSync(f)) {
      return {
        ok: false,
        status: 422,
        message: `A game video has moved or is no longer there: ${f}`,
      };
    }
  }
  const moments = plan.kind === "broadcast" ? plan.analysis.moments : plan.plan.clips;
  if (moments.length === 0) {
    return { ok: false, status: 422, message: "The plan has nothing in it to make." };
  }
  const seconds = moments.reduce((t, m) => t + (m.endSeconds - m.startSeconds), 0);
  const need = bytesNeeded(seconds, p.quality);
  const room = checkRoom(
    driveName(p.outFile),
    await freeBytes(dirname(p.outFile)),
    need.peak,
  );
  if (!room.enough) return { ok: false, status: 422, message: room.message };
  const onC = /^c:/i.test(p.outFile);
  const warning = onC
    ? `This is being saved on the laptop's own drive (C:), which fills up quickly. ${room.message}`
    : room.known
      ? null
      : room.message;
  return { ok: true, warning, seconds };
}

export function makeWork(
  p: MakeParams,
  keepAwake: () => Promise<{ held: boolean; release(): void }>,
) {
  return async (ctx: JobContext): Promise<JobResult> => {
    const tools = needTools();
    const plan = await getPlan(p.planId);
    if (plan === undefined)
      throw new Error("That plan is no longer available. Plan it again.");
    const awake = await keepAwake();
    ctx.awake(awake.held);
    try {
      const moments =
        plan.kind === "broadcast" ? plan.analysis.moments : plan.plan.clips;
      const [factsA, factsB] =
        plan.kind === "broadcast"
          ? [plan.analysis.factsA, plan.analysis.factsB]
          : [plan.plan.factsA, plan.plan.factsB];
      // The small pieces are made beside the result: a roomy drive was already checked,
      // and the laptop's own drive is never used for them.
      const workDir = join(
        dirname(p.outFile),
        `.game-cut-work-${parse(p.outFile).name}-${Date.now()}`,
      );
      await render(
        tools,
        { moments, factsA, factsB },
        {
          fileA: plan.fileA,
          fileB: plan.fileB ?? plan.fileA,
          outFile: p.outFile,
          workDir,
          quality: p.quality,
          signal: ctx.signal,
          onStep: (m) => ctx.step(m),
          onProgress: (f) => ctx.progress(f),
        },
      );
      const bytes = (await stat(p.outFile)).size;
      const picksFile = await writePicksFile(p.outFile, plan);
      return {
        kind: "make",
        made: {
          planId: p.planId,
          picksFile,
          outFile: p.outFile,
          seconds: moments.reduce((t, m) => t + (m.endSeconds - m.startSeconds), 0),
          bytes,
          quality: p.quality,
        },
      };
    } finally {
      awake.release();
    }
  };
}

/** A stored plan as the page shows it. */
export function summarizeStored(plan: StoredPlan): PlanSummary {
  return plan.kind === "broadcast"
    ? summarizeBroadcast(
        plan.id,
        { a: basename(plan.fileA), b: basename(plan.fileB) },
        plan.analysis,
      )
    : summarizeTimes(
        plan.id,
        {
          a: basename(plan.fileA),
          b: plan.fileB === null ? null : basename(plan.fileB),
        },
        plan.plan,
      );
}

/**
 * Save the list of what was picked beside the finished video, so a person can see exactly
 * what was chosen and when. A list that cannot be written is not a reason to fail a video
 * that was made: it comes back as null and the page says so.
 */
async function writePicksFile(
  outFile: string,
  plan: StoredPlan,
): Promise<string | null> {
  const picks = join(dirname(outFile), `${parse(outFile).name} - picks.txt`);
  try {
    await writeFile(picks, picksFileText(summarizeStored(plan)));
    return picks;
  } catch {
    return null;
  }
}

export interface AdjustParams {
  /** The plan to add moments to. */
  readonly planId: string;
  /** One per line: a time, then what to call it. */
  readonly timesText: string;
  /** Which video's clock those times were read from. */
  readonly clock: ClockBasis;
  /** For the "finished video" clock: the plan whose video the person watched. */
  readonly watchedPlanId: string | null;
  readonly beforeSeconds: number;
  readonly afterSeconds: number;
}

const BASIS_WORDS: Record<ClockBasis, string> = {
  first: "first video's clock",
  second: "second video's clock",
  finished: "finished video's clock",
};

/**
 * Add moments a person is sure about to a plan that already exists, without looking at the
 * videos again (which takes the better part of an hour): each time is turned into game time,
 * the camera nearer it is chosen (a few seconds of reading per moment), and it replaces what
 * the plan had over that stretch, including time the plan had cut out. The original plan is
 * kept; the result is a new plan.
 */
export function adjustPlanWork(p: AdjustParams) {
  return async (ctx: JobContext): Promise<JobResult> => {
    const tools = needTools();
    const base = await getPlan(p.planId);
    if (base === undefined) {
      throw new Error("That plan is no longer available. Plan the game again.");
    }
    if (base.kind !== "broadcast") {
      throw new Error("Moments can be added to a whole-game plan.");
    }
    needFile(base.fileA, "The first video");
    needFile(base.fileB, "The second video");

    const parsed = parseTimestamps(p.timesText);
    if (parsed.moments.length === 0) {
      throw new Error(
        parsed.problems.length > 0
          ? "None of the lines could be read as a time. Each line should start with a time like 12:34 or 1:02:15."
          : "No times were given. Type one per line, like 53:25 big hit.",
      );
    }

    // For the finished video's clock, the pieces of THAT video are walked.
    let watched = base.analysis.moments;
    if (p.clock === "finished") {
      const w = p.watchedPlanId === null ? base : await getPlan(p.watchedPlanId);
      if (w === undefined || w.kind !== "broadcast") {
        throw new Error(
          "The finished video's plan is no longer available, so a time on it cannot be turned into game time. Use the first or second video's clock instead.",
        );
      }
      watched = w.analysis.moments;
    }
    const offset = base.analysis.sync.offsetSeconds;
    const skipped: { line: number; seconds: number; why: string }[] = [];
    const gameTimes: TimedMoment[] = [];
    for (const t of parsed.moments) {
      const game = toGameSeconds(t.seconds, p.clock, {
        offsetSeconds: offset,
        moments: watched,
      });
      if (game === null) {
        skipped.push({
          line: t.line,
          seconds: t.seconds,
          why: `That is past the end of the ${p.clock === "finished" ? "finished video" : "video"}, or before its start.`,
        });
      } else {
        gameTimes.push({ ...t, seconds: game });
      }
    }

    const layout = { beforeSeconds: p.beforeSeconds, afterSeconds: p.afterSeconds };
    const first = clipsFromTimes(gameTimes, base.analysis.gameSeconds, layout);
    const rig = {
      tools,
      fileA: base.fileA,
      fileB: base.fileB,
      factsA: base.analysis.factsA,
      factsB: base.analysis.factsB,
      offsetSeconds: offset,
    };
    const choices = new Map<number, CameraChoice | null>();
    for (let i = 0; i < first.clips.length; i += 1) {
      const c = first.clips[i]!;
      ctx.step(`Choosing the camera for moment ${i + 1} of ${first.clips.length}…`);
      ctx.progress(i / Math.max(1, first.clips.length));
      choices.set(
        c.startSeconds,
        await chooseCamera(rig, c.startSeconds, c.endSeconds, { signal: ctx.signal }),
      );
    }
    const placed = clipsFromTimes(
      gameTimes,
      base.analysis.gameSeconds,
      layout,
      (start) => choices.get(start) ?? null,
    );
    skipped.push(...placed.skipped);

    const forced: Moment[] = placed.clips.map((c) => ({
      ...c,
      label: c.label === "" ? "moment you asked for" : c.label,
    }));
    if (forced.length === 0) {
      throw new Error(
        "None of those moments could be added: " +
          skipped
            .map((x) => `${x.why}`)
            .filter((v, i, a) => a.indexOf(v) === i)
            .join(" "),
      );
    }
    const moments = applyForced(base.analysis.moments, forced);
    const added = forced.map(
      (f) =>
        `Added: ${f.label}, on the ${f.camera === "A" ? "first" : "second"} video (${BASIS_WORDS[p.clock]} as typed).`,
    );
    const analysis: Analysis = {
      ...base.analysis,
      moments,
      notes: [...base.analysis.notes, ...added],
    };
    const id = newPlanId();
    await savePlan({ ...base, id, analysis });
    const summary = summarizeBroadcast(
      id,
      { a: basename(base.fileA), b: basename(base.fileB) },
      analysis,
    );
    return {
      kind: "plan",
      plan: { ...summary, problems: parsed.problems, skipped },
    };
  };
}
