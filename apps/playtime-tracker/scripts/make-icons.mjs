#!/usr/bin/env node
/**
 * Generate the app icons.
 *
 * Committed as a script rather than as binaries dropped in by hand, so the
 * icons can be regenerated, reviewed as code, and changed without anybody
 * needing a design tool. It writes real PNGs with a minimal encoder -- no
 * image dependency, and no placeholder art that would have to be replaced
 * before a store submission.
 *
 *   node scripts/make-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const NAVY = [0x14, 0x2d, 0x4f];
const WHITE = [0xff, 0xff, 0xff];
const GREEN = [0x2f, 0xc4, 0x6f];

/**
 * A stopwatch: the one object that says "we are timing this" without a word,
 * in a 48-pixel tile on a home screen.
 *
 * Coverage is sampled 3x3 per pixel so the curves do not alias into a jagged
 * mess at the sizes that actually get shown.
 */
function draw(size, { maskable }) {
  const buf = Buffer.alloc(size * size * 4);
  const pad = maskable ? size * 0.18 : size * 0.1;
  const cx = size / 2;
  const cy = size / 2 + size * 0.03;
  const r = (size - pad * 2) / 2;
  const ringOuter = r * 0.78;
  const ringInner = ringOuter - Math.max(2, size * 0.055);
  const corner = maskable ? size : size * 0.22;

  const hourAngle = -Math.PI / 4; // pointing to about 1 o'clock
  const handLen = ringInner * 0.82;
  const handWidth = Math.max(2, size * 0.05);
  const hx = Math.cos(hourAngle) * handLen;
  const hy = Math.sin(hourAngle) * handLen;

  const stemW = size * 0.12;
  const stemH = size * 0.07;
  const stemTop = cy - ringOuter - stemH * 0.85;

  const inRounded = (x, y) => {
    const dx = Math.max(0, Math.abs(x - size / 2) - (size / 2 - corner));
    const dy = Math.max(0, Math.abs(y - size / 2) - (size / 2 - corner));
    return dx * dx + dy * dy <= corner * corner;
  };

  const onHand = (x, y) => {
    // Distance from the point to the segment (centre -> hand tip).
    const px = x - cx;
    const py = y - cy;
    const t = Math.max(0, Math.min(1, (px * hx + py * hy) / (hx * hx + hy * hy)));
    const dx = px - hx * t;
    const dy = py - hy * t;
    return dx * dx + dy * dy <= (handWidth / 2) * (handWidth / 2);
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0;
      let ring = 0;
      let hand = 0;
      for (let sy = 0; sy < 3; sy++) {
        for (let sx = 0; sx < 3; sx++) {
          const px = x + (sx + 0.5) / 3;
          const py = y + (sy + 0.5) / 3;
          if (!inRounded(px, py)) continue;
          bg += 1;
          const d = Math.hypot(px - cx, py - cy);
          const inStem =
            Math.abs(px - cx) <= stemW / 2 && py >= stemTop && py <= stemTop + stemH * 1.6;
          if ((d <= ringOuter && d >= ringInner) || inStem) ring += 1;
          else if (onHand(px, py)) hand += 1;
        }
      }
      if (bg === 0) continue;
      const i = (y * size + x) * 4;
      const a = bg / 9;
      const ringA = ring / 9;
      const handA = hand / 9;
      const mix = (c) =>
        NAVY[c] * (1 - ringA - handA) + WHITE[c] * ringA + GREEN[c] * handA;
      buf[i] = Math.round(mix(0));
      buf[i + 1] = Math.round(mix(1));
      buf[i + 2] = Math.round(mix(2));
      buf[i + 3] = Math.round(a * 255);
    }
  }
  return png(size, size, buf);
}

mkdirSync(OUT, { recursive: true });
const written = [];
for (const size of [180, 192, 512]) {
  const file = path.join(OUT, `icon-${size}.png`);
  writeFileSync(file, draw(size, { maskable: false }));
  written.push(path.basename(file));
}
for (const size of [192, 512]) {
  const file = path.join(OUT, `icon-maskable-${size}.png`);
  writeFileSync(file, draw(size, { maskable: true }));
  written.push(path.basename(file));
}
// 1024 with no transparency and no rounding is what App Store Connect wants.
writeFileSync(path.join(OUT, "icon-store-1024.png"), draw(1024, { maskable: true }));
written.push("icon-store-1024.png");
console.log(`wrote ${written.length} icons: ${written.join(", ")}`);
