/**
 * The whole thing on two made-up "game" recordings with known events, so the
 * answer is known in advance:
 *
 *   game time   what happens                          who sees the movement
 *   15-17 s     loud burst + movement                 camera A (near it)
 *   60-62 s     loud burst + movement                 camera A
 *   115-117 s   loud burst + movement                 camera B (near it)
 *   170-172 s   loud burst + movement                 camera A
 *
 * Camera B was started 7.3 s after A and hears everything at half volume. The
 * files' own timestamps say 7.0 s, so lining up has to correct it to 7.3.
 * Needs ffmpeg and ffprobe on the PATH; skipped (and said so) when they are not.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { analyze } from "./analyze.ts";
import { totalSeconds } from "./moments.ts";
import { probe, type Tools } from "./ffmpeg.ts";
import { render } from "./render.ts";

const tools: Tools = { ffmpeg: "ffmpeg", ffprobe: "ffprobe" };
const haveFfmpeg =
  spawnSync("ffmpeg", ["-version"]).status === 0 &&
  spawnSync("ffprobe", ["-version"]).status === 0;

function ff(args: string[]): void {
  execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]);
}

const GAME = 240; // a realistic share: four 12 s moments are a fifth of it
const OFFSET = 7.3;
const BURSTS = [15, 60, 115, 170];

describe.skipIf(!haveFfmpeg)("two cameras in, one video of the action out", () => {
  let dir = "";
  let fileA = "";
  let fileB = "";

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "game-cut-"));
    const sound = join(dir, "sound.wav");
    const gate = BURSTS.map((b) => `between(t,${b},${b + 2})`).join("+");
    ff([
      "-f",
      "lavfi",
      "-i",
      `aevalsrc='(${gate})*0.7*sin(2*PI*600*t)+0.02*(random(0)*2-1)':s=48000:d=${GAME}`,
      sound,
    ]);
    const boxes = (windows: number[][]) =>
      windows.map(([s, e]) => `between(t,${s},${e})`).join("+");
    // A white square that really moves (the overlay position is re-worked every frame).
    const video = (windows: number[][]) =>
      `color=c=0x303030:s=320x180:r=30:d=${GAME}[bg];` +
      `color=c=white:s=40x40:r=30:d=${GAME}[box];` +
      `[bg][box]overlay=x='20+mod(t*60,200)':y=60:eval=frame:enable='${boxes(windows)}'`;

    fileA = join(dir, "A.mp4");
    ff([
      "-f",
      "lavfi",
      "-i",
      video([
        [15, 17],
        [60, 62],
        [170, 172],
      ]),
      "-i",
      sound,
      "-t",
      String(GAME),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-metadata",
      "creation_time=2026-11-08T20:00:00Z",
      fileA,
    ]);
    fileB = join(dir, "B.mp4");
    // B's own clock is game time minus 7.3. It hears the same sound at half volume.
    ff([
      "-f",
      "lavfi",
      "-i",
      video([[115 - OFFSET, 117 - OFFSET]]),
      "-ss",
      String(OFFSET),
      "-i",
      sound,
      "-af",
      "volume=0.5",
      "-t",
      String(GAME - OFFSET),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-metadata",
      "creation_time=2026-11-08T20:00:07Z",
      fileB,
    ]);
  }, 120_000);

  afterAll(async () => {
    if (dir !== "") await rm(dir, { recursive: true, force: true });
  });

  it("lines the cameras up to within a fifth of a second, correcting the files' own 7.0 s", async () => {
    const a = await analyze(tools, fileA, fileB);
    expect(a.guessedOffsetSeconds).toBeCloseTo(7.0, 1);
    expect(a.sync.offsetSeconds).toBeGreaterThan(OFFSET - 0.2);
    expect(a.sync.offsetSeconds).toBeLessThan(OFFSET + 0.2);
    expect(a.sync.confidence).toBeGreaterThan(0.15);
  }, 120_000);

  it("says so when the sound and the files' own start times disagree by a lot", async () => {
    const wrong = join(dir, "B-wrong-clock.mp4");
    // Same recording, but its clock says it started a minute later than it really did.
    ff([
      "-i",
      fileB,
      "-c",
      "copy",
      "-metadata",
      "creation_time=2026-11-08T20:01:07Z",
      wrong,
    ]);
    const a = await analyze(tools, fileA, wrong, { mode: "highlights" });
    expect(a.sync.offsetSeconds).toBeGreaterThan(OFFSET - 0.2); // the sound still finds the truth
    expect(a.sync.offsetSeconds).toBeLessThan(OFFSET + 0.2);
    expect(a.notes.join(" ")).toMatch(/the files' own start times say 67\.0 s/);
  }, 120_000);

  it("finds the four moments, in order, and picks the camera that saw each best", async () => {
    const a = await analyze(tools, fileA, fileB, { mode: "highlights" });
    expect(a.moments).toHaveLength(4);
    a.moments.forEach((m, i) => {
      const burst = BURSTS[i]!;
      expect(m.startSeconds).toBeLessThanOrEqual(burst + 0.5);
      expect(m.endSeconds).toBeGreaterThanOrEqual(burst + 1.5);
    });
    expect(a.moments.map((m) => m.camera)).toEqual(["A", "A", "B", "A"]);
    // The cut points for B are on B's own clock.
    expect(a.moments[2]!.clipStartSeconds).toBeCloseTo(
      a.moments[2]!.startSeconds - a.sync.offsetSeconds,
      5,
    );
  }, 120_000);

  it("broadcast: follows the play, A then B then A, as one continuous game", async () => {
    const a = await analyze(tools, fileA, fileB, { mode: "broadcast" });
    expect(a.mode).toBe("broadcast");
    const cams = a.moments.map((m) => m.camera);
    // The compressed sequence of cameras is A, B, A.
    expect(cams.filter((c, i) => i === 0 || cams[i - 1] !== c)).toEqual([
      "A",
      "B",
      "A",
    ]);
    // The stretch where B sees the action is the one holding game time 115-117.
    const b = a.moments.find((m) => m.camera === "B")!;
    expect(b.startSeconds).toBeLessThanOrEqual(115);
    expect(b.endSeconds).toBeGreaterThanOrEqual(117);
    // The quiet gaps here are shorter than 90 s, so the whole recording is kept, with no holes.
    expect(a.moments[0]!.startSeconds).toBe(0);
    for (let i = 1; i < a.moments.length; i += 1) {
      expect(a.moments[i]!.startSeconds).toBeCloseTo(a.moments[i - 1]!.endSeconds, 5);
    }
    expect(totalSeconds(a.moments)).toBeGreaterThan(GAME * 0.95);
  }, 120_000);

  it("broadcast: a short quiet-cut leaves the quiet stretches out", async () => {
    const a = await analyze(tools, fileA, fileB, {
      mode: "broadcast",
      broadcast: { quietCutSeconds: 20 },
    });
    expect(totalSeconds(a.moments)).toBeLessThan(GAME * 0.6);
    expect(a.moments.length).toBeGreaterThanOrEqual(3);
  }, 120_000);

  it("makes one playable video with picture and sound, about as long as the picks, and leaves the originals alone", async () => {
    const before = [await readFile(fileA), await readFile(fileB)];
    const a = await analyze(tools, fileA, fileB, { mode: "highlights" });
    const out = join(dir, "action.mp4");
    const work = join(dir, "work");
    await render(tools, a, { fileA, fileB, outFile: out, workDir: work });
    const facts = await probe(tools, out);
    const wanted = a.moments.reduce((t, m) => t + (m.endSeconds - m.startSeconds), 0);
    expect(Math.abs(facts.durationSeconds - wanted)).toBeLessThan(1.5);
    expect(facts.hasAudio).toBe(true);
    expect(facts.width).toBe(1920);
    expect(facts.height).toBe(1080);
    expect(existsSync(work)).toBe(false); // the small pieces are cleaned up
    const after = [await readFile(fileA), await readFile(fileB)];
    expect(after[0]!.equals(before[0]!)).toBe(true);
    expect(after[1]!.equals(before[1]!)).toBe(true);
  }, 180_000);

  it("the command line can list the picks without making a video", () => {
    const out = join(dir, "dry.mp4");
    const r = spawnSync(
      process.execPath,
      [
        join(import.meta.dirname, "cli.ts"),
        fileA,
        fileB,
        out,
        "--mode",
        "highlights",
        "--dry-run",
      ],
      {
        encoding: "utf8",
      },
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/4 moments kept/);
    expect(r.stdout).toMatch(/Dry run: no video was made/);
    expect(existsSync(out)).toBe(false);
    expect(existsSync(join(dir, "dry-picks.txt"))).toBe(true);
  }, 120_000);

  it("turns an HDR source into ordinary colours instead of failing", async () => {
    const hdr = join(dir, "hdr.mp4");
    ff([
      "-f",
      "lavfi",
      "-i",
      "color=c=0x606060:s=320x180:r=30:d=3",
      "-f",
      "lavfi",
      "-i",
      "sine=f=500:d=3",
      "-c:v",
      "libx265",
      "-pix_fmt",
      "yuv420p10le",
      "-color_primaries",
      "bt2020",
      "-color_trc",
      "arib-std-b67",
      "-colorspace",
      "bt2020nc",
      "-tag:v",
      "hvc1",
      "-c:a",
      "aac",
      hdr,
    ]);
    const facts = await probe(tools, hdr);
    expect(facts.isHdr).toBe(true);
    const { cutSegment } = await import("./ffmpeg.ts");
    const piece = join(dir, "hdr-piece.mp4");
    await cutSegment(tools, hdr, facts, 0, 2, piece);
    const out = await probe(tools, piece);
    expect(out.width).toBe(1920);
    expect(out.isHdr).toBe(false);
  }, 120_000);
});
