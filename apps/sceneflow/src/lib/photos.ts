import "server-only";

import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { acceptPhoto, photoPath, type PhotoVerdict } from "@/lib/upload";
import { REPO_ROOT } from "@/lib/shell";

/**
 * Where a photograph lives once accepted.
 *
 * On this machine and nowhere else. Under `.sceneflow/`, which is gitignored:
 * a photograph of somebody's partner must not be committable by accident, and
 * "don't add it" is not a control — being outside what git tracks is.
 *
 * There is no upload to anywhere. That is the whole point of the private-use
 * decision: the file is read from disk when a scene is generated, by a worker
 * running on the same machine.
 */

const ROOT = join(REPO_ROOT, ".sceneflow", "uploads");

export interface StoredPhoto {
  readonly id: string;
  /** Path relative to the repo root, as the worker will be given it. */
  readonly relativePath: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly format: string;
}

export type StoreResult =
  | { readonly ok: true; readonly photo: StoredPhoto }
  | { readonly ok: false; readonly message: string };

export async function storePhoto(bytes: Uint8Array): Promise<StoreResult> {
  const verdict: PhotoVerdict = acceptPhoto(bytes);
  if (!verdict.ok) return { ok: false, message: verdict.message };

  const id = randomBytes(16).toString("hex");
  const relativePath = photoPath(id, verdict.extension);
  const absolute = join(REPO_ROOT, relativePath);

  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, bytes);

  return {
    ok: true,
    photo: {
      id,
      relativePath,
      width: verdict.width,
      height: verdict.height,
      format: verdict.format,
    },
  };
}

/**
 * Read a stored photo back.
 *
 * The id is re-validated through photoPath rather than pasted into a path, so a
 * crafted id cannot walk out of the uploads folder and read something else off
 * the machine. Returns null for anything that is not there.
 */
export async function readPhoto(
  id: string,
  extension: string,
): Promise<Uint8Array | null> {
  let relative: string;
  try {
    relative = photoPath(id, extension);
  } catch {
    return null;
  }
  try {
    return new Uint8Array(await readFile(join(REPO_ROOT, relative)));
  } catch {
    return null;
  }
}

/** Delete a photograph (brief section 42). Silent when it is already gone. */
export async function deletePhoto(id: string, extension: string): Promise<boolean> {
  try {
    await unlink(join(REPO_ROOT, photoPath(id, extension)));
    return true;
  } catch {
    return false;
  }
}

export { ROOT as UPLOAD_ROOT };
