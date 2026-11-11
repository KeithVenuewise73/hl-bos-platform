import "server-only";

import { existsSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, parse } from "node:path";
import { stat } from "node:fs/promises";

import {
  analyze,
  bytesNeeded,
  checkRoom,
  freeBytes,
  planHighlights,
  render,
  type Quality,
} from "@hl-bos/game-cut";

import { findTools } from "./engine.ts";
import type { JobContext } from "./jobs.ts";
import { getPlan, newPlanId, savePlan } from "./plans.ts";
import { summarizeBroadcast, summarizeTimes } from "./summarize.ts";
import type { JobResult } from "./types.ts";

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
    savePlan({ kind: "broadcast", id, fileA: p.fileA, fileB: p.fileB, analysis });
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
    savePlan({ kind: "times", id, fileA: p.fileA, fileB: p.fileB, plan });
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
  const plan = getPlan(p.planId);
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
    const plan = getPlan(p.planId);
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
      return {
        kind: "make",
        made: {
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
