/**
 * When a video was filmed (MOV and MP4), read without decoding (or changing)
 * anything. Box headers are walked through a ByteSource, which can only read;
 * the video itself (mdat, often gigabytes) is skipped by its size, never read.
 *
 * Best first:
 *   1. Apple's "com.apple.quicktime.creationdate" (moov/meta keys + ilst):
 *      written by every iPhone, as the local time the phone showed plus its
 *      zone, e.g. "2026-10-24T18:03:22-0400". The wall clock part is kept,
 *      exactly as photos keep the camera's clock, so a game filmed at
 *      11:30 pm stays on the day it was filmed.
 *   2. The movie header's creation time (moov/mvhd): seconds since 1904,
 *      in UTC by the standard, shown in this computer's time zone (as Windows
 *      shows it).
 *   3. Neither: the caller estimates from the file's modified time, labelled.
 */

import { boxesIn, type ByteSource } from "./isobmff";

export interface VideoDates {
  /** From Apple's creation date: the phone's own wall clock. */
  readonly appleCreationDate?: string;
  /** From the movie header, converted to this computer's wall clock. */
  readonly movieHeader?: string;
}

/** A real metadata box is a few KB; refuse to read anything absurd. */
const MAX_META_BYTES = 1024 * 1024;
const APPLE_CREATION = "com.apple.quicktime.creationdate";
/** Seconds between 1904-01-01 (QuickTime's epoch) and 1970-01-01. */
const EPOCH_1904 = 2_082_844_800;

export async function readVideoDates(src: ByteSource): Promise<VideoDates> {
  const top = await boxesIn(src, 0, src.size);
  const moov = top.find((b) => b.type === "moov");
  if (moov === undefined) return {};
  const inMoov = await boxesIn(src, moov.body, moov.end);
  const out: { appleCreationDate?: string; movieHeader?: string } = {};

  const meta = inMoov.find((b) => b.type === "meta");
  if (meta !== undefined && meta.end - meta.body <= MAX_META_BYTES) {
    const apple = appleCreationDate(await src.read(meta.body, meta.end - meta.body));
    if (apple !== null) out.appleCreationDate = apple;
  }
  // Some writers put the metadata under moov/udta/meta instead.
  if (out.appleCreationDate === undefined) {
    const udta = inMoov.find((b) => b.type === "udta");
    if (udta !== undefined && udta.end - udta.body <= MAX_META_BYTES) {
      const bytes = await src.read(udta.body, udta.end - udta.body);
      const inner = await boxesIn(bytesOf(bytes), 0, bytes.length);
      const m = inner.find((b) => b.type === "meta");
      if (m !== undefined) {
        const apple = appleCreationDate(bytes.subarray(m.body, m.end));
        if (apple !== null) out.appleCreationDate = apple;
      }
    }
  }

  const mvhd = inMoov.find((b) => b.type === "mvhd");
  if (mvhd !== undefined) {
    const head = await src.read(mvhd.body, 12);
    const when = movieHeaderTime(head);
    if (when !== null) out.movieHeader = when;
  }
  return out;
}

function bytesOf(bytes: Uint8Array): ByteSource {
  return {
    size: bytes.length,
    read: (o, l) => Promise.resolve(bytes.subarray(o, Math.min(bytes.length, o + l))),
  };
}

/**
 * QuickTime metadata (a "meta" box's payload): an hdlr "mdta", a "keys" box
 * naming each item, and an "ilst" box holding them by index. Null when there
 * is no Apple creation date, or it is not a date.
 */
export function appleCreationDate(meta: Uint8Array): string | null {
  const view = new DataView(meta.buffer, meta.byteOffset, meta.byteLength);
  // The QuickTime "meta" has no version/flags; the ISO one has 4 bytes of it.
  const startsWithBox = (at: number) =>
    at + 8 <= meta.length &&
    /^[a-z]{4}$/.test(String.fromCharCode(...meta.subarray(at + 4, at + 8)));
  const first = startsWithBox(0) ? 0 : 4;
  const boxes = new Map<string, { body: number; end: number }>();
  for (let at = first; at + 8 <= meta.length;) {
    const size = view.getUint32(at);
    if (size < 8 || at + size > meta.length) break;
    boxes.set(String.fromCharCode(...meta.subarray(at + 4, at + 8)), {
      body: at + 8,
      end: at + size,
    });
    at += size;
  }
  const keys = boxes.get("keys");
  const ilst = boxes.get("ilst");
  if (keys === undefined || ilst === undefined) return null;

  // keys: version/flags (4), count (4), then [size(4) namespace(4) name].
  let index = -1;
  const count = view.getUint32(keys.body + 4);
  for (let i = 1, at = keys.body + 8; i <= count && at + 8 <= keys.end; i++) {
    const size = view.getUint32(at);
    if (size < 8 || at + size > keys.end) return null;
    const name = new TextDecoder().decode(meta.subarray(at + 8, at + size));
    if (name === APPLE_CREATION) index = i;
    at += size;
  }
  if (index < 0) return null;

  // ilst: one box per item, its type is the 1-based key index; inside, a
  // "data" box: type (4), locale (4), then the value (UTF-8 for a date).
  for (let at = ilst.body; at + 8 <= ilst.end;) {
    const size = view.getUint32(at);
    if (size < 8 || at + size > ilst.end) return null;
    if (view.getUint32(at + 4) === index) {
      const data = at + 8;
      if (
        data + 16 <= at + size &&
        String.fromCharCode(...meta.subarray(data + 4, data + 8)) === "data"
      ) {
        const dsize = view.getUint32(data);
        const text = new TextDecoder().decode(meta.subarray(data + 16, data + dsize));
        return wallClock(text);
      }
      return null;
    }
    at += size;
  }
  return null;
}

/** "2026-10-24T18:03:22-0400" -> "2026-10-24T18:03:22" (the phone's clock). */
export function wallClock(text: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(text.trim());
  if (m === null) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (
    y < 1990 ||
    y > 2100 ||
    mo < 1 ||
    mo > 12 ||
    d < 1 ||
    d > 31 ||
    h > 23 ||
    mi > 59 ||
    s > 59
  ) {
    return null;
  }
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
}

/** mvhd: version (1), flags (3), creation time (4 bytes, or 8 in version 1). */
export function movieHeaderTime(head: Uint8Array): string | null {
  if (head.length < 8) return null;
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const seconds =
    head[0] === 1
      ? head.length >= 12
        ? Number(view.getBigUint64(4))
        : 0
      : view.getUint32(4);
  if (seconds === 0) return null; // "not set", which many tools write
  const when = new Date((seconds - EPOCH_1904) * 1000);
  const y = when.getFullYear();
  if (y < 1990 || y > 2100) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${y}-${p(when.getMonth() + 1)}-${p(when.getDate())}T${p(when.getHours())}:${p(when.getMinutes())}:${p(when.getSeconds())}`;
}
