/**
 * The scanner against a real folder on disk, shaped like a Canon card that
 * was copied to a laptop: DCIM\100CANON with JPG + CR3 pairs over three
 * game days, a CR2, a HEIC, edited photos with no camera date, and junk.
 *
 * Every file is fingerprinted (size, modified time, SHA-256) before and
 * after: a scan that changed, renamed, deleted or added anything fails.
 */
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { scanFolder, ScanError } from "./scan";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");
let root: string;

async function cameraJpeg(file: string, when: string, colour: string) {
  const exif = when.replace(/-/g, ":").replace("T", " ");
  const buf = await sharp({
    create: { width: 64, height: 48, channels: 3, background: colour },
  })
    .jpeg()
    .withExif({
      IFD0: { Make: "Canon", Model: "Canon EOS R6", DateTime: "2026:12:25 09:00:00" },
      IFD2: { DateTimeOriginal: exif },
    })
    .toBuffer();
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, buf);
}

function setModified(file: string, local: string) {
  const t = new Date(local); // no zone suffix: this computer's local time
  utimesSync(file, t, t);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile()) out.push(full);
  }
  return out;
}

function fingerprint(dir: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const f of walk(dir)) {
    const st = statSync(f);
    const sha = createHash("sha256").update(readFileSync(f)).digest("hex");
    map.set(relative(dir, f), `${st.size}|${st.mtimeMs}|${sha}`);
  }
  return map;
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "datesort-card-"));
  const card = join(root, "DCIM", "100CANON");
  const shots: Array<[string, string]> = [
    ["IMG_0001", "2026-10-03T18:01:00"],
    ["IMG_0002", "2026-10-03T20:44:10"],
    ["IMG_0003", "2026-10-04T13:03:00"],
    ["IMG_0004", "2026-10-04T15:47:00"],
    ["IMG_0005", "2026-10-05T09:15:00"],
  ];
  let i = 0;
  for (const [name, when] of shots) {
    await cameraJpeg(join(card, `${name}.JPG`), when, i++ % 2 ? "#1e3a8a" : "#7f1d1d");
  }
  // Real Canon RAW structures (edited copies with known dates).
  copyFileSync(join(FIXTURES, "cr3-all-three-differ.cr3"), join(card, "IMG_0003.CR3"));
  copyFileSync(join(FIXTURES, "cr3-createdate-only.cr3"), join(card, "IMG_0006.CR3"));
  copyFileSync(join(FIXTURES, "cr2-all-three-differ.cr2"), join(card, "IMG_0004.CR2"));
  copyFileSync(
    join(FIXTURES, "heic-all-three-differ.heic"),
    join(root, "DCIM", "IMG_7000.HEIC"),
  );

  // No camera date anywhere: must be estimated from the modified time.
  mkdirSync(join(root, "Edited"));
  copyFileSync(
    join(FIXTURES, "jpg-modifydate-only.jpg"),
    join(root, "Edited", "crop.jpg"),
  );
  setModified(join(root, "Edited", "crop.jpg"), "2026-10-05T21:30:00");
  copyFileSync(
    join(FIXTURES, "cr3-modifydate-only.cr3"),
    join(root, "Edited", "IMG_0009.CR3"),
  );
  setModified(join(root, "Edited", "IMG_0009.CR3"), "2026-10-03T19:00:00");

  // Not photos.
  writeFileSync(join(root, "Thumbs.db"), "windows thumbnail cache");
  writeFileSync(join(card, "MVI_0011.MP4"), "not a video, either");
  writeFileSync(join(root, "Edited", "broken.jpg"), "this is text, not a JPEG");

  // A shortcut back to the top: must not be followed (it would loop).
  try {
    symlinkSync(root, join(root, "DCIM", "loop"), "junction");
  } catch {
    // Some systems refuse symlinks to unprivileged users; the rest still runs.
  }
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("scanning a camera card copied to the laptop", () => {
  it("changes nothing in the folder", async () => {
    const before = fingerprint(root);
    await scanFolder(root, { includeSubfolders: true });
    await scanFolder(root, { includeSubfolders: false });
    expect(fingerprint(root)).toEqual(before);
    expect(before.size).toBe(14);
  });

  it("with subfolders: finds and identifies every file", async () => {
    const { report: r } = await scanFolder(root, { includeSubfolders: true });
    expect(r.totalFiles).toBe(14);
    expect(r.byFormat).toEqual({ jpeg: 6, png: 0, heic: 1, cr2: 1, cr3: 3 });
    expect(r.photos).toBe(11);
    expect(r.unsupported.map((u) => u.reason).sort()).toEqual(
      [
        ".mp4 files are not photos DateSort reads",
        "Named .jpg but is not a JPG file",
        "System file, not a photo",
      ].sort(),
    );
  });

  it("dates every photo by the camera, and estimates only the two that have none", async () => {
    const { report: r, files } = await scanFolder(root, { includeSubfolders: true });
    expect(r.cameraDated).toBe(9);
    expect(r.estimated).toBe(2);
    const by = (end: string) => files.find((f) => f.path.endsWith(end));
    expect(by("IMG_0003.CR3")).toMatchObject({
      takenAt: "2026-10-04T13:03:00",
      dateSource: "DateTimeOriginal",
    });
    expect(by("IMG_0006.CR3")).toMatchObject({
      takenAt: "2026-10-05T19:30:00",
      dateSource: "CreateDate",
    });
    // EXIF DateTime says 25 December on every generated JPEG; it is ignored.
    expect(by("IMG_0001.JPG")).toMatchObject({ takenAt: "2026-10-03T18:01:00" });
    expect(by("crop.jpg")).toMatchObject({
      takenAt: "2026-10-05T21:30:00",
      dateSource: "FileModified",
    });
    expect(by("IMG_0009.CR3")).toMatchObject({
      takenAt: "2026-10-03T19:00:00",
      dateSource: "FileModified",
    });
  });

  it("groups into shooting days with first/last times and camera vs estimated", async () => {
    const { report: r } = await scanFolder(root, { includeSubfolders: true });
    expect(
      r.days.map((d) => [d.day, d.photos, d.cameraDated, d.estimated, d.first, d.last]),
    ).toEqual([
      ["2026-10-03", 3, 2, 1, "2026-10-03T18:01:00", "2026-10-03T20:44:10"],
      ["2026-10-04", 5, 5, 0, "2026-10-04T13:03:00", "2026-10-04T15:47:00"],
      ["2026-10-05", 3, 2, 1, "2026-10-05T09:15:00", "2026-10-05T21:30:00"],
    ]);
    expect(r.days[1]!.byFormat).toEqual({ jpeg: 2, png: 0, heic: 1, cr2: 1, cr3: 1 });
    expect(r.days[2]!.lastIsEstimate).toBe(true);
  });

  it("without subfolders: reads only the top folder", async () => {
    const result = await scanFolder(root, { includeSubfolders: false });
    expect(result.files.map((f) => f.path)).toEqual(["Thumbs.db"]);
    expect(result.report.photos).toBe(0);
  });

  it("does not follow a shortcut to another folder", async () => {
    const result = await scanFolder(join(root, "DCIM"), { includeSubfolders: true });
    expect(result.files.some((f) => f.path.includes("loop"))).toBe(false);
    if (result.skippedLinks.length > 0) expect(result.skippedLinks).toEqual(["loop"]);
  });

  it("reports progress", async () => {
    const seen: string[] = [];
    await scanFolder(root, {
      includeSubfolders: true,
      onProgress: (p) => seen.push(`${p.phase}:${p.read}/${p.found}`),
    });
    expect(seen.at(-1)).toBe("reading:14/14");
  });

  it("says plainly when the folder is missing or is a file", async () => {
    await expect(
      scanFolder(join(root, "nope"), { includeSubfolders: true }),
    ).rejects.toThrow(ScanError);
    await expect(
      scanFolder(join(root, "Thumbs.db"), { includeSubfolders: true }),
    ).rejects.toThrow("is a file, not a folder");
  });
});
