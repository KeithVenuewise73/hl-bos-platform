import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { listForReview } from "./prepare";
import {
  conversionTimeoutMs,
  ffmpegCandidates,
  ffprobeBeside,
  findTools,
  MAX_CLIP_BYTES,
  MAX_CLIP_SECONDS,
  parseProbe,
  prepareClip,
  transcodeArgs,
  type Tools,
} from "./video";

const facts = {
  durationSeconds: 10,
  width: 1920,
  height: 1080,
  hdr: false,
  hasAudio: true,
};

describe("finding ffmpeg", () => {
  const places = {
    pathDirs: ["C:\\tools\\", "C:\\other"],
    localAppData: "C:\\Users\\k\\AppData\\Local",
    programFiles: "C:\\Program Files",
    programData: "C:\\ProgramData",
    home: "C:\\Users\\k",
  };
  it("tries the PATH first, then where Windows installers put it", () => {
    const c = ffmpegCandidates(places, true);
    expect(c[0]).toBe("C:\\tools\\ffmpeg.exe");
    expect(c).toContain(
      "C:\\Users\\k\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe",
    );
    expect(c).toContain("C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe");
    expect(c).toContain("C:\\Users\\k\\scoop\\shims\\ffmpeg.exe");
    expect(c).toContain("C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe");
  });
  it("finds ffprobe beside ffmpeg", () => {
    expect(ffprobeBeside("C:\\x\\ffmpeg.exe")).toBe("C:\\x\\ffprobe.exe");
    expect(ffprobeBeside("/usr/bin/ffmpeg")).toBe("/usr/bin/ffprobe");
  });
});

describe("reading what ffprobe said", () => {
  it("applies the phone's rotation and spots HDR and audio", () => {
    const f = parseProbe({
      streams: [
        {
          codec_type: "video",
          width: 1920,
          height: 1080,
          color_transfer: "arib-std-b67",
          side_data_list: [{ rotation: -90 }],
        },
        { codec_type: "audio" },
      ],
      format: { duration: "12.345" },
    });
    expect(f).toEqual({
      durationSeconds: 12.35,
      width: 1080,
      height: 1920,
      hdr: true,
      hasAudio: true,
    });
  });
  it("gives nothing for something that is not a video", () => {
    expect(
      parseProbe({ streams: [{ codec_type: "audio" }], format: { duration: "3" } }),
    ).toBeNull();
    expect(parseProbe(null)).toBeNull();
  });
});

describe("how long a conversion may take", () => {
  it("is always a whole number of milliseconds, for every length a clip can have", () => {
    // 17.24 s x 20,000 came out as 344799.99999999994, which Node refuses as a timeout:
    // clips over about 15 seconds failed with 'The value of "delay" is out of range'.
    expect(17.24 * 20_000).not.toBe(344_800);
    expect(conversionTimeoutMs(17.24)).toBe(344_800);
    for (let hundredths = 1; hundredths <= 18_000; hundredths++) {
      const ms = conversionTimeoutMs(hundredths / 100);
      expect(Number.isInteger(ms)).toBe(true);
      expect(ms).toBeGreaterThanOrEqual(300_000);
    }
  });
  it("is at least five minutes, and twenty times the length for longer clips", () => {
    expect(conversionTimeoutMs(3)).toBe(300_000);
    expect(conversionTimeoutMs(100)).toBe(2_000_000);
  });
});

describe("the conversion rules", () => {
  it("makes H.264/AAC MP4 with metadata removed", () => {
    const a = transcodeArgs("in.mov", "out.mp4", facts, 0, false);
    expect(a).toContain("libx264");
    expect(a).toContain("aac");
    expect(a.join(" ")).toMatch(/-map_metadata -1/);
    expect(a.join(" ")).toMatch(/min\(1920/);
  });
  it("tries smaller the second time, and drops audio when there is none", () => {
    const a = transcodeArgs(
      "in.mov",
      "out.mp4",
      { ...facts, hasAudio: false },
      1,
      false,
    );
    expect(a.join(" ")).toMatch(/min\(1280/);
    expect(a).toContain("-an");
    expect(a).not.toContain("aac");
  });
  it("has a third, smaller try that fits the longest allowed clip under the website's limit", () => {
    const third = transcodeArgs("in.mov", "out.mp4", facts, 2, false).join(" ");
    expect(third).toMatch(/min\(960/);
    expect(third).toMatch(/-maxrate 900k -bufsize 1800k/);
    // 900 kbit/s of video + 128 kbit/s of sound for MAX_CLIP_SECONDS stays under MAX_CLIP_BYTES
    expect(((900 + 128) * 1000 * MAX_CLIP_SECONDS) / 8).toBeLessThan(MAX_CLIP_BYTES);
  });
  it("allows clips up to five minutes", () => {
    expect(MAX_CLIP_SECONDS).toBe(300);
  });
  it("converts HDR colours only when ffmpeg can", () => {
    const hdr = { ...facts, hdr: true };
    expect(transcodeArgs("i", "o", hdr, 0, true).join(" ")).toMatch(/tonemap/);
    expect(transcodeArgs("i", "o", hdr, 0, false).join(" ")).not.toMatch(/tonemap/);
  });
});

const tools = await findTools();
describe.skipIf(tools === null)("with a real ffmpeg", () => {
  const t = tools as Tools;
  function makeClip(seconds: number, name = "clip.mp4"): { dir: string; sha: string } {
    const dir = mkdtempSync(join(tmpdir(), "clip-test-"));
    execFileSync(t.ffmpeg, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `testsrc=size=2560x1440:rate=24:duration=${seconds}`,
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=440:duration=${seconds}`,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      "-metadata",
      "location=+40.7128-074.0060/",
      join(dir, name),
    ]);
    return {
      dir,
      sha: createHash("sha256")
        .update(readFileSync(join(dir, name)))
        .digest("hex"),
    };
  }

  it("converts a clip whose length makes the time allowance a fraction (17.24 s)", async () => {
    const { dir } = makeClip(17.24);
    const listing = await listForReview(dir);
    const c = await prepareClip(dir, listing.clips[0]!, t);
    expect(c.durationSeconds).toBeGreaterThan(17);
    expect(c.video.length).toBeGreaterThan(1000);
  }, 120_000);

  it("lists, converts, fingerprints the original, and cleans up", async () => {
    const { dir, sha } = makeClip(2);
    const listing = await listForReview(dir);
    expect(listing.clips.map((c) => c.path)).toEqual(["clip.mp4"]);
    const before = readdirSync(tmpdir()).filter((f) => f.startsWith("datesort-clip-"));
    const c = await prepareClip(dir, listing.clips[0]!, t);
    expect(c.hash).toBe(sha);
    expect(c.durationSeconds).toBeGreaterThan(1.5);
    expect(c.video.length).toBeGreaterThan(1000);
    expect(Math.max(c.width, c.height)).toBeLessThanOrEqual(2400);
    expect((await sharp(c.web).metadata()).format).toBe("jpeg");
    const out = join(mkdtempSync(join(tmpdir(), "clip-out-")), "o.mp4");
    writeFileSync(out, c.video);
    const probe = JSON.parse(
      execFileSync(t.ffprobe, [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        out,
      ]).toString(),
    ) as {
      streams: { codec_name: string; width?: number }[];
      format: { tags?: Record<string, string> };
    };
    expect(probe.streams.map((s) => s.codec_name).sort()).toEqual(["aac", "h264"]);
    expect(probe.streams.find((s) => s.codec_name === "h264")!.width).toBe(1920);
    expect(JSON.stringify(probe.format.tags ?? {})).not.toMatch(/40\.7128/);
    expect(readdirSync(tmpdir()).filter((f) => f.startsWith("datesort-clip-"))).toEqual(
      before,
    );
    expect(
      createHash("sha256")
        .update(readFileSync(join(dir, "clip.mp4")))
        .digest("hex"),
    ).toBe(sha);
  }, 60_000);

  it("refuses a clip that is too long and says to use GameCut", async () => {
    const dir = mkdtempSync(join(tmpdir(), "clip-long-"));
    execFileSync(t.ffmpeg, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:size=160x90:rate=1:duration=400",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      join(dir, "long.mp4"),
    ]);
    const [cand] = (await listForReview(dir)).clips;
    await expect(prepareClip(dir, cand!, t)).rejects.toThrow(
      /up to 5 minutes; use GameCut/,
    );
  }, 60_000);

  it("says a file that is not a video could not be read", async () => {
    const dir = mkdtempSync(join(tmpdir(), "clip-bad-"));
    writeFileSync(join(dir, "x.mp4"), Buffer.alloc(64, 1));
    await expect(
      prepareClip(
        dir,
        { path: "x.mp4", size: 64, takenAt: null, dateEstimated: true },
        t,
      ),
    ).rejects.toThrow(/could not be read as a video/);
  }, 30_000);
});
