/**
 * Upload rules.
 *
 * The file type is decided by the file's own first bytes, never by its name
 * or by the Content-Type the browser sent: both are whatever the sender says.
 * A file whose bytes are not one of the formats below is refused, and the
 * type we serve it back with is the one we detected.
 *
 * Pure — no filesystem — so it is unit-tested directly.
 */

import type { MediaKind } from "@hl-bos/hype-video";

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 150 * 1024 * 1024;
export const MAX_MEDIA_PER_PROJECT = 10;

export interface Sniffed {
  readonly kind: MediaKind;
  readonly mimeType: string;
  readonly extension: string;
}

const ascii = (bytes: Uint8Array, from: number, to: number): string =>
  String.fromCharCode(...bytes.subarray(from, to));

export function sniffMedia(bytes: Uint8Array): Sniffed | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { kind: "image", mimeType: "image/jpeg", extension: "jpg" };
  }
  if (ascii(bytes, 0, 8) === "\x89PNG\r\n\x1a\n") {
    return { kind: "image", mimeType: "image/png", extension: "png" };
  }
  if (ascii(bytes, 0, 4) === "GIF8") {
    return { kind: "image", mimeType: "image/gif", extension: "gif" };
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    return { kind: "image", mimeType: "image/webp", extension: "webp" };
  }
  if (ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12);
    // HEIC photos are ftyp too. They are not playable as video, and most
    // browsers cannot display them, so they are refused with a clear reason
    // rather than stored as something nobody can see.
    if (/^(heic|heix|hevc|mif1|msf1|avif)$/.test(brand)) return null;
    return brand === "qt  "
      ? { kind: "video", mimeType: "video/quicktime", extension: "mov" }
      : { kind: "video", mimeType: "video/mp4", extension: "mp4" };
  }
  if (
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return { kind: "video", mimeType: "video/webm", extension: "webm" };
  }
  return null;
}

export type UploadVerdict =
  | { readonly ok: true; readonly sniffed: Sniffed }
  | { readonly ok: false; readonly reason: string };

export function checkUpload(bytes: Uint8Array, existingCount: number): UploadVerdict {
  if (existingCount >= MAX_MEDIA_PER_PROJECT) {
    return {
      ok: false,
      reason: `A project can hold ${MAX_MEDIA_PER_PROJECT} photos or clips. Remove one first.`,
    };
  }
  if (bytes.length === 0) return { ok: false, reason: "That file is empty." };
  const sniffed = sniffMedia(bytes);
  if (sniffed === null) {
    return {
      ok: false,
      reason:
        "That file isn't a supported photo or video. Use JPG, PNG, WebP or GIF photos, or MP4, MOV or WebM video. (iPhone HEIC photos: share or export them as JPG first.)",
    };
  }
  const max = sniffed.kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (bytes.length > max) {
    return {
      ok: false,
      reason: `That ${sniffed.kind} is ${(bytes.length / 1024 / 1024).toFixed(0)} MB. The limit is ${max / 1024 / 1024} MB.`,
    };
  }
  return { ok: true, sniffed };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Ids become path segments, so anything that is not a plain UUID is refused. */
export function isId(value: string): boolean {
  return UUID.test(value);
}

/** A display name for an upload. Never used as a path. */
export function safeOriginalName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[^\w.\- ()]/g, "")
    .trim()
    .slice(0, 80);
  return cleaned.length > 0 ? cleaned : "upload";
}
