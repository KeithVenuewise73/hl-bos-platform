/**
 * Local "buckets": originals/, thumbnails/, previews/ (and exports are
 * streamed, never stored). Paths are always built here from ids the server
 * generated, never from anything a browser sent, and every read is checked
 * to stay inside the data directory.
 *
 * Free of `server-only` so it can be tested.
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export type Bucket = "originals" | "thumbnails" | "previews";

export function objectPath(
  bucket: Bucket,
  org: string,
  photoId: string,
  ext: string,
): string {
  if (
    !/^[0-9a-f-]{36}$/.test(org) ||
    !/^[0-9a-f-]{36}$/.test(photoId) ||
    !/^[a-z]{3,4}$/.test(ext)
  ) {
    throw new Error("Refusing to build a storage path from an unexpected id.");
  }
  return `${bucket}/${org}/${photoId}.${ext}`;
}

function resolveInside(dataDir: string, relative: string): string {
  const root = path.resolve(/*turbopackIgnore: true*/ dataDir);
  const full = path.resolve(/*turbopackIgnore: true*/ root, relative);
  if (!full.startsWith(root + path.sep))
    throw new Error("Refusing a path outside the data directory.");
  return full;
}

export async function putObject(
  dataDir: string,
  relative: string,
  bytes: Uint8Array,
): Promise<void> {
  const full = resolveInside(dataDir, relative);
  await mkdir(path.dirname(full), { recursive: true });
  // "wx": an original is written once and never overwritten.
  await writeFile(full, bytes, {
    flag: relative.startsWith("originals/") ? "wx" : "w",
  });
}

export async function getObject(dataDir: string, relative: string): Promise<Buffer> {
  return readFile(resolveInside(dataDir, relative));
}

export async function removeObjects(
  dataDir: string,
  relatives: readonly string[],
): Promise<void> {
  for (const r of relatives) {
    await rm(resolveInside(dataDir, r), { force: true });
  }
}
