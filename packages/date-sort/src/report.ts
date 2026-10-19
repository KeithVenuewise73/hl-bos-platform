/**
 * The scan report: totals, and one entry per shooting day.
 *
 * Pure: takes what the scanner found, returns numbers. Every count on the
 * screen comes from here, so every count is tested here.
 */

import { isCameraDate, type DateSource } from "./capture-date";
import { PHOTO_FORMATS, type PhotoFormat } from "./formats";

export interface ScannedPhoto {
  readonly kind: "photo";
  /** Path inside the chosen folder, e.g. "DCIM\\100CANON\\IMG_0001.CR3". */
  readonly path: string;
  readonly size: number;
  readonly format: PhotoFormat;
  /** "YYYY-MM-DDTHH:MM:SS", or null when no date at all could be found. */
  readonly takenAt: string | null;
  readonly dateSource: DateSource | null;
}

export interface UnsupportedFile {
  readonly kind: "unsupported";
  readonly path: string;
  readonly size: number;
  readonly reason: string;
}

export type ScannedFile = ScannedPhoto | UnsupportedFile;

export type FormatCounts = Record<PhotoFormat, number>;

export function zeroCounts(): FormatCounts {
  return { jpeg: 0, png: 0, heic: 0, cr2: 0, cr3: 0 };
}

export interface DayReport {
  /** "YYYY-MM-DD" */
  readonly day: string;
  readonly photos: number;
  readonly byFormat: FormatCounts;
  /** Dated by the camera (DateTimeOriginal or CreateDate). */
  readonly cameraDated: number;
  /** Dated only by the file's modified time. */
  readonly estimated: number;
  /** Earliest and latest capture time that day, "YYYY-MM-DDTHH:MM:SS". */
  readonly first: string;
  readonly last: string;
  /** True when the first / last time rests on an estimated date. */
  readonly firstIsEstimate: boolean;
  readonly lastIsEstimate: boolean;
}

export interface ScanReport {
  readonly totalFiles: number;
  readonly photos: number;
  readonly byFormat: FormatCounts;
  readonly cameraDated: number;
  readonly estimated: number;
  /** Photos with no usable date at all (no EXIF, and an absurd file time). */
  readonly undated: ReadonlyArray<{ readonly path: string }>;
  readonly unsupported: ReadonlyArray<{
    readonly path: string;
    readonly reason: string;
  }>;
  readonly earliest: string | null;
  readonly latest: string | null;
  readonly earliestIsEstimate: boolean;
  readonly latestIsEstimate: boolean;
  /** Every shooting day, oldest first. */
  readonly days: readonly DayReport[];
}

interface DayAcc {
  photos: number;
  byFormat: FormatCounts;
  cameraDated: number;
  estimated: number;
  first: ScannedPhoto;
  last: ScannedPhoto;
}

/**
 * Which of two photos taken at the same second should stand for that
 * moment: a camera date beats an estimate, so a range is "estimated" only
 * when no camera-dated photo shares its end.
 */
function preferCamera(a: ScannedPhoto, b: ScannedPhoto): ScannedPhoto {
  const camA = a.dateSource !== null && isCameraDate(a.dateSource);
  const camB = b.dateSource !== null && isCameraDate(b.dateSource);
  return camB && !camA ? b : a;
}

function earlier(cur: ScannedPhoto, f: ScannedPhoto): ScannedPhoto {
  if (f.takenAt! < cur.takenAt!) return f;
  if (f.takenAt === cur.takenAt) return preferCamera(cur, f);
  return cur;
}

function later(cur: ScannedPhoto, f: ScannedPhoto): ScannedPhoto {
  if (f.takenAt! > cur.takenAt!) return f;
  if (f.takenAt === cur.takenAt) return preferCamera(cur, f);
  return cur;
}

const estimate = (f: ScannedPhoto) => f.dateSource === "FileModified";

export function buildReport(files: readonly ScannedFile[]): ScanReport {
  const byFormat = zeroCounts();
  let cameraDated = 0;
  let estimated = 0;
  const undated: { path: string }[] = [];
  const unsupported: { path: string; reason: string }[] = [];
  const days = new Map<string, DayAcc>();
  let earliest: ScannedPhoto | null = null;
  let latest: ScannedPhoto | null = null;

  for (const f of files) {
    if (f.kind === "unsupported") {
      unsupported.push({ path: f.path, reason: f.reason });
      continue;
    }
    byFormat[f.format] += 1;
    if (f.takenAt === null || f.dateSource === null) {
      undated.push({ path: f.path });
      continue;
    }
    if (isCameraDate(f.dateSource)) cameraDated += 1;
    else estimated += 1;

    earliest = earliest === null ? f : earlier(earliest, f);
    latest = latest === null ? f : later(latest, f);

    const day = f.takenAt.slice(0, 10);
    const acc: DayAcc = days.get(day) ?? {
      photos: 0,
      byFormat: zeroCounts(),
      cameraDated: 0,
      estimated: 0,
      first: f,
      last: f,
    };
    acc.photos += 1;
    acc.byFormat[f.format] += 1;
    if (isCameraDate(f.dateSource)) acc.cameraDated += 1;
    else acc.estimated += 1;
    acc.first = earlier(acc.first, f);
    acc.last = later(acc.last, f);
    days.set(day, acc);
  }

  const photos = PHOTO_FORMATS.reduce((n, k) => n + byFormat[k], 0);
  return {
    totalFiles: files.length,
    photos,
    byFormat,
    cameraDated,
    estimated,
    undated,
    unsupported,
    earliest: earliest?.takenAt ?? null,
    latest: latest?.takenAt ?? null,
    earliestIsEstimate: earliest !== null && estimate(earliest),
    latestIsEstimate: latest !== null && estimate(latest),
    days: [...days.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([day, g]) => ({
        day,
        photos: g.photos,
        byFormat: g.byFormat,
        cameraDated: g.cameraDated,
        estimated: g.estimated,
        first: g.first.takenAt!,
        last: g.last.takenAt!,
        firstIsEstimate: estimate(g.first),
        lastIsEstimate: estimate(g.last),
      })),
  };
}
