/**
 * Videos: real MOV and MP4 files made by ffmpeg, checked against what
 * ffprobe reads from them (fixtures/ffprobe-says.json).
 */
import { readFileSync, statSync } from "node:fs";
import { mkdtempSync, copyFileSync, utimesSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { sniff } from "./formats";
import { boxesIn, bytesSource } from "./isobmff";
import { movieHeaderTime, readVideoDates, wallClock } from "./quicktime";
import { scanFolder } from "./scan";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");
const ffprobe = JSON.parse(
  readFileSync(join(FIXTURES, "ffprobe-says.json"), "utf8"),
) as Record<
  string,
  { majorBrand: string; appleCreationDate: string | null; creationTime: string | null }
>;
const bytes = (name: string) => new Uint8Array(readFileSync(join(FIXTURES, name)));

/** "2026-10-25T03:41:07Z" shown on this computer's clock, the way Windows shows it. */
function local(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

describe("videos, against ffprobe", () => {
  it("identifies each by its bytes as ffprobe's brand says", () => {
    expect(sniff(bytes("iphone-style.mov"))).toBe(
      ffprobe["iphone-style.mov"]!.majorBrand === "qt" ? "mov" : "?",
    );
    expect(sniff(bytes("header-only.mp4"))).toBe("mp4");
    expect(sniff(bytes("no-date.mp4"))).toBe("mp4");
  });

  it("reads the iPhone's own creation date as the phone's clock, not converted", async () => {
    const said = ffprobe["iphone-style.mov"]!;
    const dates = await readVideoDates(bytesSource(bytes("iphone-style.mov")));
    expect(dates.appleCreationDate).toBe(wallClock(said.appleCreationDate!));
    expect(dates.appleCreationDate).toBe("2026-10-24T23:41:07");
    expect(dates.movieHeader).toBe(local(said.creationTime!));
  });

  it("reads the movie header when that is all there is", async () => {
    const dates = await readVideoDates(bytesSource(bytes("header-only.mp4")));
    expect(dates.appleCreationDate).toBeUndefined();
    expect(dates.movieHeader).toBe(local(ffprobe["header-only.mp4"]!.creationTime!));
  });

  it("finds nothing in a video with no date", async () => {
    expect(await readVideoDates(bytesSource(bytes("no-date.mp4")))).toEqual({});
  });

  it("never reads the video itself, only the boxes that describe it", async () => {
    const all = bytes("iphone-style.mov");
    const mdat = (await boxesIn(bytesSource(all), 0, all.length)).find(
      (b) => b.type === "mdat",
    )!;
    const reads: Array<[number, number]> = [];
    await readVideoDates({
      size: all.length,
      read: (o, l) => {
        reads.push([o, l]);
        return Promise.resolve(all.subarray(o, Math.min(all.length, o + l)));
      },
    });
    // Box headers are read in 32-byte peeks; nothing past the mdat header is.
    const inside = reads.filter(([o]) => o >= mdat.body && o < mdat.end);
    expect(inside).toEqual([]);
  });

  it("refuses a zero or impossible header time", () => {
    expect(movieHeaderTime(new Uint8Array(8))).toBeNull();
    expect(wallClock("2026-13-40T99:00:00")).toBeNull();
  });
});

describe("a phone's folder of videos and photos", () => {
  it("puts each video on the day it was filmed, and labels the estimate", async () => {
    const dir = mkdtempSync(join(tmpdir(), "datesort-video-"));
    mkdirSync(join(dir, "100APPLE"));
    for (const f of ["iphone-style.mov", "header-only.mp4", "no-date.mp4"]) {
      copyFileSync(join(FIXTURES, f), join(dir, "100APPLE", f.toUpperCase()));
    }
    const when = new Date(2026, 6, 4, 12, 0, 0);
    utimesSync(join(dir, "100APPLE", "NO-DATE.MP4"), when, when);
    const before = statSync(join(dir, "100APPLE", "IPHONE-STYLE.MOV")).mtimeMs;

    const { files, report } = await scanFolder(dir, { includeSubfolders: true });
    const byName = new Map(files.map((f) => [f.path.split(/[\\/]/).pop(), f]));
    expect(byName.get("IPHONE-STYLE.MOV")).toMatchObject({
      kind: "photo",
      format: "mov",
      takenAt: "2026-10-24T23:41:07",
      dateSource: "VideoCreationDate",
    });
    expect(byName.get("HEADER-ONLY.MP4")).toMatchObject({
      format: "mp4",
      dateSource: "VideoHeader",
    });
    expect(byName.get("NO-DATE.MP4")).toMatchObject({
      format: "mp4",
      takenAt: "2026-07-04T12:00:00",
      dateSource: "FileModified",
    });
    expect(report.byFormat.mov).toBe(1);
    expect(report.byFormat.mp4).toBe(2);
    expect(report.estimated).toBe(1);
    expect(statSync(join(dir, "100APPLE", "IPHONE-STYLE.MOV")).mtimeMs).toBe(before);
  });
});
