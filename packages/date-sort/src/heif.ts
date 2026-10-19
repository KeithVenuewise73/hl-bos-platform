/**
 * HEIC / HEIF capture dates, read without decoding (or changing) anything.
 *
 * A HEIC keeps its EXIF as an "item" of type "Exif". Finding it takes three
 * small boxes inside `meta`:
 *
 *   iinf  the item list: which item id is the "Exif" one
 *   iloc  where each item's bytes are (in the file, or in `idat`)
 *   idat  (optional) item bytes stored inside `meta` itself
 *
 * The Exif item is a 4-byte offset followed by an ordinary TIFF block, read
 * by tiff.ts. Image data is never read.
 */

import { boxesIn, type Box, type ByteSource } from "./isobmff";
import { readTiffDates, type TiffDates } from "./tiff";

/** A real Exif item is tens of KB; refuse to read anything absurd. */
const MAX_EXIF_BYTES = 4 * 1024 * 1024;
/** Bigger than any real iinf/iloc box. */
const MAX_INDEX_BYTES = 1024 * 1024;

class Reader {
  at = 0;
  constructor(private readonly b: Uint8Array) {}
  private get view() {
    return new DataView(this.b.buffer, this.b.byteOffset, this.b.byteLength);
  }
  ok(n: number) {
    return this.at + n <= this.b.length;
  }
  uint(size: number): number {
    if (!this.ok(size)) throw new RangeError("truncated");
    const v = this.view;
    let out: number;
    if (size === 0) out = 0;
    else if (size === 1) out = v.getUint8(this.at);
    else if (size === 2) out = v.getUint16(this.at);
    else if (size === 3) out = (v.getUint16(this.at) << 8) | v.getUint8(this.at + 2);
    else if (size === 4) out = v.getUint32(this.at);
    else if (size === 8) out = Number(v.getBigUint64(this.at));
    else throw new RangeError(`field size ${size}`);
    this.at += size;
    return out;
  }
  fourcc(): string {
    if (!this.ok(4)) throw new RangeError("truncated");
    const s = String.fromCharCode(...this.b.subarray(this.at, this.at + 4));
    this.at += 4;
    return s;
  }
}

async function bodyOf(src: ByteSource, box: Box): Promise<Uint8Array | null> {
  if (box.end - box.body > MAX_INDEX_BYTES) return null;
  return src.read(box.body, box.end - box.body);
}

/** The item id of the "Exif" item, from an iinf box body. */
function exifItemId(iinf: Uint8Array): number | null {
  const r = new Reader(iinf);
  const version = r.uint(1);
  r.uint(3); // flags
  const count = r.uint(version === 0 ? 2 : 4);
  for (let i = 0; i < count && r.ok(8); i++) {
    const start = r.at;
    const size = r.uint(4);
    const type = r.fourcc();
    if (size < 8) return null;
    if (type === "infe") {
      const v = r.uint(1);
      r.uint(3);
      if (v >= 2) {
        const id = r.uint(v === 2 ? 2 : 4);
        r.uint(2); // protection index
        if (r.fourcc() === "Exif") return id;
      }
    }
    r.at = start + size;
  }
  return null;
}

interface Extent {
  readonly offset: number;
  readonly length: number;
}

/** Where item `id`'s bytes are, from an iloc box body. */
function locate(
  iloc: Uint8Array,
  id: number,
): { method: number; extents: Extent[] } | null {
  const r = new Reader(iloc);
  const version = r.uint(1);
  r.uint(3);
  const sizes = r.uint(2);
  const offsetSize = (sizes >> 12) & 0xf;
  const lengthSize = (sizes >> 8) & 0xf;
  const baseSize = (sizes >> 4) & 0xf;
  const indexSize = version === 1 || version === 2 ? sizes & 0xf : 0;
  const count = r.uint(version < 2 ? 2 : 4);
  for (let i = 0; i < count; i++) {
    const itemId = r.uint(version < 2 ? 2 : 4);
    const method = version === 1 || version === 2 ? r.uint(2) & 0xf : 0;
    r.uint(2); // data reference index
    const base = r.uint(baseSize);
    const extentCount = r.uint(2);
    const extents: Extent[] = [];
    for (let e = 0; e < extentCount; e++) {
      r.uint(indexSize);
      const offset = r.uint(offsetSize);
      const length = r.uint(lengthSize);
      extents.push({ offset: base + offset, length });
    }
    if (itemId === id) return { method, extents };
  }
  return null;
}

/** The dates in a HEIC's EXIF item; {} when there are none to be found. */
export async function readHeifDates(src: ByteSource): Promise<TiffDates> {
  const meta = (await boxesIn(src, 0, src.size)).find((b) => b.type === "meta");
  if (meta === undefined) return {};
  // meta is a "full box": 4 bytes of version and flags before its children.
  const inner = await boxesIn(src, meta.body + 4, meta.end);
  const iinfBox = inner.find((b) => b.type === "iinf");
  const ilocBox = inner.find((b) => b.type === "iloc");
  if (iinfBox === undefined || ilocBox === undefined) return {};
  const iinf = await bodyOf(src, iinfBox);
  const iloc = await bodyOf(src, ilocBox);
  if (iinf === null || iloc === null) return {};

  const id = exifItemId(iinf);
  if (id === null) return {};
  const where = locate(iloc, id);
  if (where === null || where.extents.length === 0) return {};

  // construction_method 0: offsets into the file; 1: offsets into idat.
  let origin = 0;
  if (where.method === 1) {
    const idat = inner.find((b) => b.type === "idat");
    if (idat === undefined) return {};
    origin = idat.body;
  } else if (where.method !== 0) {
    return {};
  }
  const total = where.extents.reduce((n, e) => n + e.length, 0);
  if (total < 4 || total > MAX_EXIF_BYTES) return {};
  const item = new Uint8Array(total);
  let filled = 0;
  for (const e of where.extents) {
    const part = await src.read(origin + e.offset, e.length);
    item.set(part, filled);
    filled += part.length;
  }
  // The item starts with the offset from here to the TIFF header.
  const skip = new DataView(item.buffer).getUint32(0);
  if (4 + skip >= filled) return {};
  return readTiffDates(item.subarray(4 + skip, filled));
}
