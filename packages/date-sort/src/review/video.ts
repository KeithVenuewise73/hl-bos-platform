/**
 * Short video clips for review: turn an iPhone clip into a small web video (H.264 + AAC in an MP4,
 * at most 1920 px on its long side, camera details and location removed) and a poster frame, ready
 * to be sent beside the game's photos.
 *
 * Needs ffmpeg, the free program GameCut also uses. It is looked for where Windows programs usually
 * keep it (not only on the PATH, which a freshly installed program is often missing from). If it is
 * not there nothing is converted and the person is told in words.
 *
 * Never touches the original: it is only read. Work files go in a temporary folder of this file's own
 * making, removed when the clip is done.
 *
 * The rules a clip must meet are written here, not guessed:
 *   - up to MAX_CLIP_SECONDS long (these are plays and shifts, not whole games: GameCut is for those);
 *   - the converted file must fit MAX_CLIP_BYTES (the website takes 50 MB): if the first try is too
 *     big it is converted again smaller, and if that is still too big the clip is left out, with the reason.
 */

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import sharp from "sharp";

import { hashOf, type ReviewCandidate } from "./prepare";

export const MAX_CLIP_SECONDS = 180;
export const MAX_CLIP_BYTES = 45 * 1024 * 1024;

export class ClipError extends Error {}

export interface Tools {
  readonly ffmpeg: string;
  readonly ffprobe: string;
  /** Can this ffmpeg convert HDR colours to normal ones (iPhone HDR clips look washed out without it)? */
  readonly tonemap: boolean;
}

// --- finding ffmpeg --------------------------------------------------------------------------------

export interface Places {
  readonly pathDirs: readonly string[];
  readonly localAppData: string;
  readonly programFiles: string;
  readonly programData: string;
  readonly home: string;
}

const win = (...p: string[]) => p.filter((x) => x !== "").join("\\");

/** Every full path worth trying for ffmpeg, best first. Pure. */
export function ffmpegCandidates(places: Places, windows: boolean): string[] {
  const exe = windows ? "ffmpeg.exe" : "ffmpeg";
  const out: string[] = [];
  const join2 = windows ? win : (...p: string[]) => p.filter((x) => x !== "").join("/");
  for (const d of places.pathDirs) out.push(join2(d.replace(/[\\/]+$/, ""), exe));
  if (windows) {
    if (places.localAppData !== "")
      out.push(join2(places.localAppData, "Microsoft", "WinGet", "Links", exe));
    if (places.programData !== "")
      out.push(join2(places.programData, "chocolatey", "bin", exe));
    if (places.home !== "") out.push(join2(places.home, "scoop", "shims", exe));
    for (const base of [places.programFiles, "C:"])
      if (base !== "") out.push(join2(base, "ffmpeg", "bin", exe));
  }
  return [...new Set(out)];
}

export const ffprobeBeside = (ffmpegPath: string) =>
  ffmpegPath.replace(
    /ffmpeg(\.exe)?$/i,
    (_m, ext: string | undefined) => `ffprobe${ext ?? ""}`,
  );

interface Ran {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function run(
  cmd: string,
  args: readonly string[],
  signal?: AbortSignal,
  timeoutMs = 60_000,
): Promise<Ran> {
  return new Promise((resolve, reject) => {
    const guard = AbortSignal.timeout(timeoutMs);
    const child = spawn(cmd, [...args], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      signal: signal ? AbortSignal.any([signal, guard]) : guard,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => {
      if (stdout.length < 4_000_000) stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      if (stderr.length < 20_000) stderr += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

/** The ffmpeg and ffprobe on this computer, or null when there is none that works. */
export async function findTools(): Promise<Tools | null> {
  const windows = process.platform === "win32";
  // eslint-disable-next-line no-restricted-properties -- reading where programs are kept, not configuration
  const env = process.env;
  const places: Places = {
    pathDirs: (env["PATH"] ?? env["Path"] ?? "").split(delimiter).filter(Boolean),
    localAppData: env["LOCALAPPDATA"] ?? "",
    programFiles: env["ProgramFiles"] ?? "",
    programData: env["ProgramData"] ?? "",
    home: env["USERPROFILE"] ?? env["HOME"] ?? "",
  };
  for (const ffmpeg of ffmpegCandidates(places, windows)) {
    const ffprobe = ffprobeBeside(ffmpeg);
    try {
      const a = await run(ffmpeg, ["-hide_banner", "-version"]);
      const b = await run(ffprobe, ["-hide_banner", "-version"]);
      if (a.code !== 0 || b.code !== 0) continue;
      const f = await run(ffmpeg, ["-hide_banner", "-filters"]);
      return {
        ffmpeg,
        ffprobe,
        tonemap: /\bzscale\b/.test(f.stdout) && /\btonemap\b/.test(f.stdout),
      };
    } catch {
      // not here: try the next place
    }
  }
  return null;
}

// --- looking at a clip -----------------------------------------------------------------------------

export interface ClipFacts {
  readonly durationSeconds: number;
  /** As a person sees it: after the phone's rotation is applied. */
  readonly width: number;
  readonly height: number;
  readonly hdr: boolean;
  readonly hasAudio: boolean;
}

interface ProbeStream {
  codec_type?: string;
  width?: number;
  height?: number;
  duration?: string;
  color_transfer?: string;
  tags?: Record<string, string>;
  side_data_list?: { rotation?: number; side_data_type?: string }[];
  disposition?: { attached_pic?: number };
}

/** What ffprobe (-print_format json -show_format -show_streams) said, as facts. Pure. */
export function parseProbe(json: unknown): ClipFacts | null {
  const j = json as { streams?: ProbeStream[]; format?: { duration?: string } } | null;
  const streams = j?.streams ?? [];
  const v = streams.find(
    (s) => s.codec_type === "video" && s.disposition?.attached_pic !== 1,
  );
  if (v === undefined || !v.width || !v.height) return null;
  const rot = Math.abs(
    Number(
      v.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ??
        v.tags?.["rotate"] ??
        0,
    ),
  );
  const turned = rot === 90 || rot === 270;
  const duration = Number(j?.format?.duration ?? v.duration ?? NaN);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  return {
    durationSeconds: Math.round(duration * 100) / 100,
    width: turned ? v.height : v.width,
    height: turned ? v.width : v.height,
    hdr:
      v.color_transfer === "smpte2084" ||
      v.color_transfer === "arib-std-b67" ||
      (v.side_data_list ?? []).some((d) =>
        /dolby vision/i.test(d.side_data_type ?? ""),
      ),
    hasAudio: streams.some((s) => s.codec_type === "audio"),
  };
}

// --- converting ------------------------------------------------------------------------------------

/** First try, then a smaller second try when the file came out too big. */
const TRIES = [
  { edge: 1920, crf: 26, maxrate: "6M" },
  { edge: 1280, crf: 30, maxrate: "2500k" },
] as const;

/** The ffmpeg arguments for one conversion. Pure, so the rules are tested without a video. */
export function transcodeArgs(
  input: string,
  output: string,
  facts: ClipFacts,
  tryNo: 0 | 1,
  tonemap: boolean,
): string[] {
  const t = TRIES[tryNo];
  const fit = `scale=w=min(${t.edge}\\,iw):h=min(${t.edge}\\,ih):force_original_aspect_ratio=decrease:force_divisible_by=2`;
  const sdr =
    "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p";
  const vf = facts.hdr && tonemap ? `${sdr},${fit}` : fit;
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    input,
    "-map",
    "0:v:0",
    ...(facts.hasAudio ? ["-map", "0:a:0"] : []),
    "-vf",
    vf,
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    String(t.crf),
    "-maxrate",
    t.maxrate,
    "-bufsize",
    t.maxrate.endsWith("M") ? `${Number(t.maxrate.slice(0, -1)) * 2}M` : "5000k",
    "-pix_fmt",
    "yuv420p",
    "-profile:v",
    "high",
    "-movflags",
    "+faststart",
    ...(facts.hasAudio ? ["-c:a", "aac", "-b:a", "128k", "-ac", "2"] : ["-an"]),
    "-map_metadata",
    "-1",
    "-map_chapters",
    "-1",
    output,
  ];
}

export interface PreparedClip {
  /** SHA-256 of the ORIGINAL file (the same fingerprint every photo has). */
  readonly hash: string;
  readonly filename: string;
  readonly takenAt: string | null;
  readonly dateEstimated: boolean;
  readonly width: number;
  readonly height: number;
  readonly durationSeconds: number;
  /** The poster frame and its thumbnail (same sizes as a photo's). */
  readonly web: Buffer;
  readonly thumb: Buffer;
  /** The web video. */
  readonly video: Buffer;
  /** Things worth telling the person (for example HDR colours that could not be converted). */
  readonly notes: readonly string[];
}

const name = (p: string) => p.split(/[\\/]/).pop() ?? p;

/** One clip, ready to send. Throws ClipError with a plain reason when it cannot be. */
export async function prepareClip(
  root: string,
  c: ReviewCandidate,
  tools: Tools,
  signal?: AbortSignal,
): Promise<PreparedClip> {
  const input = join(root, c.path);
  const file = name(c.path);
  let probed;
  try {
    probed = await run(
      tools.ffprobe,
      ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", input],
      signal,
    );
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new ClipError(`${file} could not be read as a video.`);
  }
  let facts: ClipFacts | null;
  try {
    facts = probed.code === 0 ? parseProbe(JSON.parse(probed.stdout)) : null;
  } catch {
    facts = null;
  }
  if (facts === null) throw new ClipError(`${file} could not be read as a video.`);
  if (facts.durationSeconds > MAX_CLIP_SECONDS)
    throw new ClipError(
      `${file} is ${Math.round(facts.durationSeconds)} seconds long. Clips for the game page are up to ${MAX_CLIP_SECONDS} seconds; use GameCut for a whole game.`,
    );

  const notes: string[] = [];
  if (facts.hdr && !tools.tonemap)
    notes.push(
      `${file} is HDR and this copy of ffmpeg cannot convert HDR colours, so it may look washed out.`,
    );
  const dir = await mkdtemp(join(tmpdir(), "datesort-clip-"));
  try {
    const out = join(dir, "clip.mp4");
    let video: Buffer | null = null;
    for (const tryNo of [0, 1] as const) {
      const r = await run(
        tools.ffmpeg,
        transcodeArgs(input, out, facts, tryNo, tools.tonemap),
        signal,
        Math.max(300_000, facts.durationSeconds * 20_000),
      );
      if (r.code !== 0)
        throw new ClipError(
          `${file} could not be converted: ${(r.stderr.trim().split(/\r?\n/).pop() ?? "ffmpeg stopped").slice(0, 160)}`,
        );
      const bytes = await readFile(out);
      if (bytes.length <= MAX_CLIP_BYTES) {
        video = bytes;
        break;
      }
    }
    if (video === null)
      throw new ClipError(
        `${file} is still over ${Math.round(MAX_CLIP_BYTES / 1048576)} MB after converting, so it was left out.`,
      );
    const posterFile = join(dir, "poster.jpg");
    const at = Math.min(1, facts.durationSeconds / 2);
    const p = await run(
      tools.ffmpeg,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        String(at),
        "-i",
        out,
        "-frames:v",
        "1",
        "-q:v",
        "2",
        posterFile,
      ],
      signal,
    );
    if (p.code !== 0) throw new ClipError(`${file}: no poster frame could be taken.`);
    const poster = await readFile(posterFile);
    // Same sizes as a photo's web copy and thumbnail; no metadata.
    const web = await sharp(poster)
      .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    const thumb = await sharp(poster)
      .resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 78 })
      .toBuffer();
    const seen = await sharp(web).metadata();
    return {
      hash: await hashOf(root, c.path),
      filename: file,
      takenAt: c.takenAt,
      dateEstimated: c.dateEstimated,
      width: seen.width ?? facts.width,
      height: seen.height ?? facts.height,
      durationSeconds: facts.durationSeconds,
      web,
      thumb,
      video,
      notes,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
