/**
 * Instagram posts, made from a game's photos: which photos, what caption, and
 * the pictures themselves, sized the way Instagram wants them.
 *
 * Instagram is PUBLIC; the team galleries are not. So nothing here posts
 * anything: it makes copies for a person to look at and then post. The
 * originals are never touched, and every picture made here is built from a
 * copy and carries NO camera data at all: not the camera, not the time, and
 * above all not the GPS location, which a phone photo can carry and a public
 * post must not.
 *
 * Free of `server-only` so it can be tested directly.
 */

import convertHeic from "heic-convert";
import sharp from "sharp";

import { FORMATS, wouldEnlarge, type Fit, type Format } from "./instagram-rules.ts";
import type { PhotoKind } from "./media-core.ts";

// The rules live in ./instagram-rules.ts (browser-safe); re-exported here so
// server code has one place to import from.
export * from "./instagram-rules.ts";

export interface Frame {
  /** A JPEG, exactly the chosen size, with no camera data in it. */
  readonly data: Buffer;
  readonly width: number;
  readonly height: number;
  /** True when the photo was smaller than the frame and had to be enlarged (a little soft). */
  readonly enlarged: boolean;
}

/** One picture for the post, from the original photo's bytes. */
export async function makeFrame(
  bytes: Uint8Array,
  kind: PhotoKind,
  options: { readonly format: Format; readonly fit: Fit },
): Promise<Frame> {
  const { width, height } = FORMATS[options.format];
  let decodable: Buffer = Buffer.from(bytes);
  if (kind === "heic") {
    decodable = Buffer.from(
      await convertHeic({ buffer: decodable, format: "JPEG", quality: 0.95 }),
    );
  }
  // rotate() applies the camera's orientation, then drops the orientation tag.
  const base = sharp(decodable, {
    failOn: "error",
    limitInputPixels: 300_000_000,
  }).rotate();
  const upright = await base.clone().toBuffer({ resolveWithObject: true });
  const bar = { r: 11, g: 13, b: 16, alpha: 1 };
  const data = await sharp(upright.data)
    .resize(
      options.fit === "fill"
        ? { width, height, fit: "cover", position: "centre" }
        : { width, height, fit: "contain", background: bar },
    )
    .flatten({ background: bar })
    .toColourspace("srgb")
    // No .withMetadata(): sharp then writes no EXIF, no GPS, no maker notes.
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
  const enlarged = wouldEnlarge(
    upright.info.width,
    upright.info.height,
    options.format,
    options.fit,
  );
  return { data, width, height, enlarged };
}

/** The text file that goes in the pack beside the pictures. */
export function captionFile(caption: string): string {
  return `${caption.replace(/\r\n/g, "\n").trimEnd()}\n`;
}
