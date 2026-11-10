/**
 * Cut the chosen moments and join them into one video, and write the list of
 * every pick beside it. Writes only inside `workDir` and to the two output
 * files; never touches the originals.
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Analysis } from "./analyze.ts";
import { cutSegment, joinSegments, type Tools } from "./ffmpeg.ts";
import { totalSeconds } from "./moments.ts";

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

export interface RenderOptions {
  readonly fileA: string;
  readonly fileB: string;
  readonly outFile: string;
  /** Where the small pieces are made. Pick a roomy drive: it holds roughly as much as the result. */
  readonly workDir: string;
  readonly keepWork?: boolean;
  readonly onStep?: (message: string) => void;
}

export async function render(
  tools: Tools,
  analysis: Analysis,
  o: RenderOptions,
): Promise<void> {
  const say = o.onStep ?? (() => undefined);
  if (analysis.moments.length === 0) {
    throw new Error("No action was found, so there is nothing to join.");
  }
  await mkdir(o.workDir, { recursive: true });
  const names: string[] = [];
  for (let i = 0; i < analysis.moments.length; i += 1) {
    const m = analysis.moments[i]!;
    const name = join(o.workDir, `piece_${String(i + 1).padStart(4, "0")}.mp4`);
    say(`Cutting piece ${i + 1} of ${analysis.moments.length}…`);
    const [file, facts] =
      m.camera === "A" ? [o.fileA, analysis.factsA] : [o.fileB, analysis.factsB];
    await cutSegment(
      tools,
      file,
      facts,
      m.clipStartSeconds,
      m.endSeconds - m.startSeconds,
      name,
    );
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
  await joinSegments(tools, list, o.outFile);
  if (o.keepWork !== true) await rm(o.workDir, { recursive: true, force: true });
}
