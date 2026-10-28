import { describe, expect, it } from "vitest";

import {
  cameraTime,
  type CheckedFile,
  classifyFile,
  extensionOf,
  longDay,
  MAX_PHOTO_BYTES,
  proposeGames,
  sniffCanonRaw,
  sniffPhoto,
  summarizeFolder,
  wallClock,
} from "./folder-check.ts";

const bytes = (...b: number[]) =>
  new Uint8Array([...b, ...new Array(16).fill(0)]).subarray(0, Math.max(16, b.length));
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

const JPEG = bytes(0xff, 0xd8, 0xff, 0xe1);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const HEIC = bytes(0, 0, 0, 0x18, ...ascii("ftypheic"));
const CR2 = bytes(0x49, 0x49, 0x2a, 0x00, 0x10, 0, 0, 0, ...ascii("CR"), 2, 0);
const CR3 = bytes(0, 0, 0, 0x18, ...ascii("ftypcrx "));
const TIFF = bytes(0x49, 0x49, 0x2a, 0x00, 0x08, 0, 0, 0, 0, 0);
const TEXT = new Uint8Array(ascii("hello, this is not a photo"));

describe("sniffing", () => {
  it("identifies photos by their bytes", () => {
    expect(sniffPhoto(JPEG)).toBe("jpeg");
    expect(sniffPhoto(PNG)).toBe("png");
    expect(sniffPhoto(HEIC)).toBe("heic");
    expect(sniffPhoto(TEXT)).toBeNull();
    expect(sniffPhoto(CR3)).toBeNull();
  });

  it("identifies Canon RAW by its bytes, and a plain TIFF is not one", () => {
    expect(sniffCanonRaw(CR2)).toBe("CR2");
    expect(sniffCanonRaw(CR3)).toBe("CR3");
    expect(sniffCanonRaw(TIFF)).toBeNull();
    expect(sniffCanonRaw(JPEG)).toBeNull();
    expect(sniffCanonRaw(new Uint8Array(2))).toBeNull();
  });
});

describe("classifyFile", () => {
  it("accepts the photos upload accepts, whatever their extension's case", () => {
    expect(classifyFile("DCIM/100CANON/IMG_0001.JPG", 6_000_000, JPEG)).toEqual({
      category: "photo",
      format: "jpeg",
      reason: null,
    });
    expect(classifyFile("a.png", 10, PNG).format).toBe("png");
    expect(classifyFile("b.HEIC", 10, HEIC).format).toBe("heic");
  });

  it("counts Canon RAW apart from photos", () => {
    expect(classifyFile("IMG_0001.CR2", 25_000_000, CR2)).toEqual({
      category: "raw",
      format: "CR2",
      reason: null,
    });
    expect(classifyFile("IMG_0002.CR3", 30_000_000, CR3).format).toBe("CR3");
  });

  it("explains every file it will not take", () => {
    expect(classifyFile("fake.jpg", 100, TEXT).reason).toBe(
      "Named .jpg but is not a JPG image",
    );
    expect(classifyFile("fake.cr3", 100, TEXT).reason).toBe(
      "Named .CR3 but is not a Canon RAW file",
    );
    expect(classifyFile("clip.MP4", 100, TEXT).reason).toBe(
      ".mp4 files are not photos JerseySort reads",
    );
    expect(classifyFile("Thumbs.db", 100, TEXT).reason).toBe(
      "System file, not a photo",
    );
    expect(classifyFile("sub/desktop.ini", 100, TEXT).category).toBe("unsupported");
    expect(classifyFile("empty.txt", 0, new Uint8Array()).category).toBe("unsupported");
    expect(classifyFile("noext", 5, TEXT).reason).toBe("Not a photo");
  });

  it("refuses a photo too large to upload, as upload would", () => {
    const c = classifyFile("huge.jpg", MAX_PHOTO_BYTES + 1, JPEG);
    expect(c.category).toBe("unsupported");
    expect(c.reason).toBe("Larger than 60 MB");
    expect(classifyFile("max.jpg", MAX_PHOTO_BYTES, JPEG).category).toBe("photo");
  });

  it("goes by the bytes: a JPEG named .png is a JPEG", () => {
    expect(classifyFile("misnamed.png", 10, JPEG).format).toBe("jpeg");
  });

  it("reads extensions from Windows and POSIX paths", () => {
    expect(extensionOf("C:\\Photos\\IMG.JPG")).toBe("jpg");
    expect(extensionOf("DCIM/100CANON/IMG_1.CR3")).toBe("cr3");
    expect(extensionOf(".hidden")).toBe("");
    expect(extensionOf("folder.v2/file")).toBe("");
  });
});

describe("camera time", () => {
  it("is the camera's wall clock, with no time zone applied", () => {
    expect(wallClock(new Date(2026, 9, 3, 19, 30, 5))).toBe("2026-10-03T19:30:05");
  });

  it("refuses missing and absurd dates rather than inventing one", () => {
    expect(wallClock(undefined)).toBeNull();
    expect(wallClock("2026-10-03")).toBeNull();
    expect(wallClock(new Date(Number.NaN))).toBeNull();
    expect(wallClock(new Date(1970, 0, 1))).toBeNull();
  });

  it("prefers when the shutter fired over when the file was written", () => {
    expect(
      cameraTime({
        DateTimeOriginal: new Date(2026, 9, 3, 19, 0, 0),
        CreateDate: new Date(2026, 9, 4, 9, 0, 0),
        DateTime: new Date(2026, 9, 5, 9, 0, 0),
      }),
    ).toBe("2026-10-03T19:00:00");
    expect(cameraTime({ DateTime: new Date(2026, 9, 5, 9, 0, 0) })).toBe(
      "2026-10-05T09:00:00",
    );
    expect(cameraTime({})).toBeNull();
    expect(cameraTime(undefined)).toBeNull();
  });
});

function photo(
  path: string,
  takenAt: string,
  dateSource: "camera" | "estimated" = "camera",
  format: "jpeg" | "png" | "heic" = "jpeg",
): CheckedFile {
  return {
    path,
    size: 1,
    category: "photo",
    format,
    reason: null,
    takenAt,
    dateSource,
    camera: null,
  };
}
function raw(
  path: string,
  takenAt: string | null,
  format: "CR2" | "CR3" = "CR3",
): CheckedFile {
  return {
    path,
    size: 1,
    category: "raw",
    format,
    reason: null,
    takenAt,
    dateSource: takenAt === null ? null : "camera",
    camera: null,
  };
}
const other = (path: string, reason: string): CheckedFile => ({
  path,
  size: 1,
  category: "unsupported",
  format: null,
  reason,
  takenAt: null,
  dateSource: null,
  camera: null,
});

describe("summarizeFolder", () => {
  const files: CheckedFile[] = [
    photo("a.jpg", "2026-10-03T18:01:00"),
    photo("b.jpg", "2026-10-03T20:44:10"),
    photo("c.png", "2026-10-04T10:00:00", "camera", "png"),
    photo("d.heic", "2026-10-04T11:00:00", "estimated", "heic"),
    photo("e.jpg", "2026-10-05T09:15:00"),
    raw("a.CR3", "2026-10-03T18:01:00"),
    raw("x.CR2", null, "CR2"),
    other("Thumbs.db", "System file, not a photo"),
    other("clip.mp4", ".mp4 files are not photos JerseySort reads"),
  ];
  const r = summarizeFolder(files);

  it("counts every file exactly once", () => {
    expect(r.totalFiles).toBe(9);
    expect(r.supported).toBe(5);
    expect([r.jpeg, r.png, r.heic]).toEqual([3, 1, 1]);
    expect([r.cr2, r.cr3]).toEqual([1, 1]);
    expect(r.unsupported).toHaveLength(2);
    expect(r.supported + r.cr2 + r.cr3 + r.unsupported.length).toBe(r.totalFiles);
  });

  it("separates camera dates from estimates", () => {
    expect(r.cameraDated).toBe(4);
    expect(r.estimatedDated).toBe(1);
  });

  it("gives the first and last moment anything was shot", () => {
    expect(r.earliest).toBe("2026-10-03T18:01:00");
    expect(r.latest).toBe("2026-10-05T09:15:00");
    expect(r.rangeIncludesEstimate).toBe(false);
  });

  it("lists every distinct shooting date, oldest first, with its counts", () => {
    expect(r.days).toEqual([
      {
        day: "2026-10-03",
        photos: 2,
        camera: 2,
        estimated: 0,
        jpeg: 2,
        png: 0,
        heic: 0,
        raw: 1,
        cr2: 0,
        cr3: 1,
        first: "2026-10-03T18:01:00",
        last: "2026-10-03T20:44:10",
      },
      {
        day: "2026-10-04",
        photos: 2,
        camera: 1,
        estimated: 1,
        jpeg: 0,
        png: 1,
        heic: 1,
        raw: 0,
        cr2: 0,
        cr3: 0,
        first: "2026-10-04T10:00:00",
        last: "2026-10-04T11:00:00",
      },
      {
        day: "2026-10-05",
        photos: 1,
        camera: 1,
        estimated: 0,
        jpeg: 1,
        png: 0,
        heic: 0,
        raw: 0,
        cr2: 0,
        cr3: 0,
        first: "2026-10-05T09:15:00",
        last: "2026-10-05T09:15:00",
      },
    ]);
  });

  it("adds up per day to the folder's totals", () => {
    const sum = (
      k: "photos" | "camera" | "estimated" | "jpeg" | "png" | "heic" | "cr3",
    ) => r.days.reduce((n, d) => n + d[k], 0);
    expect(sum("photos")).toBe(r.supported);
    expect(sum("camera") + sum("estimated")).toBe(r.supported);
    expect([sum("jpeg"), sum("png"), sum("heic")]).toEqual([r.jpeg, r.png, r.heic]);
    // The CR2 has no date at all, so it is counted in the folder but on no day.
    expect(sum("cr3")).toBe(r.cr3);
  });

  it("flags a range that rests on an estimated date", () => {
    const s = summarizeFolder([
      photo("z.jpg", "2025-01-01T00:00:00", "estimated"),
      ...files,
    ]);
    expect(s.earliest).toBe("2025-01-01T00:00:00");
    expect(s.rangeIncludesEstimate).toBe(true);
  });

  it("does not call the range an estimate when a camera date ties with an estimate", () => {
    const tie = summarizeFolder([
      { ...raw("a.CR3", "2026-10-03T18:01:00"), dateSource: "estimated" },
      photo("a.jpg", "2026-10-03T18:01:00"),
      { ...raw("z.CR3", "2026-10-03T20:00:00"), dateSource: "estimated" },
      photo("z.jpg", "2026-10-03T20:00:00"),
    ]);
    expect(tie.rangeIncludesEstimate).toBe(false);
  });

  it("reports an empty folder as empty, not as an error", () => {
    const e = summarizeFolder([]);
    expect(e.totalFiles).toBe(0);
    expect(e.earliest).toBeNull();
    expect(e.days).toEqual([]);
    expect(proposeGames(e)).toEqual([]);
  });
});

describe("proposeGames", () => {
  it("proposes one game per shooting date, in the words of the brief", () => {
    const files = [
      ...Array.from({ length: 428 }, (_, i) =>
        photo(`a${i}.jpg`, "2026-10-03T18:00:00"),
      ),
      ...Array.from({ length: 617 }, (_, i) =>
        photo(`b${i}.jpg`, "2026-10-04T18:00:00"),
      ),
      ...Array.from({ length: 352 }, (_, i) =>
        photo(`c${i}.jpg`, "2026-10-05T18:00:00"),
      ),
    ];
    expect(proposeGames(summarizeFolder(files)).map((g) => g.label)).toEqual([
      "October 3, 2026 — 428 photos",
      "October 4, 2026 — 617 photos",
      "October 5, 2026 — 352 photos",
    ]);
  });

  it("proposes nothing for a day that has only RAW files", () => {
    const games = proposeGames(
      summarizeFolder([
        raw("a.CR3", "2026-10-03T18:00:00"),
        photo("b.jpg", "2026-10-04T18:00:00"),
      ]),
    );
    expect(games.map((g) => g.day)).toEqual(["2026-10-04"]);
    expect(games[0]?.label).toBe("October 4, 2026 — 1 photo");
    expect(games[0]?.suggestedName).toBe("October 4, 2026 Game");
  });

  it("writes a calendar day without shifting it through a time zone", () => {
    expect(longDay("2026-01-01")).toBe("January 1, 2026");
    expect(longDay("2026-12-31")).toBe("December 31, 2026");
    expect(longDay("not a day")).toBe("not a day");
  });
});
