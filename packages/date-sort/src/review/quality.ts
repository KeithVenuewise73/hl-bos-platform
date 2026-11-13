/**
 * Quality hints for a photo, worked out from its web-size preview.
 *
 * These are HINTS for a person who is reviewing, never decisions: a photo is
 * published only because someone approved it, and is withheld only because
 * someone rejected it. The cut-offs are deliberately forgiving, so that a flag
 * means "worth a look" and a photo is not flagged for being sports.
 *
 * Sharpness is judged by the SHARPEST part of the picture, not the whole
 * frame. A good sports photo is often a sharp player against a background that
 * is blurred on purpose; a whole-frame measure would call that soft. If even
 * the sharpest tile is blurry, the photo is.
 *
 * The cut-offs were set without real game photos to hand, so they are a first
 * guess and are all here, named, to be adjusted once real results are seen.
 *
 * Free of `server-only` so it can be tested.
 */

import sharp from "sharp";

/** The sharpest tile's detail is below this: possibly soft or motion-blurred. */
export const SOFT_BELOW = 45;
/** Average brightness (0-255) below this: very dark. */
export const DARK_BELOW = 35;
/** Average brightness above this: very bright, washed out. */
export const BRIGHT_ABOVE = 225;
/** The photo's long side, in pixels, below this: low resolution for the website. */
export const SMALL_BELOW = 1600;

export type QualityFlag = "soft" | "dark" | "bright" | "small";

export const FLAG_WORDS: Record<QualityFlag, string> = {
  soft: "Possibly soft",
  dark: "Very dark",
  bright: "Very bright",
  small: "Low resolution",
};

/** The picture is analysed at this long side: the same scale for every photo. */
const ANALYSE_LONG_EDGE = 640;
/** Tiles per side: the picture is judged by its sharpest of GRID x GRID tiles. */
const GRID = 4;

/**
 * The detail in each tile of a grey picture: the variance of the Laplacian
 * (how much the brightness jumps from a pixel to its neighbours). Flat or
 * blurry areas score near 0; edges and texture score high. Pure.
 */
export function tileDetail(
  grey: Uint8Array,
  width: number,
  height: number,
  grid = GRID,
): number[] {
  const out: number[] = [];
  const tw = Math.floor(width / grid);
  const th = Math.floor(height / grid);
  for (let ty = 0; ty < grid; ty += 1) {
    for (let tx = 0; tx < grid; tx += 1) {
      const x0 = tx * tw;
      const y0 = ty * th;
      let sum = 0;
      let sumSq = 0;
      let n = 0;
      for (let y = Math.max(1, y0); y < Math.min(height - 1, y0 + th); y += 1) {
        for (let x = Math.max(1, x0); x < Math.min(width - 1, x0 + tw); x += 1) {
          const i = y * width + x;
          const lap =
            4 * grey[i]! -
            grey[i - 1]! -
            grey[i + 1]! -
            grey[i - width]! -
            grey[i + width]!;
          sum += lap;
          sumSq += lap * lap;
          n += 1;
        }
      }
      out.push(n === 0 ? 0 : sumSq / n - (sum / n) ** 2);
    }
  }
  return out;
}

export interface QualityReading {
  /** Detail of the sharpest tile (higher is sharper). */
  readonly sharpness: number;
  /** Average brightness, 0 to 255. */
  readonly brightness: number;
}

/** Measure a preview image's sharpness and brightness. */
export async function measure(image: Uint8Array): Promise<QualityReading> {
  const { data, info } = await sharp(image)
    .rotate()
    .resize({
      width: ANALYSE_LONG_EDGE,
      height: ANALYSE_LONG_EDGE,
      fit: "inside",
      withoutEnlargement: false,
    })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const grey = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const details = tileDetail(grey, info.width, info.height);
  let total = 0;
  for (const v of grey) total += v;
  return { sharpness: Math.max(...details), brightness: total / grey.length };
}

/** The flags for a reading, given the photo's own long side in pixels (null if unknown). */
export function flagsFor(
  reading: QualityReading,
  longEdge: number | null,
): QualityFlag[] {
  const flags: QualityFlag[] = [];
  if (reading.sharpness < SOFT_BELOW) flags.push("soft");
  if (reading.brightness < DARK_BELOW) flags.push("dark");
  if (reading.brightness > BRIGHT_ABOVE) flags.push("bright");
  if (longEdge !== null && longEdge < SMALL_BELOW) flags.push("small");
  return flags;
}
