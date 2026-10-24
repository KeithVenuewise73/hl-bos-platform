/**
 * The small copy of a photo that is sent to Claude: at most 768 px on the
 * long edge, JPEG. sharp writes no metadata unless asked to, so the camera
 * details and any GPS location in the original are NOT in it. The original
 * is only read, through the scanner's read-only module.
 */

import sharp from "sharp";

import { openForReading } from "../read-only-file";

export const PREVIEW_EDGE = 768;

export async function previewOf(path: string): Promise<Buffer> {
  const file = await openForReading(path);
  try {
    const bytes = await file.read(0, file.size);
    return await sharp(bytes)
      .rotate() // honour the camera's orientation before the metadata is dropped
      .resize({ width: PREVIEW_EDGE, height: PREVIEW_EDGE, fit: "inside" })
      .jpeg({ quality: 80 })
      .toBuffer();
  } finally {
    await file.close();
  }
}
