/**
 * What an uploaded photo is, what its EXIF says, and the two smaller copies
 * the interface uses. The ORIGINAL is never modified: it is written to disk
 * byte for byte as uploaded, and every derivative is made from a copy.
 *
 *   thumbnail  480 px long edge, WebP   — galleries (lazy-loaded)
 *   preview   1600 px long edge, JPEG   — detail view, review queue, and
 *                                         what the AI provider is sent
 *   original  untouched                 — download only
 *
 * Free of `server-only` so it can be tested directly.
 */

import { createHash } from "node:crypto";

import exifr from "exifr";
import convertHeic from "heic-convert";
import sharp from "sharp";

export type PhotoKind = "jpeg" | "png" | "heic";

export const MIME: Readonly<Record<PhotoKind, string>> = {
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
};

export const EXTENSION: Readonly<Record<PhotoKind, string>> = {
  jpeg: "jpg",
  png: "png",
  heic: "heic",
};

/** 60 MB: a full-resolution camera JPEG or iPhone HEIC is far below this. */
export const MAX_PHOTO_BYTES = 60 * 1024 * 1024;

/**
 * Identify a photo by its bytes, never by its name or the browser's claim.
 * A renamed .exe is not a JPEG because its name ends in .jpg.
 */
export function sniff(bytes: Uint8Array): PhotoKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "jpeg";
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)
  ) {
    return "png";
  }
  if (bytes.length >= 12) {
    const box = String.fromCharCode(...bytes.subarray(4, 8));
    const brand = String.fromCharCode(...bytes.subarray(8, 12));
    if (
      box === "ftyp" &&
      ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand)
    ) {
      return "heic";
    }
  }
  return null;
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export interface ExifSummary {
  /** Local wall-clock time the shutter fired, "YYYY-MM-DDTHH:MM:SS", or null. */
  readonly capturedAt: string | null;
  readonly cameraMake: string | null;
  readonly cameraModel: string | null;
  readonly lens: string | null;
  readonly iso: number | null;
  readonly exposureTime: number | null;
  readonly fNumber: number | null;
  readonly focalLength: number | null;
  readonly orientation: number | null;
  /** A small, JSON-safe subset for the detail page. GPS is deliberately left out. */
  readonly raw: Record<string, string | number>;
}

const EMPTY_EXIF: ExifSummary = {
  capturedAt: null,
  cameraMake: null,
  cameraModel: null,
  lens: null,
  iso: null,
  exposureTime: null,
  fNumber: null,
  focalLength: null,
  orientation: null,
  raw: {},
};

/**
 * Camera clocks have no time zone. exifr returns a Date built from the
 * camera's wall-clock fields in this process's zone; reading the same fields
 * back gives the wall clock exactly, which is what "taken at 7:30 pm" means.
 */
function wallClock(d: unknown): string | null {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  if (year < 1990 || year > 2100) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${year}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const str = (v: unknown) =>
  typeof v === "string" && v.trim().length > 0 ? v.trim().slice(0, 120) : null;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function readExif(bytes: Uint8Array): Promise<ExifSummary> {
  let tags: Record<string, unknown> | undefined;
  try {
    tags = (await exifr.parse(Buffer.from(bytes), {
      tiff: true,
      exif: true,
      gps: false,
      iptc: false,
      xmp: false,
      icc: false,
      reviveValues: true,
      translateValues: false,
    })) as Record<string, unknown> | undefined;
  } catch {
    return EMPTY_EXIF;
  }
  if (tags === undefined || tags === null) return EMPTY_EXIF;
  const capturedAt =
    wallClock(tags["DateTimeOriginal"]) ??
    wallClock(tags["CreateDate"]) ??
    wallClock(tags["DateTime"]);
  const summary = {
    capturedAt,
    cameraMake: str(tags["Make"]),
    cameraModel: str(tags["Model"]),
    lens: str(tags["LensModel"]),
    iso: num(tags["ISO"]),
    exposureTime: num(tags["ExposureTime"]),
    fNumber: num(tags["FNumber"]),
    focalLength: num(tags["FocalLength"]),
    orientation: num(tags["Orientation"]),
  };
  const raw: Record<string, string | number> = {};
  for (const key of [
    "Make",
    "Model",
    "LensModel",
    "ISO",
    "ExposureTime",
    "FNumber",
    "FocalLength",
    "Orientation",
    "Software",
  ]) {
    const v = tags[key];
    if (typeof v === "string" || (typeof v === "number" && Number.isFinite(v)))
      raw[key] = v;
  }
  if (capturedAt !== null) raw["DateTimeOriginal"] = capturedAt;
  return { ...summary, raw };
}

export interface Variants {
  readonly thumbnail: Buffer;
  readonly preview: Buffer;
  /** Dimensions of the photo as displayed (after EXIF rotation). */
  readonly width: number;
  readonly height: number;
}

/** Decode (HEIC via libheif-wasm), rotate per EXIF, and render both derivatives. */
export async function renderVariants(
  bytes: Uint8Array,
  kind: PhotoKind,
): Promise<Variants> {
  let decodable: Buffer = Buffer.from(bytes);
  if (kind === "heic") {
    decodable = Buffer.from(
      await convertHeic({ buffer: decodable, format: "JPEG", quality: 0.92 }),
    );
  }
  const base = sharp(decodable, {
    failOn: "error",
    limitInputPixels: 300_000_000,
  }).rotate();
  const meta = await base.clone().metadata();
  const preview = await base
    .clone()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  const thumbnail = await base
    .clone()
    .resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 72 })
    .toBuffer();
  const rotated = (meta.orientation ?? 1) >= 5;
  const width = rotated ? meta.height : meta.width;
  const height = rotated ? meta.width : meta.height;
  return {
    thumbnail,
    preview: preview.data,
    width: width ?? preview.info.width,
    height: height ?? preview.info.height,
  };
}
