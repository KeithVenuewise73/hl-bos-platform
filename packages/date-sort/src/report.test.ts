import { describe, expect, it } from "vitest";

import type { DateSource } from "./capture-date";
import type { PhotoFormat } from "./formats";
import { buildReport, type ScannedFile } from "./report";

const photo = (
  path: string,
  format: PhotoFormat,
  takenAt: string | null,
  dateSource: DateSource | null = takenAt === null ? null : "DateTimeOriginal",
): ScannedFile => ({ kind: "photo", path, size: 1000, format, takenAt, dateSource });

describe("the scan report", () => {
  const files: ScannedFile[] = [
    photo("a.JPG", "jpeg", "2026-10-04T13:03:00"),
    photo("a.CR3", "cr3", "2026-10-04T13:03:00"),
    photo("b.JPG", "jpeg", "2026-10-04T15:47:12"),
    photo("c.HEIC", "heic", "2026-10-04T10:15:00", "FileModified"),
    photo("d.JPG", "jpeg", "2026-10-03T19:00:00", "CreateDate"),
    photo("e.png", "png", "2026-10-05T08:00:00", "FileModified"),
    photo("f.CR2", "cr2", "2026-10-03T18:00:00"),
    photo("g.jpg", "jpeg", null),
    {
      kind: "unsupported",
      path: "Thumbs.db",
      size: 10,
      reason: "System file, not a photo",
    },
    {
      kind: "unsupported",
      path: "MVI.MP4",
      size: 10,
      reason: ".mp4 files are not photos",
    },
  ];
  const r = buildReport(files);

  it("counts every file, every photo and every format", () => {
    expect(r.totalFiles).toBe(10);
    expect(r.photos).toBe(8);
    expect(r.byFormat).toEqual({ jpeg: 4, png: 1, heic: 1, cr2: 1, cr3: 1 });
    expect(r.unsupported.map((u) => u.path)).toEqual(["Thumbs.db", "MVI.MP4"]);
  });

  it("separates camera dates from estimates, and lists the undatable", () => {
    expect(r.cameraDated).toBe(5); // DateTimeOriginal or CreateDate
    expect(r.estimated).toBe(2);
    expect(r.undated).toEqual([{ path: "g.jpg" }]);
  });

  it("groups by shooting date, oldest first, with per-day counts and times", () => {
    expect(r.days.map((d) => d.day)).toEqual([
      "2026-10-03",
      "2026-10-04",
      "2026-10-05",
    ]);
    const oct4 = r.days[1]!;
    expect(oct4.photos).toBe(4);
    expect(oct4.byFormat).toEqual({ jpeg: 2, png: 0, heic: 1, cr2: 0, cr3: 1 });
    expect(oct4.cameraDated).toBe(3);
    expect(oct4.estimated).toBe(1);
    expect(oct4.first).toBe("2026-10-04T10:15:00");
    expect(oct4.firstIsEstimate).toBe(true);
    expect(oct4.last).toBe("2026-10-04T15:47:12");
    expect(oct4.lastIsEstimate).toBe(false);
    expect(r.days[0]).toMatchObject({
      photos: 2,
      first: "2026-10-03T18:00:00",
      last: "2026-10-03T19:00:00",
    });
  });

  it("gives the overall range and says when an end of it is an estimate", () => {
    expect(r.earliest).toBe("2026-10-03T18:00:00");
    expect(r.earliestIsEstimate).toBe(false);
    expect(r.latest).toBe("2026-10-05T08:00:00");
    expect(r.latestIsEstimate).toBe(true);
  });

  it("does not call a moment estimated when a camera date shares it", () => {
    const tie = buildReport([
      photo("x.png", "png", "2026-10-04T12:00:00", "FileModified"),
      photo("y.JPG", "jpeg", "2026-10-04T12:00:00"),
    ]);
    expect(tie.days[0]!.firstIsEstimate).toBe(false);
    expect(tie.days[0]!.lastIsEstimate).toBe(false);
    expect(tie.earliestIsEstimate).toBe(false);
  });

  it("puts a game that runs past midnight on the camera's dates, not shifted", () => {
    const late = buildReport([
      photo("1.JPG", "jpeg", "2026-10-04T23:58:00"),
      photo("2.JPG", "jpeg", "2026-10-05T00:03:00"),
    ]);
    expect(late.days.map((d) => d.day)).toEqual(["2026-10-04", "2026-10-05"]);
  });

  it("handles an empty folder", () => {
    const empty = buildReport([]);
    expect(empty).toMatchObject({ totalFiles: 0, photos: 0, days: [], earliest: null });
  });
});
