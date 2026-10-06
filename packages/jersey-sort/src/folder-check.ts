/**
 * Check Folder: what is in a photo folder, before anything is imported.
 *
 * READ ONLY by construction. Nothing here touches a filesystem: the caller
 * (a browser page) hands in each file's name, size, first bytes and whatever
 * date its EXIF holds, and gets back a report. Moving, renaming, deleting,
 * re-dating or copying a file is not something this module can do.
 *
 * Also the single home of two rules the upload pipeline shares, so a file
 * Check Folder calls "supported" is a file upload will accept:
 *   - sniffPhoto: a photo is identified by its bytes, never by its name.
 *   - wallClock:  a camera's timestamp is a wall clock with no time zone.
 */

export type PhotoKind = "jpeg" | "png" | "heic";

/** 60 MB: a full-resolution camera JPEG or iPhone HEIC is far below this. */
export const MAX_PHOTO_BYTES = 60 * 1024 * 1024;

/**
 * Identify a photo by its bytes, never by its name or the browser's claim.
 * A renamed .exe is not a JPEG because its name ends in .jpg.
 */
export function sniffPhoto(bytes: Uint8Array): PhotoKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "jpeg";
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)
  ) {
    return "png";
  }
  const box = ascii(bytes, 4, 8);
  const brand = ascii(bytes, 8, 12);
  if (
    box === "ftyp" &&
    ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand)
  ) {
    return "heic";
  }
  return null;
}

export type CanonRaw = "CR2" | "CR3";

/**
 * A Canon RAW file, by its bytes. CR2 is a TIFF with "CR" at offset 8;
 * CR3 is an ISO media file whose brand is "crx ".
 */
export function sniffCanonRaw(bytes: Uint8Array): CanonRaw | null {
  const tiff =
    (bytes[0] === 0x49 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x2a &&
      bytes[3] === 0x00) ||
    (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a);
  if (tiff && ascii(bytes, 8, 10) === "CR") return "CR2";
  if (ascii(bytes, 4, 8) === "ftyp" && ascii(bytes, 8, 12) === "crx ") return "CR3";
  return null;
}

function ascii(bytes: Uint8Array, from: number, to: number): string {
  if (bytes.length < to) return "";
  return String.fromCharCode(...bytes.subarray(from, to));
}

/** How many leading bytes the sniffers need. */
export const SNIFF_BYTES = 16;

/**
 * Camera clocks have no time zone. exifr returns a Date built from the
 * camera's wall-clock fields in this process's zone; reading the same fields
 * back gives the wall clock exactly, which is what "taken at 7:30 pm" means.
 * Returns "YYYY-MM-DDTHH:MM:SS", or null for a missing or absurd date.
 */
export function wallClock(d: unknown): string | null {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  if (year < 1990 || year > 2100) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${year}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** The EXIF fields a capture time is read from, best first. */
export function cameraTime(
  tags: Record<string, unknown> | null | undefined,
): string | null {
  if (tags === null || tags === undefined) return null;
  return (
    wallClock(tags["DateTimeOriginal"]) ??
    wallClock(tags["CreateDate"]) ??
    wallClock(tags["DateTime"])
  );
}

// ---------------------------------------------------------------------------
// Classifying one file
// ---------------------------------------------------------------------------

export type FileCategory = "photo" | "raw" | "unsupported";

const PHOTO_EXTENSIONS: Readonly<Record<string, PhotoKind>> = {
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  heic: "heic",
  heif: "heic",
};

/** Files Windows, macOS and cameras leave in folders; never photos. */
const SYSTEM_FILES = new Set(["thumbs.db", "desktop.ini", ".ds_store", "ehthumbs.db"]);

export function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export interface Classified {
  readonly category: FileCategory;
  /** jpeg | png | heic for a photo; CR2 | CR3 for Canon RAW. */
  readonly format: PhotoKind | CanonRaw | null;
  /** Why an unsupported file is unsupported, in plain words. */
  readonly reason: string | null;
}

/**
 * What one file is: a photo upload will accept, a Canon RAW file, or
 * something else (and why). Decided by the bytes; the name is only used to
 * explain a mismatch.
 */
export function classifyFile(name: string, size: number, head: Uint8Array): Classified {
  const base = (name.split(/[\\/]/).pop() ?? name).toLowerCase();
  const ext = extensionOf(name);
  if (SYSTEM_FILES.has(base) || base.startsWith("._")) {
    return {
      category: "unsupported",
      format: null,
      reason: "System file, not a photo",
    };
  }
  const raw = sniffCanonRaw(head);
  if (raw !== null) return { category: "raw", format: raw, reason: null };
  const kind = sniffPhoto(head);
  if (kind !== null) {
    if (size > MAX_PHOTO_BYTES) {
      return {
        category: "unsupported",
        format: kind,
        reason: `Larger than ${MAX_PHOTO_BYTES / 1024 / 1024} MB`,
      };
    }
    return { category: "photo", format: kind, reason: null };
  }
  if (ext === "cr2" || ext === "cr3") {
    return {
      category: "unsupported",
      format: null,
      reason: `Named .${ext.toUpperCase()} but is not a Canon RAW file`,
    };
  }
  if (PHOTO_EXTENSIONS[ext] !== undefined) {
    return {
      category: "unsupported",
      format: null,
      reason: `Named .${ext} but is not a ${ext.toUpperCase()} image`,
    };
  }
  if (size === 0)
    return { category: "unsupported", format: null, reason: "Empty file" };
  return {
    category: "unsupported",
    format: null,
    reason:
      ext === "" ? "Not a photo" : `.${ext} files are not photos JerseySort reads`,
  };
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

export type DateSource = "camera" | "estimated";

export interface CheckedFile {
  /** Path inside the chosen folder, e.g. "DCIM/100CANON/IMG_0001.JPG". */
  readonly path: string;
  readonly size: number;
  readonly category: FileCategory;
  readonly format: PhotoKind | CanonRaw | null;
  readonly reason: string | null;
  /**
   * When the photo was taken, "YYYY-MM-DDTHH:MM:SS". From the camera's EXIF
   * when it has one; otherwise ESTIMATED from the file's modified time.
   * Null for unsupported files, which are not dated.
   */
  readonly takenAt: string | null;
  readonly dateSource: DateSource | null;
  readonly camera: string | null;
}

export interface DayGroup {
  /** YYYY-MM-DD */
  readonly day: string;
  /** Supported photos taken that day. */
  readonly photos: number;
  /** Of those, how many are dated only by an estimate. */
  readonly estimated: number;
  /** Canon RAW files taken that day (not importable yet; counted apart). */
  readonly raw: number;
  /** First and last time a photo or RAW file was taken that day. */
  readonly first: string;
  readonly last: string;
}

export interface FolderReport {
  readonly totalFiles: number;
  readonly supported: number;
  readonly jpeg: number;
  readonly png: number;
  readonly heic: number;
  readonly cr2: number;
  readonly cr3: number;
  readonly unsupported: ReadonlyArray<{
    readonly path: string;
    readonly reason: string;
  }>;
  /** Supported photos with a camera date. */
  readonly cameraDated: number;
  /** Supported photos whose date is an estimate. */
  readonly estimatedDated: number;
  /** Earliest and latest time any photo or RAW file was taken. */
  readonly earliest: string | null;
  readonly latest: string | null;
  /** True when earliest/latest rest on an estimated date. */
  readonly rangeIncludesEstimate: boolean;
  /** Every distinct shooting date, oldest first. */
  readonly days: readonly DayGroup[];
}

export function summarizeFolder(files: readonly CheckedFile[]): FolderReport {
  let jpeg = 0;
  let png = 0;
  let heic = 0;
  let cr2 = 0;
  let cr3 = 0;
  let cameraDated = 0;
  let estimatedDated = 0;
  const unsupported: { path: string; reason: string }[] = [];
  const days = new Map<
    string,
    { photos: number; estimated: number; raw: number; first: string; last: string }
  >();
  let earliest: CheckedFile | null = null;
  let latest: CheckedFile | null = null;

  for (const f of files) {
    if (f.category === "unsupported") {
      unsupported.push({ path: f.path, reason: f.reason ?? "Not supported" });
      continue;
    }
    if (f.format === "jpeg") jpeg += 1;
    else if (f.format === "png") png += 1;
    else if (f.format === "heic") heic += 1;
    else if (f.format === "CR2") cr2 += 1;
    else if (f.format === "CR3") cr3 += 1;

    if (f.category === "photo") {
      if (f.dateSource === "camera") cameraDated += 1;
      else if (f.dateSource === "estimated") estimatedDated += 1;
    }
    if (f.takenAt === null) continue;

    // On a tie, a camera date wins: the range is only "an estimate" when
    // no camera-dated file shares that moment.
    const better = (g: CheckedFile | null, before: boolean) =>
      g === null ||
      (before ? f.takenAt! < g.takenAt! : f.takenAt! > g.takenAt!) ||
      (f.takenAt === g.takenAt &&
        f.dateSource === "camera" &&
        g.dateSource !== "camera");
    if (better(earliest, true)) earliest = f;
    if (better(latest, false)) latest = f;

    const day = f.takenAt.slice(0, 10);
    const g = days.get(day) ?? {
      photos: 0,
      estimated: 0,
      raw: 0,
      first: f.takenAt,
      last: f.takenAt,
    };
    if (f.category === "photo") {
      g.photos += 1;
      if (f.dateSource === "estimated") g.estimated += 1;
    } else {
      g.raw += 1;
    }
    if (f.takenAt < g.first) g.first = f.takenAt;
    if (f.takenAt > g.last) g.last = f.takenAt;
    days.set(day, g);
  }

  return {
    totalFiles: files.length,
    supported: jpeg + png + heic,
    jpeg,
    png,
    heic,
    cr2,
    cr3,
    unsupported,
    cameraDated,
    estimatedDated,
    earliest: earliest?.takenAt ?? null,
    latest: latest?.takenAt ?? null,
    rangeIncludesEstimate:
      earliest?.dateSource === "estimated" || latest?.dateSource === "estimated",
    days: [...days.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([day, g]) => ({ day, ...g })),
  };
}

export interface ProposedGame {
  readonly day: string;
  /** "October 3, 2026 — 428 photos" */
  readonly label: string;
  readonly photos: number;
  readonly estimated: number;
  readonly raw: number;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "2026-10-03" -> "October 3, 2026" (no time zone: it is a calendar day). */
export function longDay(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (m === null) return day;
  return `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${Number(m[3])}, ${m[1]}`;
}

/**
 * One proposed game per shooting date that has importable photos. A
 * PROPOSAL only: nothing is created. A day with only RAW files proposes
 * nothing, because nothing from it can be imported yet.
 */
export function proposeGames(report: FolderReport): ProposedGame[] {
  return report.days
    .filter((d) => d.photos > 0)
    .map((d) => ({
      day: d.day,
      label: `${longDay(d.day)} — ${d.photos.toLocaleString("en-US")} photo${d.photos === 1 ? "" : "s"}`,
      photos: d.photos,
      estimated: d.estimated,
      raw: d.raw,
    }));
}
