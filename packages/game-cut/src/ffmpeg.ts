/**
 * The only file that runs ffmpeg and ffprobe. Everything else is arithmetic.
 *
 * It reads the video files and writes only to the work folder it is given: it
 * never changes, moves or deletes an original. The programs are run directly
 * with an argument list (no shell), so a file name cannot be turned into a
 * command.
 */

import { spawn } from "node:child_process";

export interface Tools {
  /** Full path to ffmpeg, or just "ffmpeg" when it is on the PATH. */
  readonly ffmpeg: string;
  readonly ffprobe: string;
}

export interface VideoFacts {
  readonly durationSeconds: number;
  /** When the phone says recording started, as seconds since 1970; null if the file does not say. */
  readonly startedAtEpoch: number | null;
  readonly width: number;
  readonly height: number;
  readonly hasAudio: boolean;
  /** HDR sources must be converted or they look washed out. */
  readonly isHdr: boolean;
}

interface Ran {
  readonly stdout: Buffer;
  readonly stderr: string;
}

function run(program: string, args: readonly string[]): Promise<Ran> {
  return new Promise((resolve, reject) => {
    const child = spawn(program, [...args], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const out: Buffer[] = [];
    let err = "";
    child.stdout.on("data", (d: Buffer) => out.push(d));
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    child.on("error", (e) =>
      reject(new Error(`Could not run ${program}: ${e.message}`)),
    );
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout: Buffer.concat(out), stderr: err });
      else
        reject(
          new Error(
            `${program} stopped with code ${String(code)}: ${err.split(/\r?\n/).slice(-6).join(" ")}`,
          ),
        );
    });
  });
}

export async function toolsWork(tools: Tools): Promise<void> {
  await run(tools.ffmpeg, ["-hide_banner", "-version"]);
  await run(tools.ffprobe, ["-hide_banner", "-version"]);
}

export async function probe(tools: Tools, file: string): Promise<VideoFacts> {
  const { stdout } = await run(tools.ffprobe, [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    file,
  ]);
  const j = JSON.parse(stdout.toString()) as {
    format?: { duration?: string; tags?: Record<string, string> };
    streams?: {
      codec_type?: string;
      width?: number;
      height?: number;
      color_transfer?: string;
      tags?: Record<string, string>;
    }[];
  };
  const video = j.streams?.find((s) => s.codec_type === "video");
  if (!video) throw new Error(`${file} has no video.`);
  const duration = Number(j.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0)
    throw new Error(`${file} has no readable length.`);
  const tag = j.format?.tags?.["creation_time"] ?? video.tags?.["creation_time"];
  const ms = tag === undefined ? Number.NaN : Date.parse(tag);
  const trc = video.color_transfer ?? "";
  return {
    durationSeconds: duration,
    startedAtEpoch: Number.isFinite(ms) ? ms / 1000 : null,
    width: video.width ?? 0,
    height: video.height ?? 0,
    hasAudio: (j.streams ?? []).some((s) => s.codec_type === "audio"),
    isHdr: trc === "smpte2084" || trc === "arib-std-b67",
  };
}

/** Loudness of the sound in dB, one reading per `stepSeconds`, from the start of the file. */
export async function loudnessSeries(
  tools: Tools,
  file: string,
  stepSeconds: number,
): Promise<number[]> {
  const rate = 16000;
  const n = Math.round(stepSeconds * rate);
  const { stdout } = await run(tools.ffmpeg, [
    "-nostats",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    file,
    "-vn",
    "-af",
    `aresample=${rate},asetnsamples=n=${n}:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-`,
    "-f",
    "null",
    "-",
  ]);
  const out: number[] = [];
  for (const line of stdout.toString().split(/\r?\n/)) {
    const m = /RMS_level=(.+)$/.exec(line);
    if (m === null) continue;
    const v = Number(m[1]);
    out.push(Number.isFinite(v) ? Math.max(v, -90) : -90); // "-inf" is silence
  }
  return out;
}

/**
 * How much the picture changed since the reading before, one reading per
 * `stepSeconds`. The picture is shrunk to a thumbnail first: only big,
 * quick changes (players, a rush) count, not sensor noise.
 */
export async function motionSeries(
  tools: Tools,
  file: string,
  stepSeconds: number,
): Promise<number[]> {
  const w = 64;
  const h = 36;
  const { stdout } = await run(tools.ffmpeg, [
    "-nostats",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    file,
    "-an",
    "-vf",
    `fps=${1 / stepSeconds},scale=${w}:${h}:flags=area,format=gray`,
    "-f",
    "rawvideo",
    "-",
  ]);
  const frame = w * h;
  const frames = Math.floor(stdout.length / frame);
  const out: number[] = [0];
  for (let f = 1; f < frames; f += 1) {
    let sum = 0;
    const base = f * frame;
    const prev = (f - 1) * frame;
    for (let i = 0; i < frame; i += 1)
      sum += Math.abs(stdout[base + i]! - stdout[prev + i]!);
    out.push(sum / frame);
  }
  return out;
}

/** Picture steps that turn an HDR iPhone video into ordinary colours; empty for ordinary video. */
export function hdrFilter(isHdr: boolean): string {
  return isHdr
    ? "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p,"
    : "";
}

/** Cut one stretch of one file into its own small video, same size and speed as every other piece. */
export async function cutSegment(
  tools: Tools,
  file: string,
  facts: VideoFacts,
  startSeconds: number,
  lengthSeconds: number,
  outFile: string,
): Promise<void> {
  const video =
    `${hdrFilter(facts.isHdr)}scale=1920:1080:force_original_aspect_ratio=decrease,` +
    `pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p`;
  const args = [
    "-y",
    "-nostats",
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    startSeconds.toFixed(3),
    "-t",
    lengthSeconds.toFixed(3),
    "-i",
    file,
    "-vf",
    video,
  ];
  if (facts.hasAudio)
    args.push("-af", "aresample=48000", "-c:a", "aac", "-ar", "48000", "-ac", "2");
  else args.push("-an");
  args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "20", outFile);
  await run(tools.ffmpeg, args);
}

/** Join the pieces, in the order given, without re-encoding. `listFile` names them one per line. */
export async function joinSegments(
  tools: Tools,
  listFile: string,
  outFile: string,
): Promise<void> {
  await run(tools.ffmpeg, [
    "-y",
    "-nostats",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listFile,
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    outFile,
  ]);
}
