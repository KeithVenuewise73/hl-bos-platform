/**
 * Cut the chosen moments and join them into one video, and write the list of
 * every pick beside it. Writes only inside `workDir` and to the output file;
 * never touches the originals.
 *
 * The result is written under a temporary name and renamed when it is whole, so
 * a job that is stopped or fails never leaves something that looks finished.
 */

import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Analysis } from "./analyze.ts";
import {
  Cancelled,
  cutSegment,
  joinSegments,
  type Quality,
  type Tools,
  type VideoFacts,
} from "./ffmpeg.ts";
import { totalSeconds, type Moment } from "./moments.ts";

export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Plain-words list of every pick, for a person to review. */
export function describePicks(
  analysis: Analysis,
  labelA: string,
  labelB: string,
): string {
  const lines: string[] = [];
  const kept = totalSeconds(analysis.moments);
  const switches = analysis.moments.filter(
    (m, i) => i > 0 && analysis.moments[i - 1]!.camera !== m.camera,
  ).length;
  lines.push(
    analysis.mode === "broadcast"
      ? `Broadcast: ${analysis.moments.length} pieces, ${switches} camera switches, ${clock(kept)} kept of a ${clock(analysis.gameSeconds)} recording (${Math.round((100 * kept) / Math.max(1, analysis.gameSeconds))}%); long quiet stretches were left out.`
      : `${analysis.moments.length} moments kept, ${clock(kept)} of a ${clock(analysis.gameSeconds)} recording (${Math.round((100 * kept) / Math.max(1, analysis.gameSeconds))}%).`,
  );
  lines.push(
    `The second video started ${analysis.sync.offsetSeconds.toFixed(1)} s after the first (confidence ${analysis.sync.confidence.toFixed(2)}).`,
  );
  for (const n of analysis.notes) lines.push(`Note: ${n}`);
  lines.push("");
  analysis.moments.forEach((m, i) => {
    const cam = m.camera === "A" ? labelA : labelB;
    lines.push(
      `${String(i + 1).padStart(3)}. ${clock(m.startSeconds)} to ${clock(m.endSeconds)}  (${Math.round(m.endSeconds - m.startSeconds)} s)  camera: ${cam}  strength ${m.peak.toFixed(1)}`,
    );
  });
  return lines.join("\n");
}

/** What rendering needs to know about a plan; an Analysis and a highlight plan both fit. */
export interface RenderPlan {
  readonly moments: readonly Moment[];
  readonly factsA: VideoFacts;
  readonly factsB: VideoFacts;
}

export interface RenderOptions {
  readonly fileA: string;
  readonly fileB: string;
  readonly outFile: string;
  /** Where the small pieces are made. Pick a roomy drive: it holds roughly as much as the result. */
  readonly workDir: string;
  /** "draft" is smaller and quicker, for a first look. */
  readonly quality?: Quality;
  readonly keepWork?: boolean;
  readonly onStep?: (message: string) => void;
  /** How far along rendering is, 0 to 1. */
  readonly onProgress?: (fraction: number) => void;
  readonly signal?: AbortSignal;
}

export async function render(
  tools: Tools,
  plan: RenderPlan,
  o: RenderOptions,
): Promise<void> {
  const say = o.onStep ?? (() => undefined);
  const tell = o.onProgress ?? (() => undefined);
  const quality = o.quality ?? "full";
  if (plan.moments.length === 0) {
    throw new Error("No action was found, so there is nothing to join.");
  }
  const lengths = plan.moments.map((m) => m.endSeconds - m.startSeconds);
  const total = lengths.reduce((a, b) => a + b, 0);
  // Joining is quick next to cutting, so cutting is the first 97% of the bar.
  const CUT_SHARE = 0.97;
  const partial = `${o.outFile}.partial`;
  try {
    await mkdir(o.workDir, { recursive: true });
    const names: string[] = [];
    let doneSeconds = 0;
    for (let i = 0; i < plan.moments.length; i += 1) {
      const m = plan.moments[i]!;
      const name = join(o.workDir, `piece_${String(i + 1).padStart(4, "0")}.mp4`);
      say(`Cutting piece ${i + 1} of ${plan.moments.length}…`);
      const [file, facts] =
        m.camera === "A" ? [o.fileA, plan.factsA] : [o.fileB, plan.factsB];
      await cutSegment(
        tools,
        file,
        facts,
        m.clipStartSeconds,
        lengths[i]!,
        name,
        quality,
        {
          ...(o.signal ? { signal: o.signal } : {}),
          onProgress: (sec) =>
            tell((CUT_SHARE * (doneSeconds + Math.min(sec, lengths[i]!))) / total),
        },
      );
      doneSeconds += lengths[i]!;
      tell((CUT_SHARE * doneSeconds) / total);
      names.push(name);
    }
    const list = join(o.workDir, "pieces.txt");
    // The concat list wants forward slashes and escaped quotes.
    await writeFile(
      list,
      names
        .map((n) => `file '${n.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`)
        .join("\n") + "\n",
    );
    say("Joining the pieces into one video…");
    await joinSegments(tools, list, partial, o.signal ? { signal: o.signal } : {});
    await rename(partial, o.outFile);
    tell(1);
  } catch (e) {
    await rm(partial, { force: true });
    if (e instanceof Cancelled) say("Stopped. Nothing was kept.");
    throw e;
  } finally {
    if (o.keepWork !== true) await rm(o.workDir, { recursive: true, force: true });
  }
}
