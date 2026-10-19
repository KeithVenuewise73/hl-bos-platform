/**
 * Every date reader against real files, checked against what ExifTool reads
 * from the same files (fixtures/exiftool-says.json).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { cameraDate, parseExifDate } from "./capture-date";
import { readCr3Dates } from "./cr3";
import { sniff } from "./formats";
import { readHeifDates } from "./heif";
import { bytesSource } from "./isobmff";
import { readTiffDates } from "./tiff";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");
const bytes = (name: string) => new Uint8Array(readFileSync(join(FIXTURES, name)));

interface Said {
  fileType: string;
  dateTimeOriginal: string | null;
  createDate: string | null;
  modifyDate: string | null;
}
const exiftool = (
  JSON.parse(readFileSync(join(FIXTURES, "exiftool-says.json"), "utf8")) as {
    files: Record<string, Said>;
  }
).files;

const FORMAT_FOR: Record<string, string> = {
  CR2: "cr2",
  CR3: "cr3",
  JPEG: "jpeg",
  HEIF: "heic",
  HEIC: "heic",
  PNG: "png",
};

describe("ExifTool's readings are the reference", () => {
  it("covers every fixture", () => {
    const files = readdirSync(FIXTURES).filter((f) => !/\.(json|md)$/.test(f));
    expect(Object.keys(exiftool).sort()).toEqual(files.sort());
  });

  it("identifies every fixture as the format ExifTool says it is", () => {
    for (const [name, said] of Object.entries(exiftool)) {
      expect(sniff(bytes(name)), name).toBe(FORMAT_FOR[said.fileType]);
    }
  });
});

describe("Canon CR3 (read with DateSort's own CR3 reader)", () => {
  const cr3s = Object.entries(exiftool).filter(([, s]) => s.fileType === "CR3");

  it("has CR3 fixtures to test, including an unmodified camera file", () => {
    expect(cr3s.map(([n]) => n)).toContain("canon-eos-m50.cr3");
    expect(cr3s.length).toBeGreaterThanOrEqual(4);
  });

  for (const [name, said] of cr3s) {
    it(`${name}: DateTimeOriginal and CreateDate match ExifTool`, async () => {
      const got = await readCr3Dates(bytesSource(bytes(name)));
      expect(got.dateTimeOriginal ?? null).toBe(said.dateTimeOriginal);
      expect(got.createDate ?? null).toBe(said.createDate);
    });
  }

  it("reads the real Canon EOS M50 file's capture time", async () => {
    const got = await readCr3Dates(bytesSource(bytes("canon-eos-m50.cr3")));
    expect(cameraDate(got)).toEqual({
      takenAt: "2018-02-21T12:08:56",
      source: "DateTimeOriginal",
    });
  });

  it("takes DateTimeOriginal over CreateDate and never uses ModifyDate", async () => {
    expect(
      cameraDate(await readCr3Dates(bytesSource(bytes("cr3-all-three-differ.cr3")))),
    ).toEqual({ takenAt: "2026-10-04T13:03:00", source: "DateTimeOriginal" });
    expect(
      cameraDate(await readCr3Dates(bytesSource(bytes("cr3-createdate-only.cr3")))),
    ).toEqual({ takenAt: "2026-10-05T19:30:00", source: "CreateDate" });
    // ExifTool sees a ModifyDate here; DateSort must not call it Date Taken.
    expect(exiftool["cr3-modifydate-only.cr3"]!.modifyDate).toBe("2026:10:06 10:00:00");
    expect(
      cameraDate(await readCr3Dates(bytesSource(bytes("cr3-modifydate-only.cr3")))),
    ).toBeNull();
  });

  it("reads only metadata, never the image data", async () => {
    const all = bytes("canon-eos-m50.cr3");
    let furthest = 0;
    await readCr3Dates({
      size: all.length,
      read: (offset, length) => {
        furthest = Math.max(furthest, Math.min(all.length, offset + length));
        return Promise.resolve(all.subarray(offset, offset + length));
      },
    });
    // In this file the image data (mdat) starts at byte 11421. Its 32-byte box
    // header is looked at to learn its size; nothing after that is read.
    expect(furthest).toBeLessThanOrEqual(11_421 + 32);
    expect(all.length).toBe(52_502);
  });

  it("returns nothing, rather than throwing or guessing, for damaged files", async () => {
    const real = bytes("canon-eos-m50.cr3");
    for (const cut of [0, 12, 30, 300, 700, 2000]) {
      await expect(readCr3Dates(bytesSource(real.subarray(0, cut)))).resolves.toEqual(
        {},
      );
    }
    const junk = new Uint8Array(4096).fill(0xff);
    await expect(readCr3Dates(bytesSource(junk))).resolves.toEqual({});
    // A box claiming to be bigger than the file.
    const lying = real.slice(0, 64);
    new DataView(lying.buffer).setUint32(24, 0x7fffffff);
    await expect(readCr3Dates(bytesSource(lying))).resolves.toEqual({});
  });
});

describe("HEIC (read with DateSort's own HEIF reader)", () => {
  it("matches ExifTool on a HEIC with EXIF", async () => {
    const said = exiftool["heic-all-three-differ.heic"]!;
    const got = await readHeifDates(bytesSource(bytes("heic-all-three-differ.heic")));
    expect(got.dateTimeOriginal).toBe(said.dateTimeOriginal);
    expect(got.createDate).toBe(said.createDate);
  });

  it("finds no camera date in a HEIC that has none", async () => {
    expect(await readHeifDates(bytesSource(bytes("heic-no-exif.heic")))).toEqual({});
  });

  it("returns nothing for a damaged HEIC", async () => {
    const real = bytes("heic-all-three-differ.heic");
    for (const cut of [0, 20, 100, 300, 640]) {
      const got = await readHeifDates(bytesSource(real.subarray(0, cut))).catch(
        () => "threw",
      );
      expect(got === "threw" || Object.keys(got).length === 0).toBe(true);
    }
  });
});

describe("the TIFF reader", () => {
  function tiff(little: boolean, entries: Array<[number, string]>): Uint8Array {
    // header (8) + IFD (2 + 12n + 4) + strings
    const n = entries.length;
    const dataAt = 8 + 2 + 12 * n + 4;
    const strings = entries.map(([, s]) => s + "\0");
    const size = dataAt + strings.reduce((a, s) => a + s.length, 0);
    const buf = new Uint8Array(size);
    const v = new DataView(buf.buffer);
    buf.set(little ? [0x49, 0x49] : [0x4d, 0x4d]);
    v.setUint16(2, 42, little);
    v.setUint32(4, 8, little);
    v.setUint16(8, n, little);
    let at = dataAt;
    entries.forEach(([tag], i) => {
      const e = 10 + 12 * i;
      const s = strings[i]!;
      v.setUint16(e, tag, little);
      v.setUint16(e + 2, 2, little);
      v.setUint32(e + 4, s.length, little);
      v.setUint32(e + 8, at, little);
      for (let k = 0; k < s.length; k++) buf[at + k] = s.charCodeAt(k);
      at += s.length;
    });
    return buf;
  }

  it("reads both byte orders", () => {
    for (const little of [true, false]) {
      const got = readTiffDates(
        tiff(little, [
          [0x9003, "2026:10:04 13:03:00"],
          [0x9004, "2026:10:05 09:00:00"],
        ]),
      );
      expect(got).toEqual({
        dateTimeOriginal: "2026:10:04 13:03:00",
        createDate: "2026:10:05 09:00:00",
      });
    }
  });

  it("does not read tag 0x0132 (DateTime / ModifyDate) at all", () => {
    expect(readTiffDates(tiff(true, [[0x0132, "2026:10:06 10:00:00"]]))).toEqual({});
  });

  it("survives a loop, a truncation and garbage", () => {
    const loop = tiff(true, [[0x9003, "2026:10:04 13:03:00"]]);
    // Point the "next IFD" at itself.
    new DataView(loop.buffer).setUint32(8 + 2 + 12, 8, true);
    expect(readTiffDates(loop).dateTimeOriginal).toBe("2026:10:04 13:03:00");
    expect(readTiffDates(loop.subarray(0, 20))).toEqual({});
    expect(readTiffDates(new Uint8Array([1, 2, 3]))).toEqual({});
  });
});

describe("parsing an EXIF date", () => {
  it("keeps the camera's wall clock exactly", () => {
    expect(parseExifDate("2026:10:04 23:59:59")).toBe("2026-10-04T23:59:59");
    expect(parseExifDate("2026-10-04 13:03:00")).toBe("2026-10-04T13:03:00");
    expect(parseExifDate("2026:10:04 13:03:00.42+02:00")).toBe("2026-10-04T13:03:00");
  });

  it("refuses blank, zero and impossible dates", () => {
    for (const bad of [
      "",
      "    :  :     :  :  ",
      "0000:00:00 00:00:00",
      "2026:02:30 10:00:00",
      "2026:13:01 10:00:00",
      "2026:10:04 24:00:00",
      "1970:01:01 00:00:00",
      undefined,
      null,
      42,
      new Date(),
    ]) {
      expect(parseExifDate(bad), String(bad)).toBeNull();
    }
    expect(parseExifDate("2028:02:29 10:00:00")).toBe("2028-02-29T10:00:00");
  });

  it("falls back from a blank DateTimeOriginal to CreateDate", () => {
    expect(
      cameraDate({
        dateTimeOriginal: "    :  :     :  :  ",
        createDate: "2026:10:05 09:00:00",
      }),
    ).toEqual({ takenAt: "2026-10-05T09:00:00", source: "CreateDate" });
  });
});
