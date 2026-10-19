/**
 * Scan a folder: list it, look at every file, report. READ ONLY.
 *
 * All filesystem access goes through read-only-file.ts, which can only read.
 * The EXIF library is never given a path — it is handed bytes this module
 * already read — so it cannot open a file in any mode at all.
 *
 * Node only (the app's server runs it). Nothing here talks to a network.
 */

import { join } from "node:path";

import exifr from "exifr";

import { cameraDate, estimateFromFileTime, type CaptureDate } from "./capture-date";
import { readCr3Dates } from "./cr3";
import { readHeifDates } from "./heif";
import { classify, SNIFF_BYTES, type PhotoFormat } from "./formats";
import {
  fileFacts,
  listFolder,
  openForReading,
  type OpenForReading,
} from "./read-only-file";
import { buildReport, type ScannedFile, type ScanReport } from "./report";
import type { TiffDates } from "./tiff";

export interface ScanOptions {
  readonly includeSubfolders: boolean;
  /** Files read at once. A laptop disk is happiest with a handful. */
  readonly concurrency?: number;
  readonly onProgress?: (progress: ScanProgress) => void;
  readonly signal?: AbortSignal;
}

export interface ScanProgress {
  readonly phase: "listing" | "reading";
  readonly found: number;
  readonly read: number;
}

export interface ScanResult {
  /** The folder that was scanned, exactly as given. */
  readonly root: string;
  readonly includeSubfolders: boolean;
  readonly report: ScanReport;
  /** Every file, with its format and date (or why it is not a photo). */
  readonly files: readonly ScannedFile[];
  /** Subfolders that could not be opened (e.g. permission denied), and why. */
  readonly folderProblems: ReadonlyArray<{
    readonly path: string;
    readonly reason: string;
  }>;
  /** Shortcuts / links to other folders, listed but deliberately not followed. */
  readonly skippedLinks: readonly string[];
  readonly seconds: number;
}

/** The bytes handed to the EXIF library: its metadata lives at the front. */
const HEAD_FOR_EXIF = 512 * 1024;
/** Beyond this, a photo is never read in full just to look for a date. */
const MAX_FULL_READ = 256 * 1024 * 1024;

export class ScanError extends Error {}

export async function scanFolder(
  root: string,
  options: ScanOptions,
): Promise<ScanResult> {
  const started = Date.now();
  let facts;
  try {
    facts = await fileFacts(root);
  } catch {
    throw new ScanError(`DateSort cannot find the folder "${root}".`);
  }
  if (!facts.isDirectory) throw new ScanError(`"${root}" is a file, not a folder.`);

  // 1. List. Breadth-first, links never followed (a junction can loop).
  const paths: string[] = [];
  const folderProblems: { path: string; reason: string }[] = [];
  const skippedLinks: string[] = [];
  const queue: string[] = [""];
  while (queue.length > 0) {
    options.signal?.throwIfAborted();
    const rel = queue.shift()!;
    let entries;
    try {
      entries = await listFolder(rel === "" ? root : join(root, rel));
    } catch (e) {
      folderProblems.push({ path: rel, reason: plainError(e) });
      continue;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      const childRel = rel === "" ? e.name : join(rel, e.name);
      if (e.isLink) skippedLinks.push(childRel);
      else if (e.isDirectory) {
        if (options.includeSubfolders) queue.push(childRel);
      } else if (e.isFile) paths.push(childRel);
    }
    options.onProgress?.({ phase: "listing", found: paths.length, read: 0 });
  }

  // 2. Read each file's head (and its metadata), a few at a time.
  const files: ScannedFile[] = new Array<ScannedFile>(paths.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < paths.length) {
      options.signal?.throwIfAborted();
      const i = next++;
      const rel = paths[i]!;
      files[i] = await examine(join(root, rel), rel);
      done += 1;
      if (done % 25 === 0 || done === paths.length) {
        options.onProgress?.({ phase: "reading", found: paths.length, read: done });
      }
    }
  };
  const n = Math.max(1, Math.min(options.concurrency ?? 6, 16));
  await Promise.all(Array.from({ length: n }, worker));

  return {
    root,
    includeSubfolders: options.includeSubfolders,
    report: buildReport(files),
    files,
    folderProblems,
    skippedLinks,
    seconds: (Date.now() - started) / 1000,
  };
}

/** One file: what it is, and when it was taken. Never throws. */
export async function examine(full: string, rel: string): Promise<ScannedFile> {
  let file: OpenForReading | null = null;
  try {
    const facts = await fileFacts(full);
    file = await openForReading(full);
    const head = await file.read(0, SNIFF_BYTES);
    const what = classify(rel, file.size, head);
    if (what.kind === "unsupported") {
      return { kind: "unsupported", path: rel, size: file.size, reason: what.reason };
    }
    const date =
      (await cameraDateOf(file, what.format)) ?? estimateFromFileTime(facts.modified);
    return {
      kind: "photo",
      path: rel,
      size: file.size,
      format: what.format,
      takenAt: date?.takenAt ?? null,
      dateSource: date?.source ?? null,
    };
  } catch (e) {
    return {
      kind: "unsupported",
      path: rel,
      size: 0,
      reason: `Could not be read: ${plainError(e)}`,
    };
  } finally {
    await file?.close().catch(() => undefined);
  }
}

/** The camera's own date, or null when the file carries none. */
export async function cameraDateOf(
  file: OpenForReading,
  format: PhotoFormat,
): Promise<CaptureDate | null> {
  if (format === "cr3") return ownReader(() => readCr3Dates(file));
  if (format === "heic") {
    // Our own reader first; the EXIF library as a second opinion.
    const own = await ownReader(() => readHeifDates(file));
    if (own !== null) return own;
  }
  // JPEG and CR2 keep EXIF at the front; HEIC and PNG may keep it anywhere.
  const front = format === "jpeg" || format === "cr2";
  if (front) {
    const date = await exifDate(await file.read(0, HEAD_FOR_EXIF));
    if (date !== null || file.size <= HEAD_FOR_EXIF) return date;
  }
  if (file.size > MAX_FULL_READ) return null;
  return exifDate(await file.read(0, file.size));
}

async function ownReader(read: () => Promise<TiffDates>): Promise<CaptureDate | null> {
  try {
    return cameraDate(await read());
  } catch {
    return null; // a damaged box: the caller estimates, and says so
  }
}

async function exifDate(bytes: Uint8Array): Promise<CaptureDate | null> {
  try {
    // reviveValues: false keeps the camera's text ("2026:10:04 13:03:00"):
    // no Date object, so no time-zone conversion can creep in. Only the two
    // capture-date fields are picked; ModifyDate is never asked for.
    const tags = (await exifr.parse(
      Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      {
        pick: ["DateTimeOriginal", "CreateDate"],
        reviveValues: false,
      },
    )) as Record<string, unknown> | undefined;
    if (tags === undefined || tags === null) return null;
    return cameraDate({
      dateTimeOriginal: tags["DateTimeOriginal"],
      createDate: tags["CreateDate"],
    });
  } catch {
    return null; // unreadable EXIF: the caller estimates, and says so
  }
}

function plainError(e: unknown): string {
  const code = (e as { code?: unknown } | null)?.code;
  if (code === "EACCES" || code === "EPERM")
    return "Windows did not allow it to be opened";
  if (code === "ENOENT") return "It disappeared while being scanned";
  if (code === "EBUSY") return "Another program has it locked";
  return e instanceof Error ? e.message : String(e);
}
