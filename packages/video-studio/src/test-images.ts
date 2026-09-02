/**
 * Deterministic synthetic images for tests.
 *
 * A real comic page is 3 MB. Committing one to prove a gutter detector works
 * would put a binary in every future clone forever. These build the same
 * structure — noisy panels separated by uniform gutters — in a few hundred
 * bytes of code, and a seeded generator keeps every run identical.
 *
 * `scripts/local-test/verify-video-studio.mjs` runs the same detector against a
 * real image file when a human wants to see it work on real artwork.
 */
import type { RasterImage } from "./types";

/** Mulberry32 — small, fast, and identical on every machine. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GridSpec {
  readonly columns: number;
  readonly rows: number;
  readonly panelWidth: number;
  readonly panelHeight: number;
  /** Uniform band between panels, and around the outside. */
  readonly gutter: number;
  readonly seed: number;
}

/** A panel grid: noisy panels, uniform white gutters, uniform outer margin. */
export function makeGridImage(spec: GridSpec): RasterImage {
  const width = spec.columns * spec.panelWidth + (spec.columns + 1) * spec.gutter;
  const height = spec.rows * spec.panelHeight + (spec.rows + 1) * spec.gutter;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const random = seededRandom(spec.seed);

  for (let row = 0; row < spec.rows; row += 1) {
    for (let column = 0; column < spec.columns; column += 1) {
      const originX = spec.gutter + column * (spec.panelWidth + spec.gutter);
      const originY = spec.gutter + row * (spec.panelHeight + spec.gutter);
      for (let y = 0; y < spec.panelHeight; y += 1) {
        for (let x = 0; x < spec.panelWidth; x += 1) {
          const offset = ((originY + y) * width + originX + x) * 4;
          // Full-range noise: no row or column of a panel is ever uniform.
          data[offset] = Math.floor(random() * 256);
          data[offset + 1] = Math.floor(random() * 256);
          data[offset + 2] = Math.floor(random() * 256);
          data[offset + 3] = 255;
        }
      }
    }
  }
  return { width, height, data };
}

/** Wall-to-wall noise: no gutters, so no grid exists to find. */
export function makeNoiseImage(width: number, height: number, seed = 7): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4);
  const random = seededRandom(seed);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = Math.floor(random() * 256);
    data[i * 4 + 1] = Math.floor(random() * 256);
    data[i * 4 + 2] = Math.floor(random() * 256);
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}
