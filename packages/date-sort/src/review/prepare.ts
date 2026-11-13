/**
 * Getting a date's photos ready to send for review. Reads the originals (only
 * ever through the read-only module) and makes, for each photo:
 *
 *   - a web-size copy (2400 px long side) and a thumbnail (480 px);
 *   - quality hints (see quality.ts), worked out here so the website does not
 *     have to look at the pixels;
 *   - a fingerprint of the original, so the same photo is never sent twice.
 *
 * sharp writes no metadata unless asked, so the camera details and any GPS
 * location in the original are NOT in what is sent. These are photographs of
 * children; where they were taken stays with the originals.
 *
 * Videos are listed and counted but not sent yet.
 */

import { createHash } from "node:crypto";
import { basename } from "node:path";

import sharp from "sharp";

import { isVideo } from "../formats";
import { openForReading } from "../read-only-file";
import { scanFolder, type ScanOptions } from "../scan";
import { flagsFor, measure, type QualityFlag } from "./quality";

export const WEB_EDGE = 2400;
export const THUMB_EDGE = 480;
/** The farthest one photo is read in full (a bigger file is reported, not sent). */
export const MAX_PHOTO_BYTES = 80 * 1024 * 1024;

export interface ReviewCandidate {
  /** Path relative to the folder. */
  readonly path: string;
  readonly size: number;
  /** "YYYY-MM-DDTHH:MM:SS", wall clock. */
  readonly takenAt: string | null;
  /** True when the time came from the file's modified time, not the camera. */
  readonly dateEstimated: boolean;
}

export interface ReviewListing {
  readonly photos: readonly ReviewCandidate[];
  readonly videos: number;
  /** Files that cannot be sent, with the reason in words. */
  readonly skipped: ReadonlyArray<{ readonly path: string; readonly reason: string }>;
}

/** What is in a day's folder that can go for review. Reads only. */
export async function listForReview(
  folder: string,
  options: Pick<ScanOptions, "signal" | "onProgress"> = {},
): Promise<ReviewListing> {
  const scan = await scanFolder(folder, { includeSubfolders: true, ...options });
  const photos: ReviewCandidate[] = [];
  const skipped: { path: string; reason: string }[] = [];
  let videos = 0;
  for (const f of scan.files) {
    if (f.kind === "unsupported") {
      skipped.push({ path: f.path, reason: f.reason });
    } else if (isVideo(f.format)) {
      videos += 1;
    } else if (f.format === "cr2" || f.format === "cr3") {
      skipped.push({
        path: f.path,
        reason:
          "A raw Canon file: it cannot be shown on the website. Export a JPEG from it.",
      });
    } else if (f.size > MAX_PHOTO_BYTES) {
      skipped.push({ path: f.path, reason: "The file is larger than 80 MB." });
    } else {
      photos.push({
        path: f.path,
        size: f.size,
        takenAt: f.takenAt,
        dateEstimated: f.dateSource === "FileModified",
      });
    }
  }
  photos.sort(
    (a, b) =>
      (a.takenAt ?? "").localeCompare(b.takenAt ?? "") || a.path.localeCompare(b.path),
  );
  return { photos, videos, skipped };
}

export interface PreparedPhoto {
  /** SHA-256 of the original file. */
  readonly hash: string;
  readonly filename: string;
  readonly takenAt: string | null;
  readonly dateEstimated: boolean;
  readonly width: number;
  readonly height: number;
  readonly web: Buffer;
  readonly thumb: Buffer;
  readonly sharpness: number;
  readonly brightness: number;
  readonly flags: readonly QualityFlag[];
}

/** Hash an original without making the copies (to ask what is already known). */
export async function hashOf(root: string, rel: string): Promise<string> {
  const file = await openForReading(`${root}/${rel}`);
  try {
    const h = createHash("sha256");
    const CHUNK = 4 * 1024 * 1024;
    for (let at = 0; at < file.size; at += CHUNK) h.update(await file.read(at, CHUNK));
    return h.digest("hex");
  } finally {
    await file.close();
  }
}

/** One photo, ready to send. Throws with a plain message when it cannot be read. */
export async function prepare(
  root: string,
  c: ReviewCandidate,
): Promise<PreparedPhoto> {
  const file = await openForReading(`${root}/${c.path}`);
  let bytes: Uint8Array;
  try {
    bytes = await file.read(0, file.size);
  } finally {
    await file.close();
  }
  const hash = createHash("sha256").update(bytes).digest("hex");
  try {
    const base = sharp(bytes).rotate(); // honour the camera's orientation, then metadata is dropped
    const web = await base
      .clone()
      .resize({
        width: WEB_EDGE,
        height: WEB_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    const thumb = await base
      .clone()
      .resize({
        width: THUMB_EDGE,
        height: THUMB_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 78 })
      .toBuffer();
    const meta = await sharp(bytes).rotate().metadata();
    const originalLong = Math.max(meta.width ?? 0, meta.height ?? 0);
    const reading = await measure(web.data);
    return {
      hash,
      filename: basename(c.path),
      takenAt: c.takenAt,
      dateEstimated: c.dateEstimated,
      width: web.info.width,
      height: web.info.height,
      web: web.data,
      thumb,
      sharpness: reading.sharpness,
      brightness: reading.brightness,
      flags: flagsFor(reading, originalLong > 0 ? originalLong : null),
    };
  } catch (e) {
    throw new Error(
      `${basename(c.path)} could not be read as a picture${e instanceof Error ? `: ${e.message}` : "."}`,
      { cause: e },
    );
  }
}
