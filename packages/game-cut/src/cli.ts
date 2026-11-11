/**
 * game-cut: two whole-game recordings in, one video of the action out.
 *
 *   node src/cli.ts <first-video> <second-video> <output.mp4> [options]
 *
 *   --ffmpeg <path>      ffmpeg to use (default: "ffmpeg" on the PATH)
 *   --ffprobe <path>     ffprobe to use (default: next to ffmpeg, or "ffprobe")
 *   --work <folder>      where the small pieces are made (default: beside the output)
 *   --mode <name>        "broadcast" (default): the whole game, following the play from
 *                        one end of the ice to the other; "highlights": only the strongest moments
 *   --quiet-cut <s>      broadcast: leave out quiet stretches at least this long (default 90)
 *   --max-share <0..1>   highlights: most of the game to keep (default 0.3)
 *   --dry-run            find and list the moments, make no video
 *   --offset <seconds>   skip lining up: the second video started this long after the first
 *
 * Reads the two videos and writes only the output, a picks list beside it, and
 * the work folder (removed when done).
 */

import { writeFile } from "node:fs/promises";
import { basename, dirname, join, parse } from "node:path";

import { analyze } from "./analyze.ts";
import { toolsWork, type Tools } from "./ffmpeg.ts";
import { describePicks, render } from "./render.ts";

function arg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

async function main(argv: string[]): Promise<number> {
  const positional = argv.filter(
    (a, i) =>
      !a.startsWith("--") &&
      !(i > 0 && argv[i - 1]!.startsWith("--") && argv[i - 1] !== "--dry-run"),
  );
  const [fileA, fileB, outFile] = positional;
  if (fileA === undefined || fileB === undefined || outFile === undefined) {
    console.error(
      "Usage: node src/cli.ts <first-video> <second-video> <output.mp4> [--ffmpeg path] [--work folder] [--mode broadcast|highlights] [--quiet-cut 90] [--max-share 0.3] [--dry-run] [--offset seconds]",
    );
    return 2;
  }
  const ffmpeg = arg(argv, "--ffmpeg") ?? "ffmpeg";
  const tools: Tools = {
    ffmpeg,
    ffprobe:
      arg(argv, "--ffprobe") ??
      (ffmpeg === "ffmpeg"
        ? "ffprobe"
        : join(
            dirname(ffmpeg),
            "ffprobe" + (ffmpeg.toLowerCase().endsWith(".exe") ? ".exe" : ""),
          )),
  };
  await toolsWork(tools);

  const maxShare = arg(argv, "--max-share");
  const quietCut = arg(argv, "--quiet-cut");
  const modeArg = arg(argv, "--mode");
  if (modeArg !== undefined && modeArg !== "broadcast" && modeArg !== "highlights") {
    console.error('--mode must be "broadcast" or "highlights".');
    return 2;
  }
  const offset = arg(argv, "--offset");
  const analysis = await analyze(tools, fileA, fileB, {
    ...(modeArg === undefined ? {} : { mode: modeArg }),
    moment: maxShare === undefined ? {} : { maxShare: Number(maxShare) },
    broadcast: quietCut === undefined ? {} : { quietCutSeconds: Number(quietCut) },
    ...(offset === undefined ? {} : { forcedOffsetSeconds: Number(offset) }),
    onStep: (m) => console.log(m),
  });

  const picks = describePicks(analysis, basename(fileA), basename(fileB));
  const listFile = join(dirname(outFile), `${parse(outFile).name}-picks.txt`);
  await writeFile(listFile, picks + "\n");
  console.log(picks);
  console.log(`\nThe list of picks is saved in ${listFile}`);

  if (argv.includes("--dry-run")) {
    console.log("Dry run: no video was made.");
    return 0;
  }
  await render(tools, analysis, {
    fileA,
    fileB,
    outFile,
    workDir:
      arg(argv, "--work") ??
      join(dirname(outFile), `.game-cut-work-${parse(outFile).name}`),
    onStep: (m) => console.log(m),
  });
  console.log(`Done: ${outFile}`);
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(`game-cut stopped: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  },
);
