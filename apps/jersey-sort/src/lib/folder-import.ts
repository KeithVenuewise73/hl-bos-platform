/**
 * Bring a game's photos in from a folder on this computer: the hand-off from
 * DateSort, whose "Find jersey numbers" button opens /import with the date
 * folder it made. Each photo goes through the same ingestPhoto() as a browser
 * upload (duplicates refused, the original stored untouched, analysis queued).
 *
 * The folder itself is only READ: nothing in it is moved, renamed, changed or
 * deleted, and nothing is created there.
 *
 * Only JPG, PNG and HEIC are brought in. Canon RAW files are counted and left
 * out: on the CEO's camera each RAW is the same shot as a JPG beside it, and
 * reading both would read every number twice, at twice the cost.
 *
 * Free of `server-only` so it can be tested against a temp dir.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import type { Db } from "./db-core.ts";
import { ingestPhoto } from "./ingest.ts";

export class ImportError extends Error {}

const PHOTO = /\.(jpe?g|png|heic|heif)$/i;
const RAW = /\.(cr2|cr3|nef|arw|raf|orf|rw2|dng)$/i;

export interface FolderContents {
  readonly folder: string;
  /** File names of the photos to bring in, sorted. */
  readonly photos: readonly string[];
  /** Camera RAW files left out (same shots as the JPGs). */
  readonly raw: number;
  /** Anything else (not photos). */
  readonly other: number;
}

/** What is directly inside the folder. Subfolders are not looked into. */
export async function readImportFolder(folder: string): Promise<FolderContents> {
  const clean = folder.trim();
  if (clean === "" || !path.isAbsolute(clean)) {
    throw new ImportError(
      "That is not a full folder path (like D:\\Photos\\2026-01-13).",
    );
  }
  const st = await stat(clean).catch(() => null);
  if (st === null) throw new ImportError(`The folder "${clean}" was not found.`);
  if (!st.isDirectory()) throw new ImportError(`"${clean}" is a file, not a folder.`);
  const photos: string[] = [];
  let raw = 0;
  let other = 0;
  for (const e of await readdir(clean, { withFileTypes: true })) {
    if (!e.isFile()) continue; // folders, shortcuts and links are not followed
    if (PHOTO.test(e.name)) photos.push(e.name);
    else if (RAW.test(e.name)) raw += 1;
    else other += 1;
  }
  photos.sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  return { folder: clean, photos, raw, other };
}

export interface ImportProgress {
  readonly folder: string;
  readonly total: number;
  done: number;
  added: number;
  /** Already in JerseySort (the same photo, by its bytes). */
  alreadyIn: number;
  /** Could not be brought in, with the first few reasons. */
  failed: number;
  reasons: string[];
  finished: boolean;
}

/** Bring every photo in, one at a time, reporting progress as it goes. */
export async function importFolder(
  db: Db,
  dataDir: string,
  input: {
    readonly org: string;
    readonly userId: string;
    readonly eventId: string;
    readonly contents: FolderContents;
    readonly progress: ImportProgress;
    /** Called after each photo (the app uses it to wake the analysis queue). */
    readonly onPhoto?: (p: ImportProgress) => void;
  },
): Promise<ImportProgress> {
  const p = input.progress;
  for (const name of input.contents.photos) {
    try {
      const bytes = new Uint8Array(
        await readFile(path.join(input.contents.folder, name)),
      );
      const r = await ingestPhoto(db, dataDir, {
        org: input.org,
        userId: input.userId,
        eventId: input.eventId,
        filename: name,
        bytes,
      });
      if (r.ok) p.added += 1;
      else if (r.duplicateOf !== undefined) p.alreadyIn += 1;
      else {
        p.failed += 1;
        if (p.reasons.length < 5) p.reasons.push(`${name}: ${r.reason}`);
      }
    } catch (e) {
      p.failed += 1;
      if (p.reasons.length < 5) {
        p.reasons.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    p.done += 1;
    input.onPhoto?.(p);
  }
  p.finished = true;
  return p;
}

export function newProgress(contents: FolderContents): ImportProgress {
  return {
    folder: contents.folder,
    total: contents.photos.length,
    done: 0,
    added: 0,
    alreadyIn: 0,
    failed: 0,
    reasons: [],
    finished: false,
  };
}
