/**
 * Accepting a photograph.
 *
 * Pure: takes bytes, returns a verdict. No disk, no `server-only`, so every
 * rejection path is testable by constructing a few bytes rather than by finding
 * a corrupt HEIC somewhere.
 *
 * THE FILE EXTENSION IS NOT CONSULTED. A name ending in .jpg proves nothing —
 * it is the one part of an upload entirely under the uploader's control. The
 * format is read from the bytes themselves, and the extension the file is
 * stored under is derived from what was actually found. That also means a
 * renamed executable cannot be stored as an image, which is the failure the
 * platform's own upload guard (supabase/functions/_shared/storage/paths.ts)
 * exists to prevent; the rule is reused here, the mechanism is stricter.
 */

export type ImageFormat = "jpeg" | "png" | "webp" | "heic";

export interface AcceptedPhoto {
  readonly ok: true;
  readonly format: ImageFormat;
  readonly extension: string;
  readonly bytes: number;
  /** Pixel size where the format lets us read it cheaply; null otherwise. */
  readonly width: number | null;
  readonly height: number | null;
}

export interface RejectedPhoto {
  readonly ok: false;
  readonly code:
    "empty" | "too_large" | "unsupported_format" | "too_small_in_pixels" | "truncated";
  /** Plain English, safe to show. Says what to do, not what went wrong inside. */
  readonly message: string;
}

export type PhotoVerdict = AcceptedPhoto | RejectedPhoto;

/** 25 MiB. A phone photo is 2-8MB; anything past this is not a snapshot. */
export const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Smallest usable edge, in pixels.
 *
 * Below this there is not enough face to preserve, and preserving a face across
 * scenes is the entire product. Rejecting early is kinder than generating six
 * scenes of a stranger.
 */
export const MIN_EDGE = 320;

const EXTENSION: Readonly<Record<ImageFormat, string>> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
  heic: "heic",
};

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((b, i) => bytes[i] === b);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let i = offset; i < offset + length && i < bytes.length; i += 1) {
    out += String.fromCharCode(bytes[i] ?? 0);
  }
  return out;
}

export function detectFormat(bytes: Uint8Array): ImageFormat | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "webp";
  // HEIC and friends: an ISO-BMFF box whose type is "ftyp" and whose brand is
  // one of the HEIF family. The brand matters — an .mp4 is also ftyp.
  if (ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4);
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand)) return "heic";
  }
  return null;
}

/** PNG width/height live at a fixed offset in the IHDR chunk. */
function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * JPEG dimensions, by walking the segment markers to a start-of-frame.
 *
 * There is no fixed offset: a JPEG carries any number of variable-length
 * segments (EXIF, colour profiles, thumbnails) before the frame header, and a
 * phone photo carries several.
 */
function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  let i = 2; // skip SOI
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = bytes[i + 1] ?? 0;
    // SOF0..SOF15, excluding the non-frame markers DHT (c4), JPG (c8), DAC (cc).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return { height: view.getUint16(i + 5), width: view.getUint16(i + 7) };
    }
    const length = (bytes[i + 2] ?? 0) * 256 + (bytes[i + 3] ?? 0);
    if (length < 2) return null;
    i += 2 + length;
  }
  return null;
}

function reject(code: RejectedPhoto["code"], message: string): RejectedPhoto {
  return { ok: false, code, message };
}

/** Decide whether a photograph can be used. */
export function acceptPhoto(bytes: Uint8Array): PhotoVerdict {
  if (bytes.length === 0) return reject("empty", "That file is empty.");
  if (bytes.length > MAX_BYTES) {
    return reject(
      "too_large",
      `That photo is larger than ${Math.round(MAX_BYTES / (1024 * 1024))}MB. Try one straight from a phone or camera.`,
    );
  }

  const format = detectFormat(bytes);
  if (format === null) {
    return reject(
      "unsupported_format",
      "That does not look like a photo SceneFlow can read. Use a JPG, PNG, WEBP or HEIC.",
    );
  }

  const size =
    format === "png" ? pngSize(bytes) : format === "jpeg" ? jpegSize(bytes) : null;

  if (size !== null && (size.width === 0 || size.height === 0)) {
    return reject("truncated", "That photo looks damaged and could not be read.");
  }

  if (size !== null && Math.min(size.width, size.height) < MIN_EDGE) {
    return reject(
      "too_small_in_pixels",
      `That photo is ${size.width}×${size.height}, too small to keep faces recognisable. Use one at least ${MIN_EDGE} pixels on its shortest side.`,
    );
  }

  return {
    ok: true,
    format,
    extension: EXTENSION[format],
    bytes: bytes.length,
    width: size?.width ?? null,
    height: size?.height ?? null,
  };
}

const ID = /^[0-9a-f]{32}$/;

/**
 * Where an accepted photo is stored, relative to the console's own folder.
 *
 * The id is validated rather than trusted. This is the string that becomes a
 * filesystem path, so "../../etc/passwd" must not survive it — and the id is
 * generated by us, which means anything failing this check arrived from
 * somewhere it should not have.
 */
export function photoPath(id: string, extension: string): string {
  if (!ID.test(id)) throw new Error("invalid_photo_id");
  if (!/^[a-z0-9]{2,5}$/.test(extension)) throw new Error("invalid_photo_extension");
  return `.sceneflow/uploads/${id}.${extension}`;
}
