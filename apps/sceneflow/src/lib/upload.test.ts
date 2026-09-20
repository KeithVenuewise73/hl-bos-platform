import { describe, expect, it } from "vitest";
import { MAX_BYTES, MIN_EDGE, acceptPhoto, detectFormat, photoPath } from "./upload";

/** A PNG header with a real IHDR, which is all the validator reads. */
function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(64);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(b.buffer);
  view.setUint32(8, 13);
  b.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  view.setUint32(16, width);
  view.setUint32(20, height);
  return b;
}

/** A JPEG with one variable-length segment before the frame header. */
function jpeg(width: number, height: number, padding = 0): Uint8Array {
  const seg = 4 + padding;
  const b = new Uint8Array(2 + 2 + seg + 12);
  b.set([0xff, 0xd8], 0); // SOI
  b.set([0xff, 0xe0], 2); // APP0
  const view = new DataView(b.buffer);
  view.setUint16(4, seg); // segment length
  const sof = 2 + 2 + seg;
  b.set([0xff, 0xc0], sof);
  view.setUint16(sof + 2, 11);
  b[sof + 4] = 8;
  view.setUint16(sof + 5, height);
  view.setUint16(sof + 7, width);
  return b;
}

describe("the format is read from the bytes, never the filename", () => {
  it("recognises a JPEG", () => {
    expect(detectFormat(jpeg(800, 1000))).toBe("jpeg");
  });

  it("recognises a PNG", () => {
    expect(detectFormat(png(800, 1000))).toBe("png");
  });

  it("recognises a WEBP", () => {
    const b = new Uint8Array(16);
    b.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
    b.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
    expect(detectFormat(b)).toBe("webp");
  });

  it("recognises a HEIC by its brand, not just its ftyp box", () => {
    const heic = new Uint8Array(16);
    heic.set([0x66, 0x74, 0x79, 0x70], 4); // "ftyp"
    heic.set([0x68, 0x65, 0x69, 0x63], 8); // "heic"
    expect(detectFormat(heic)).toBe("heic");

    // An MP4 is also an ftyp box. It is not a photo.
    const mp4 = new Uint8Array(16);
    mp4.set([0x66, 0x74, 0x79, 0x70], 4);
    mp4.set([0x69, 0x73, 0x6f, 0x6d], 8); // "isom"
    expect(detectFormat(mp4)).toBeNull();
  });

  it("refuses a renamed executable, however it is labelled", () => {
    // "MZ" — a Windows executable. The whole reason the extension is ignored.
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    expect(detectFormat(exe)).toBeNull();
    const verdict = acceptPhoto(exe);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.code).toBe("unsupported_format");
  });

  it("refuses a text file pretending to be a photo", () => {
    expect(detectFormat(new TextEncoder().encode("not a photo at all"))).toBeNull();
  });
});

describe("acceptPhoto", () => {
  it("accepts an ordinary photo and reports its size", () => {
    const verdict = acceptPhoto(jpeg(1200, 1600));
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.format).toBe("jpeg");
    expect(verdict.extension).toBe("jpg");
    expect(verdict.width).toBe(1200);
    expect(verdict.height).toBe(1600);
  });

  it("finds the frame header past a long EXIF-like segment", () => {
    // A phone photo carries several segments before the frame. A fixed offset
    // would read garbage here.
    const verdict = acceptPhoto(jpeg(900, 1200, 600));
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.width).toBe(900);
  });

  it("reads PNG dimensions", () => {
    const verdict = acceptPhoto(png(640, 480));
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.width).toBe(640);
    expect(verdict.height).toBe(480);
  });

  it("refuses an empty file", () => {
    const verdict = acceptPhoto(new Uint8Array(0));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.code).toBe("empty");
  });

  it("refuses something larger than a photograph", () => {
    const big = new Uint8Array(MAX_BYTES + 1);
    big.set([0xff, 0xd8, 0xff], 0);
    const verdict = acceptPhoto(big);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.code).toBe("too_large");
    expect(verdict.message).toContain("25MB");
  });

  it("refuses a photo too small to keep a face recognisable", () => {
    const verdict = acceptPhoto(png(200, 900));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.code).toBe("too_small_in_pixels");
    expect(verdict.message).toContain("200×900");
    expect(verdict.message).toContain(String(MIN_EDGE));
  });

  it("accepts one exactly on the limit", () => {
    expect(acceptPhoto(png(MIN_EDGE, MIN_EDGE)).ok).toBe(true);
  });

  it("refuses a damaged file reporting zero pixels", () => {
    const verdict = acceptPhoto(png(0, 0));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.code).toBe("truncated");
  });

  it("accepts a HEIC without claiming to know its size", () => {
    const heic = new Uint8Array(64);
    heic.set([0x66, 0x74, 0x79, 0x70], 4);
    heic.set([0x68, 0x65, 0x69, 0x63], 8);
    const verdict = acceptPhoto(heic);
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    // Guessing would be worse than admitting it: HEIC dimensions need a real
    // parser, so they are reported as unknown rather than invented.
    expect(verdict.width).toBeNull();
  });

  it("never leaks an internal detail into a message a user reads", () => {
    for (const bytes of [new Uint8Array(0), new Uint8Array([1, 2, 3]), png(10, 10)]) {
      const verdict = acceptPhoto(bytes);
      if (verdict.ok) continue;
      expect(verdict.message).not.toMatch(/undefined|null|Error|0x/);
    }
  });
});

describe("photoPath", () => {
  const id = "a".repeat(32);

  it("builds a path under the console's own upload folder", () => {
    expect(photoPath(id, "jpg")).toBe(`.sceneflow/uploads/${id}.jpg`);
  });

  it("refuses an id that is not one we generated", () => {
    // This string becomes a filesystem path.
    expect(() => photoPath("../../etc/passwd", "jpg")).toThrow(/invalid_photo_id/);
    expect(() => photoPath("", "jpg")).toThrow(/invalid_photo_id/);
    expect(() => photoPath("A".repeat(32), "jpg")).toThrow(/invalid_photo_id/);
  });

  it("refuses an extension that is not a plain suffix", () => {
    expect(() => photoPath(id, "../sh")).toThrow(/invalid_photo_extension/);
    expect(() => photoPath(id, "")).toThrow(/invalid_photo_extension/);
  });
});
