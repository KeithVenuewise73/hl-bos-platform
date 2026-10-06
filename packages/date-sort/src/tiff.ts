/**
 * The smallest TIFF reader that can answer one question: what do tags 0x9003
 * (DateTimeOriginal) and 0x9004 (CreateDate) say?
 *
 * Used for Canon CR3, whose metadata is a set of little TIFF blocks
 * (CMT1 = IFD0, CMT2 = the EXIF IFD) inside an ISO media container that the
 * general-purpose EXIF library cannot open. Reads from a byte array it is
 * given; it has no way to touch a file.
 *
 * Tag 0x0132 (DateTime, "ModifyDate") is never read: see capture-date.ts.
 */

export const TAG_DATE_TIME_ORIGINAL = 0x9003;
export const TAG_CREATE_DATE = 0x9004;
const TAG_EXIF_IFD_POINTER = 0x8769;
const TYPE_ASCII = 2;
const TYPE_LONG = 4;
/** No real TIFF block nests or chains this deep; a corrupt one might loop. */
const MAX_IFDS = 8;

export interface TiffDates {
  dateTimeOriginal?: string | undefined;
  createDate?: string | undefined;
}

/** Read the two capture-date tags from a TIFF block; {} when it has neither. */
export function readTiffDates(bytes: Uint8Array): TiffDates {
  const out: TiffDates = {};
  if (bytes.length < 8) return out;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let little: boolean;
  if (bytes[0] === 0x49 && bytes[1] === 0x49) little = true;
  else if (bytes[0] === 0x4d && bytes[1] === 0x4d) little = false;
  else return out;
  if (view.getUint16(2, little) !== 42) return out;

  const u16 = (o: number) => (o + 2 <= bytes.length ? view.getUint16(o, little) : -1);
  const u32 = (o: number) => (o + 4 <= bytes.length ? view.getUint32(o, little) : -1);

  const pending: number[] = [u32(4)];
  const seen = new Set<number>();
  while (pending.length > 0 && seen.size < MAX_IFDS) {
    const ifd = pending.shift()!;
    if (ifd < 8 || seen.has(ifd)) continue;
    seen.add(ifd);
    const count = u16(ifd);
    if (count < 0 || ifd + 2 + count * 12 > bytes.length) continue;
    for (let i = 0; i < count; i++) {
      const entry = ifd + 2 + i * 12;
      const tag = u16(entry);
      const type = u16(entry + 2);
      const n = u32(entry + 4);
      if (tag === TAG_EXIF_IFD_POINTER && type === TYPE_LONG) {
        pending.push(u32(entry + 8));
        continue;
      }
      if (tag !== TAG_DATE_TIME_ORIGINAL && tag !== TAG_CREATE_DATE) continue;
      if (type !== TYPE_ASCII || n < 1 || n > 64) continue;
      // An ASCII value longer than four bytes lives at the offset given.
      const at = n <= 4 ? entry + 8 : u32(entry + 8);
      if (at < 0 || at + n > bytes.length) continue;
      const text = asciiz(bytes.subarray(at, at + n));
      if (tag === TAG_DATE_TIME_ORIGINAL) out.dateTimeOriginal ??= text;
      else out.createDate ??= text;
    }
    const next = u32(ifd + 2 + count * 12);
    if (next > 0) pending.push(next);
  }
  return out;
}

function asciiz(bytes: Uint8Array): string {
  let end = bytes.indexOf(0);
  if (end === -1) end = bytes.length;
  return String.fromCharCode(...bytes.subarray(0, end));
}
