/**
 * When a photo was taken: the rule, in one place.
 *
 *   1. EXIF DateTimeOriginal (tag 0x9003) — the moment the shutter fired.
 *   2. EXIF CreateDate (tag 0x9004, "DateTimeDigitized") — when the camera
 *      wrote the image; the same moment on every Canon body.
 *   3. Neither: the file's modified time, labelled ESTIMATED everywhere it
 *      is shown.
 *
 * EXIF DateTime (tag 0x0132, "ModifyDate") is deliberately NOT on the list:
 * it is the time the file was last edited, and any photo editor rewrites
 * it. Treating it as Date Taken would silently move an edited photo to the
 * day it was edited.
 *
 * Camera clocks have no time zone. A capture time is kept as the wall-clock
 * text the camera wrote ("YYYY-MM-DDTHH:MM:SS") and never converted, so a
 * game shot at 11:30 pm stays on the day the camera showed.
 */

export type DateSource = "DateTimeOriginal" | "CreateDate" | "FileModified";

export interface CaptureDate {
  /** "YYYY-MM-DDTHH:MM:SS", wall clock, no zone. */
  readonly takenAt: string;
  readonly source: DateSource;
}

/** True when the date came from the camera, false when it is an estimate. */
export function isCameraDate(source: DateSource): boolean {
  return source !== "FileModified";
}

/**
 * Parse an EXIF date ("2026:10:04 13:03:00", sometimes with "-" separators,
 * sub-seconds or a zone suffix) into wall-clock text. Null for a missing,
 * blank ("    :  :     "), zero ("0000:00:00 00:00:00") or impossible date.
 */
export function parseExifDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = /^\s*(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (m === null) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (y < 1990 || y > 2100) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) return null;
  if (h > 23 || mi > 59 || s > 59) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
}

function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The camera's date, best field first; null when the camera left none. */
export function cameraDate(tags: {
  readonly dateTimeOriginal?: unknown;
  readonly createDate?: unknown;
}): CaptureDate | null {
  const original = parseExifDate(tags.dateTimeOriginal);
  if (original !== null) return { takenAt: original, source: "DateTimeOriginal" };
  const created = parseExifDate(tags.createDate);
  if (created !== null) return { takenAt: created, source: "CreateDate" };
  return null;
}

/**
 * The estimate: a file's modified time as a wall clock in this computer's
 * time zone (which is how Windows Explorer shows it). Null if absurd.
 */
export function estimateFromFileTime(modified: Date): CaptureDate | null {
  if (Number.isNaN(modified.getTime())) return null;
  const y = modified.getFullYear();
  if (y < 1990 || y > 2100) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    takenAt: `${y}-${p(modified.getMonth() + 1)}-${p(modified.getDate())}T${p(modified.getHours())}:${p(modified.getMinutes())}:${p(modified.getSeconds())}`,
    source: "FileModified",
  };
}
