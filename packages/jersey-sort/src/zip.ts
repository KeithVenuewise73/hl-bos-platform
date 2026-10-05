/**
 * A minimal, streaming ZIP writer for "download selected photos".
 *
 * STORE only (no compression): photos are already JPEG/PNG/HEIC-compressed,
 * deflating them again costs CPU and saves nothing. One file is held in
 * memory at a time, so a 500-photo download never holds 500 photos.
 *
 * Classic ZIP (not ZIP64), so one archive is limited to 4 GB and 65,535
 * files. The writer refuses to cross either limit rather than emit a corrupt
 * archive; the app turns that refusal into "select fewer photos".
 */

export interface ZipEntry {
  readonly name: string;
  readonly data: Uint8Array;
  readonly modified: Date;
}

export class ZipLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipLimitError";
  }
}

const LIMIT = 0xffffffff;
const MAX_ENTRIES = 0xffff;

let table: Uint32Array | undefined;
function crcTable(): Uint32Array {
  if (table !== undefined) return table;
  table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}

export function crc32(data: Uint8Array): number {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = (t[(c ^ (data[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** Make names unique within one archive: a.jpg, a (2).jpg, … */
export function uniqueName(name: string, used: Set<string>): string {
  const clean = name.replace(/[\\/:*?"<>|]+/g, "_").replace(/^\.+/, "") || "photo";
  if (!used.has(clean.toLowerCase())) {
    used.add(clean.toLowerCase());
    return clean;
  }
  const dot = clean.lastIndexOf(".");
  const stem = dot > 0 ? clean.slice(0, dot) : clean;
  const ext = dot > 0 ? clean.slice(dot) : "";
  for (let i = 2; ; i++) {
    const candidate = `${stem} (${i})${ext}`;
    if (!used.has(candidate.toLowerCase())) {
      used.add(candidate.toLowerCase());
      return candidate;
    }
  }
}

export async function* zipStore(
  entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>,
): AsyncGenerator<Uint8Array> {
  const encoder = new TextEncoder();
  const central: Uint8Array[] = [];
  let offset = 0;
  let count = 0;

  for await (const entry of entries) {
    count += 1;
    if (count > MAX_ENTRIES)
      throw new ZipLimitError("Too many files for one download.");
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;
    const { time, date } = dosTime(entry.modified);
    if (offset + 30 + name.length + size > LIMIT) {
      throw new ZipLimitError(
        "The selected photos are larger than one download can hold (4 GB).",
      );
    }

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 0, true); // STORE
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);

    const header = new Uint8Array(46 + name.length);
    const cv = new DataView(header.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    header.set(name, 46);
    central.push(header);

    yield local;
    yield entry.data;
    offset += local.length + size;
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0);
  if (offset + centralSize + 22 > LIMIT) {
    throw new ZipLimitError(
      "The selected photos are larger than one download can hold (4 GB).",
    );
  }
  for (const c of central) yield c;

  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, count, true);
  ev.setUint16(10, count, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  yield end;
}
