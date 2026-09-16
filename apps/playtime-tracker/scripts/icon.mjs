/**
 * The mark, and a PNG encoder to put it on disk.
 *
 * One description of the shape, shared by the web icons, the native launcher
 * icons and the splash screens, so the app cannot end up looking like three
 * different products. No image dependency, and nothing checked in that cannot
 * be regenerated.
 *
 * The shape is a stopwatch: the one object that says "we are timing this"
 * without a word, in a 48-pixel tile on a home screen.
 */
import { deflateSync } from "node:zlib";

export const NAVY = [0x14, 0x2d, 0x4f];
export const WHITE = [0xff, 0xff, 0xff];
export const GREEN = [0x2f, 0xc4, 0x6f];

// --- PNG --------------------------------------------------------------------

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

/** Encode an RGBA buffer as a PNG. */
export function png(width, height, rgba) {
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

// --- The mark ---------------------------------------------------------------

/**
 * Rasterise the mark into an RGBA buffer.
 *
 * `maskable`  extra padding, so a circular or squircle mask cannot crop the
 *             shape. Required for Android adaptive icons and sensible for the
 *             1024 store icon.
 * `transparent`  draw only the stopwatch, with no tile behind it. This is what
 *             an Android adaptive-icon FOREGROUND layer needs -- the tile
 *             colour is supplied separately by the background layer, and
 *             painting it here too would defeat the format.
 *
 * Coverage is sampled 3x3 per pixel so the curves do not alias into a jagged
 * mess at the sizes that actually get shown.
 */
export function rasterise(size, { maskable = false, transparent = false } = {}) {
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

  const inTile = (x, y) => {
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
      let tile = 0;
      let ring = 0;
      let hand = 0;
      for (let sy = 0; sy < 3; sy++) {
        for (let sx = 0; sx < 3; sx++) {
          const px = x + (sx + 0.5) / 3;
          const py = y + (sy + 0.5) / 3;
          if (!transparent && !inTile(px, py)) continue;
          tile += 1;
          const d = Math.hypot(px - cx, py - cy);
          const inStem =
            Math.abs(px - cx) <= stemW / 2 &&
            py >= stemTop &&
            py <= stemTop + stemH * 1.6;
          if ((d <= ringOuter && d >= ringInner) || inStem) ring += 1;
          else if (onHand(px, py)) hand += 1;
        }
      }

      const i = (y * size + x) * 4;
      const ringA = ring / 9;
      const handA = hand / 9;

      if (transparent) {
        const markA = ringA + handA;
        if (markA === 0) continue;
        for (let c = 0; c < 3; c++) {
          buf[i + c] = Math.round((WHITE[c] * ringA + GREEN[c] * handA) / markA);
        }
        buf[i + 3] = Math.round(markA * 255);
        continue;
      }

      if (tile === 0) continue;
      for (let c = 0; c < 3; c++) {
        buf[i + c] = Math.round(
          NAVY[c] * (1 - ringA - handA) + WHITE[c] * ringA + GREEN[c] * handA,
        );
      }
      buf[i + 3] = Math.round((tile / 9) * 255);
    }
  }
  return buf;
}

/** The mark as an encoded PNG. */
export function draw(size, options) {
  return png(size, size, rasterise(size, options));
}

/**
 * A launch screen: the app's tile colour with the mark centred on it.
 *
 * The background matches what the app itself paints, so there is no white
 * flash before the first render and no jump between the splash and the app.
 */
export function splash(width, height) {
  const buf = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    buf[i * 4] = NAVY[0];
    buf[i * 4 + 1] = NAVY[1];
    buf[i * 4 + 2] = NAVY[2];
    buf[i * 4 + 3] = 255;
  }

  const mark = Math.round(Math.min(width, height) * 0.28);
  const rgba = rasterise(mark, { transparent: true });
  const ox = Math.round((width - mark) / 2);
  const oy = Math.round((height - mark) / 2);
  for (let y = 0; y < mark; y++) {
    for (let x = 0; x < mark; x++) {
      const s = (y * mark + x) * 4;
      const alpha = rgba[s + 3] / 255;
      if (alpha === 0) continue;
      const d = ((oy + y) * width + (ox + x)) * 4;
      for (let c = 0; c < 3; c++) {
        buf[d + c] = Math.round(rgba[s + c] * alpha + buf[d + c] * (1 - alpha));
      }
    }
  }
  return png(width, height, buf);
}
