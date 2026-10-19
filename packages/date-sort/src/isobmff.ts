/**
 * ISO base media file boxes (the container behind MP4, HEIC and Canon CR3),
 * walked by their headers only. Reads through a ByteSource, which can only
 * read.
 */

export interface ByteSource {
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

/** No real photo has more boxes than this at one level; a corrupt one might. */
const MAX_BOXES = 256;

export interface Box {
  readonly type: string;
  /** Where the box's payload starts (after its header). */
  readonly body: number;
  /** Where the box ends. */
  readonly end: number;
  /** For a "uuid" box, its 16-byte id as hex. */
  readonly uuid: string | null;
}

export async function boxesIn(
  src: ByteSource,
  from: number,
  to: number,
): Promise<Box[]> {
  const out: Box[] = [];
  let at = from;
  while (at + 8 <= to && out.length < MAX_BOXES) {
    const head = await src.read(at, 32);
    if (head.length < 8) break;
    const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
    let size = view.getUint32(0);
    const type = String.fromCharCode(...head.subarray(4, 8));
    let header = 8;
    if (size === 1) {
      if (head.length < 16) break;
      size = Number(view.getBigUint64(8));
      header = 16;
    } else if (size === 0) {
      size = to - at; // "to the end"
    }
    if (size < header || at + size > to) break; // corrupt or truncated
    let uuid: string | null = null;
    if (type === "uuid") {
      if (head.length < header + 16) break;
      uuid = [...head.subarray(header, header + 16)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      header += 16;
    }
    out.push({ type, body: at + header, end: at + size, uuid });
    at += size;
  }
  return out;
}

/** A ByteSource over bytes already in memory (tests, small files). */
export function bytesSource(bytes: Uint8Array): ByteSource {
  return {
    size: bytes.length,
    read: (offset, length) =>
      Promise.resolve(bytes.subarray(offset, Math.min(bytes.length, offset + length))),
  };
}
