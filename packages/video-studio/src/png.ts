/**
 * A minimal PNG reader — Node only.
 *
 * The browser decodes images for us; this exists so the panel detector can be
 * tested against real artwork in a plain Node test run, without a headless
 * browser or an image library.
 *
 * Deliberately narrow: 8-bit, non-interlaced, colour types 0/2/3/4/6. Anything
 * else throws with a message that says what it found, rather than returning
 * quietly wrong pixels.
 */
import { inflateSync } from "node:zlib";

import type { RasterImage } from "./types";

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

interface Header {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlace: number;
}

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Decode a PNG buffer to RGBA. Throws on anything it cannot decode faithfully. */
export function decodePng(buffer: Uint8Array): RasterImage {
  for (let i = 0; i < SIGNATURE.length; i += 1) {
    if (buffer[i] !== SIGNATURE[i]) throw new Error("Not a PNG file.");
  }
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  let header: Header | null = null;
  let palette: Uint8Array | null = null;
  let transparency: Uint8Array | null = null;
  const idat: Uint8Array[] = [];

  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      buffer[offset + 4] ?? 0,
      buffer[offset + 5] ?? 0,
      buffer[offset + 6] ?? 0,
      buffer[offset + 7] ?? 0,
    );
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      header = {
        width: view.getUint32(offset + 8),
        height: view.getUint32(offset + 12),
        bitDepth: buffer[offset + 16] ?? 0,
        colorType: buffer[offset + 17] ?? 0,
        interlace: buffer[offset + 20] ?? 0,
      };
    } else if (type === "PLTE") palette = body;
    else if (type === "tRNS") transparency = body;
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    offset += 12 + length;
  }

  if (!header) throw new Error("PNG has no IHDR chunk.");
  if (header.bitDepth !== 8) {
    throw new Error(
      `Only 8-bit PNGs are supported; this one is ${header.bitDepth}-bit.`,
    );
  }
  if (header.interlace !== 0) throw new Error("Interlaced PNGs are not supported.");
  const channels = CHANNELS[header.colorType];
  if (channels === undefined) {
    throw new Error(`Unsupported PNG colour type ${header.colorType}.`);
  }
  if (header.colorType === 3 && !palette)
    throw new Error("Indexed PNG has no palette.");

  const total = idat.reduce((n, c) => n + c.length, 0);
  const joined = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of idat) {
    joined.set(chunk, cursor);
    cursor += chunk.length;
  }
  const raw = new Uint8Array(inflateSync(joined));

  const { width, height } = header;
  const stride = width * channels;
  const lines = new Uint8Array(height * stride);
  let previous = new Uint8Array(stride);
  let position = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[position] ?? 0;
    position += 1;
    const line = raw.subarray(position, position + stride).slice();
    position += stride;

    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? (line[x - channels] ?? 0) : 0;
      const up = previous[x] ?? 0;
      const upLeft = x >= channels ? (previous[x - channels] ?? 0) : 0;
      const value = line[x] ?? 0;
      switch (filter) {
        case 1:
          line[x] = (value + left) & 0xff;
          break;
        case 2:
          line[x] = (value + up) & 0xff;
          break;
        case 3:
          line[x] = (value + ((left + up) >> 1)) & 0xff;
          break;
        case 4:
          line[x] = (value + paeth(left, up, upLeft)) & 0xff;
          break;
        default:
          break;
      }
    }
    lines.set(line, y * stride);
    previous = line;
  }

  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const src = i * channels;
    const dst = i * 4;
    switch (header.colorType) {
      case 0:
        rgba[dst] = rgba[dst + 1] = rgba[dst + 2] = lines[src] ?? 0;
        rgba[dst + 3] = 255;
        break;
      case 2:
        rgba[dst] = lines[src] ?? 0;
        rgba[dst + 1] = lines[src + 1] ?? 0;
        rgba[dst + 2] = lines[src + 2] ?? 0;
        rgba[dst + 3] = 255;
        break;
      case 3: {
        const index = lines[src] ?? 0;
        rgba[dst] = palette?.[index * 3] ?? 0;
        rgba[dst + 1] = palette?.[index * 3 + 1] ?? 0;
        rgba[dst + 2] = palette?.[index * 3 + 2] ?? 0;
        rgba[dst + 3] = transparency?.[index] ?? 255;
        break;
      }
      case 4:
        rgba[dst] = rgba[dst + 1] = rgba[dst + 2] = lines[src] ?? 0;
        rgba[dst + 3] = lines[src + 1] ?? 255;
        break;
      default:
        rgba[dst] = lines[src] ?? 0;
        rgba[dst + 1] = lines[src + 1] ?? 0;
        rgba[dst + 2] = lines[src + 2] ?? 0;
        rgba[dst + 3] = lines[src + 3] ?? 255;
        break;
    }
  }

  return { width, height, data: rgba };
}
