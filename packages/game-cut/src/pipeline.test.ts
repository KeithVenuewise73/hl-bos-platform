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
import {
  Cancelled,
  loudnessSeries,
  motionSeries,
  probe,
  type Tools,
} from "./ffmpeg.ts";
import { planHighlights } from "./plan-highlights.ts";
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
    // An iPhone HDR clip says "HLG, BT.2020" in the video stream itself. Encoders differ in whether
    // they pass those flags on (ffmpeg 6 does, 9 may not), so the tag is written into the stream
    // directly with a bitstream filter, which does not depend on the encoder.
    const plain = join(dir, "hdr-plain.mp4");
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
      "-x265-params",
      "colorprim=bt2020:transfer=arib-std-b67:colormatrix=bt2020nc",
      "-tag:v",
      "hvc1",
      "-c:a",
      "aac",
      plain,
    ]);
    const hdr = join(dir, "hdr.mp4");
    ff([
      "-i",
      plain,
      "-c",
      "copy",
      "-bsf:v",
      "hevc_metadata=colour_primaries=9:transfer_characteristics=18:matrix_coefficients=9",
      "-tag:v",
      "hvc1",
      hdr,
    ]);
    const facts = await probe(tools, hdr);
    const said = execFileSync("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_name,pix_fmt,color_transfer,color_primaries,color_space",
      "-of",
      "csv=p=0",
      hdr,
    ])
      .toString()
      .trim();
    expect(facts.isHdr, `ffprobe reported: ${said}`).toBe(true);
    const { cutSegment } = await import("./ffmpeg.ts");
    const piece = join(dir, "hdr-piece.mp4");
    await cutSegment(tools, hdr, facts, 0, 2, piece);
    const out = await probe(tools, piece);
    expect(out.width).toBe(1920);
    expect(out.isHdr).toBe(false);
  }, 120_000);

  it("highlights from times: reads the list, picks the camera that saw each moment, keeps the order", async () => {
    // Game time. 1:55 is where camera B (near that end) saw the action; the others are A's.
    const plan = await planHighlights(
      tools,
      fileA,
      fileB,
      [
        "0:15 first hit",
        "1:00 goal",
        "1:55 big shot",
        "bad line",
        "99:00 past the end",
      ].join("\n"),
    );
    expect(plan.hasSecondCamera).toBe(true);
    expect(plan.alignment!.sync.offsetSeconds).toBeGreaterThan(OFFSET - 0.2);
    expect(plan.alignment!.sync.offsetSeconds).toBeLessThan(OFFSET + 0.2);
    expect(plan.clips.map((c) => c.label)).toEqual(["first hit", "goal", "big shot"]);
    expect(plan.clips.map((c) => c.camera)).toEqual(["A", "A", "B"]);
    expect(plan.clips[2]!.clipStartSeconds).toBeCloseTo(
      plan.clips[2]!.startSeconds - plan.alignment!.sync.offsetSeconds,
      5,
    );
    expect(plan.problems.map((p) => p.line)).toEqual([4]);
    expect(plan.skipped.map((x) => x.line)).toEqual([5]);
  }, 180_000);

  it("highlights with one camera: no lining up needed, everything from that camera", async () => {
    const plan = await planHighlights(tools, fileA, null, "0:15\n1:00");
    expect(plan.hasSecondCamera).toBe(false);
    expect(plan.alignment).toBeNull();
    expect(plan.clips.map((c) => c.camera)).toEqual(["A", "A"]);
  }, 120_000);

  it("refuses a list with no readable time, saying what a line should look like", async () => {
    await expect(planHighlights(tools, fileA, null, "nothing here")).rejects.toThrow(
      /start with a time/,
    );
    await expect(planHighlights(tools, fileA, null, "")).rejects.toThrow(
      /No times were given/,
    );
  }, 60_000);

  it("draft quality is a smaller picture; progress only moves forward and ends at 1", async () => {
    const plan = await planHighlights(tools, fileA, null, "0:15\n1:00");
    const out = join(dir, "draft.mp4");
    const seen: number[] = [];
    await render(
      tools,
      { moments: plan.clips, factsA: plan.factsA, factsB: plan.factsB },
      {
        fileA,
        fileB: fileA,
        outFile: out,
        workDir: join(dir, "work-draft2"),
        quality: "draft",
        onProgress: (f) => seen.push(f),
      },
    );
    const facts = await probe(tools, out);
    expect(facts.width).toBe(1280);
    expect(facts.height).toBe(720);
    expect(seen.length).toBeGreaterThan(1);
    for (let i = 1; i < seen.length; i += 1)
      expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]! - 1e-9);
    expect(seen[seen.length - 1]).toBe(1);
  }, 180_000);

  it("a job stopped part-way leaves nothing behind: no result, no half-written file, no pieces", async () => {
    const plan = await planHighlights(
      tools,
      fileA,
      null,
      "0:15\n0:40\n1:00\n1:55\n2:30",
    );
    const out = join(dir, "stopped.mp4");
    const work = join(dir, "work-stopped");
    const stop = new AbortController();
    const running = render(
      tools,
      { moments: plan.clips, factsA: plan.factsA, factsB: plan.factsB },
      {
        fileA,
        fileB: fileA,
        outFile: out,
        workDir: work,
        signal: stop.signal,
        onStep: (m) => {
          if (/piece 2 /.test(m)) stop.abort();
        },
      },
    );
    await expect(running).rejects.toBeInstanceOf(Cancelled);
    expect(existsSync(out)).toBe(false);
    expect(existsSync(`${out}.partial`)).toBe(false);
    expect(existsSync(work)).toBe(false);
  }, 180_000);

  it("reads only the window asked for, with the moment in the right place", async () => {
    // Camera B's own clock has the moving square at 107.7-109.7 s.
    const whole = await motionSeries(tools, fileB, 0.5);
    const window = await motionSeries(
      tools,
      fileB,
      0.5,
      {},
      { startSeconds: 100, lengthSeconds: 14 },
    );
    expect(whole.length).toBeGreaterThan(400);
    expect(window.length).toBeGreaterThan(25);
    expect(window.length).toBeLessThan(31); // about 14 s at two readings a second
    const firstMoving = window.findIndex((v, i) => i > 0 && v > 1);
    // 107.7 s is 7.7 s into a window that starts at 100 s: about reading 15.
    expect(firstMoving).toBeGreaterThanOrEqual(13);
    expect(firstMoving).toBeLessThanOrEqual(17);
    // A window with nothing in it reads as still.
    const quiet = await motionSeries(
      tools,
      fileB,
      0.5,
      {},
      { startSeconds: 10, lengthSeconds: 10 },
    );
    expect(Math.max(...quiet)).toBeLessThan(0.5);
  }, 120_000);

  it("reports progress while reading sound and pictures, and can be stopped", async () => {
    const heard: number[] = [];
    await loudnessSeries(tools, fileA, 0.1, { onProgress: (s) => heard.push(s) });
    expect(heard.length).toBeGreaterThan(0);
    expect(Math.max(...heard)).toBeGreaterThan(GAME * 0.5); // seconds of the input processed

    const seen: number[] = [];
    await motionSeries(tools, fileA, 0.5, { onProgress: (s) => seen.push(s) });
    expect(seen.length).toBeGreaterThan(0);

    const stop = new AbortController();
    stop.abort();
    await expect(
      motionSeries(tools, fileA, 0.5, { signal: stop.signal }),
    ).rejects.toBeInstanceOf(Cancelled);
  }, 120_000);
});
