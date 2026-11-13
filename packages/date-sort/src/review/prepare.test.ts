import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { hashOf, listForReview, prepare, THUMB_EDGE, WEB_EDGE } from "./prepare";

const noise = (w: number, h: number, mean = 128) =>
  sharp({
    create: {
      width: w,
      height: h,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
      noise: { type: "gaussian", mean, sigma: 55 },
    },
  });

async function photo(w: number, h: number, exifDate?: string): Promise<Buffer> {
  let img = noise(w, h).jpeg({ quality: 90 });
  if (exifDate !== undefined) {
    img = img.withExif({
      IFD0: { Make: "Canon", Model: "EOS R6", Copyright: "private-camera-detail" },
      IFD2: { DateTimeOriginal: exifDate },
    });
  }
  return img.toBuffer();
}

function folder(): string {
  return mkdtempSync(join(tmpdir(), "review-"));
}

describe("what is in the folder", () => {
  it("lists photos in time order, counts videos, and explains what it skips", async () => {
    const dir = folder();
    mkdirSync(join(dir, "Second period"));
    writeFileSync(
      join(dir, "b_late.jpg"),
      await photo(800, 600, "2026:10:24 19:30:00"),
    );
    writeFileSync(
      join(dir, "Second period", "a_early.jpg"),
      await photo(800, 600, "2026:10:24 18:00:00"),
    );
    writeFileSync(join(dir, "notes.txt"), "not a photo");
    writeFileSync(
      join(dir, "clip.mov"),
      Buffer.concat([
        Buffer.from([0, 0, 0, 20]),
        Buffer.from("ftypqt  "),
        Buffer.alloc(32),
      ]),
    );
    const l = await listForReview(dir);
    expect(l.photos.map((p) => p.path.replaceAll("\\", "/"))).toEqual([
      "Second period/a_early.jpg",
      "b_late.jpg",
    ]);
    expect(l.photos[0]!.takenAt).toBe("2026-10-24T18:00:00");
    expect(l.photos[0]!.dateEstimated).toBe(false);
    expect(l.videos).toBe(1);
    expect(l.skipped.map((s) => s.path)).toContain("notes.txt");
  });
});

describe("making a photo ready", () => {
  it("makes a web copy and a thumbnail at the right sizes", async () => {
    const dir = folder();
    writeFileSync(join(dir, "big.jpg"), await photo(3600, 2400, "2026:10:24 18:00:00"));
    const [c] = (await listForReview(dir)).photos;
    const p = await prepare(dir, c!);
    expect(Math.max(p.width, p.height)).toBe(WEB_EDGE);
    const web = await sharp(p.web).metadata();
    expect(web.format).toBe("jpeg");
    const thumb = await sharp(p.thumb).metadata();
    expect(Math.max(thumb.width, thumb.height)).toBe(THUMB_EDGE);
  });

  it("never enlarges a small photo", async () => {
    const dir = folder();
    writeFileSync(join(dir, "small.jpg"), await photo(900, 600));
    const [c] = (await listForReview(dir)).photos;
    expect((await prepare(dir, c!)).width).toBe(900);
  });

  it("sends no camera details: the copies carry none of the original's metadata", async () => {
    const dir = folder();
    const original = await photo(1200, 800, "2026:10:24 18:00:00");
    // The test only means something if the original really carries them.
    expect(original.includes(Buffer.from("private-camera-detail"))).toBe(true);
    expect(original.includes(Buffer.from("Canon"))).toBe(true);
    writeFileSync(join(dir, "x.jpg"), original);
    const [c] = (await listForReview(dir)).photos;
    const p = await prepare(dir, c!);
    for (const bytes of [p.web, p.thumb]) {
      const m = await sharp(bytes).metadata();
      expect(m.exif).toBeUndefined();
      expect(Buffer.from(bytes).includes(Buffer.from("private-camera-detail"))).toBe(
        false,
      );
      expect(Buffer.from(bytes).includes(Buffer.from("Canon"))).toBe(false);
    }
  });

  it("fingerprints the original, the same way before and after preparing", async () => {
    const dir = folder();
    const bytes = await photo(1200, 800, "2026:10:24 18:00:00");
    writeFileSync(join(dir, "x.jpg"), bytes);
    const [c] = (await listForReview(dir)).photos;
    const want = createHash("sha256").update(bytes).digest("hex");
    expect((await prepare(dir, c!)).hash).toBe(want);
    expect(await hashOf(dir, c!.path)).toBe(want);
  });

  it("flags a blurry photo and a low-resolution one, and leaves a good one alone", async () => {
    const dir = folder();
    writeFileSync(join(dir, "good.jpg"), await photo(2000, 1500));
    writeFileSync(
      join(dir, "blurry.jpg"),
      await sharp(await photo(2000, 1500))
        .blur(12)
        .jpeg()
        .toBuffer(),
    );
    writeFileSync(join(dir, "tiny.jpg"), await photo(640, 480));
    const l = await listForReview(dir);
    const byName = Object.fromEntries(
      await Promise.all(
        l.photos.map(async (c) => [c.path, await prepare(dir, c)] as const),
      ),
    );
    expect(byName["good.jpg"]!.flags).toEqual([]);
    expect(byName["blurry.jpg"]!.flags).toContain("soft");
    expect(byName["tiny.jpg"]!.flags).toContain("small");
  });

  it("says plainly when a file is not a picture, and does not touch the original", async () => {
    const dir = folder();
    const bad = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(200, 7),
    ]);
    writeFileSync(join(dir, "broken.jpg"), bad);
    const before = statSync(join(dir, "broken.jpg")).mtimeMs;
    const c = {
      path: "broken.jpg",
      size: bad.length,
      takenAt: null,
      dateEstimated: true,
    };
    await expect(prepare(dir, c)).rejects.toThrow(
      /broken\.jpg could not be read as a picture/,
    );
    expect(statSync(join(dir, "broken.jpg")).mtimeMs).toBe(before);
    expect(readFileSync(join(dir, "broken.jpg")).equals(bad)).toBe(true);
  });
});
