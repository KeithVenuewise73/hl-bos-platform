/**
 * Sorting videos by how long they are: a video longer than a short clip is a game recording, so it
 * belongs in "Game Footage", not "Short Clips". File size is only a guess at this (a phone set to a
 * low video quality makes a whole game smaller than 1 GB); the length is the real answer.
 *
 * It only MOVES a file inside the phone's own import folder (Short Clips -> Game Footage, keeping
 * the month folder it was in), on the same drive. It never copies, deletes or overwrites: if a file
 * with that name is already in Game Footage, the video is left where it is and counted.
 * It never touches the phone and never leaves the two folders.
 */

import { mkdir, readdir, rename, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import { MAX_CLIP_SECONDS } from "./video";

const VIDEO = /\.(mov|mp4|m4v)$/i;

export interface MovedVideo {
  /** Path inside the clips folder, e.g. "202611_a\IMG_0111.MOV". */
  readonly path: string;
  readonly seconds: number;
  /** false when it was only looked at (check), or could not be moved. */
  readonly moved: boolean;
}

export interface SortResult {
  /** How many videos were looked at. */
  readonly looked: number;
  /** Videos longer than a short clip, and what happened to each. */
  readonly long: readonly MovedVideo[];
  /** How many were moved (0 for a check). */
  readonly moved: number;
  /** Long videos left in place because Game Footage already has a file of that name. */
  readonly conflicts: readonly string[];
  /** Videos whose length could not be read: left where they are. */
  readonly unreadable: readonly string[];
}

export interface SortOptions {
  readonly clipsRoot: string;
  readonly gamesRoot: string;
  /** Move (true) or only look (false). */
  readonly apply: boolean;
  readonly maxSeconds?: number;
  /** The length of one video in seconds, or null when it cannot be read. */
  readonly probe: (file: string) => Promise<number | null>;
  readonly signal?: AbortSignal;
}

async function* walk(root: string, rel = ""): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(join(root, rel), { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    // DateSort's own work folder (.datesort-incoming) holds half-copied files: never touched.
    if (e.name.startsWith(".")) continue;
    const next = rel === "" ? e.name : `${rel}/${e.name}`;
    if (e.isDirectory()) yield* walk(root, next);
    else if (e.isFile() && VIDEO.test(e.name)) yield next;
  }
}

const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false,
  );

export async function sortByLength(o: SortOptions): Promise<SortResult> {
  const max = o.maxSeconds ?? MAX_CLIP_SECONDS;
  let looked = 0;
  let moved = 0;
  const long: MovedVideo[] = [];
  const conflicts: string[] = [];
  const unreadable: string[] = [];
  for await (const rel of walk(o.clipsRoot)) {
    if (o.signal?.aborted) break;
    looked += 1;
    const from = join(o.clipsRoot, ...rel.split("/"));
    const seconds = await o.probe(from);
    if (seconds === null) {
      unreadable.push(rel.replace(/\//g, "\\"));
      continue;
    }
    if (seconds <= max) continue;
    const display = rel.replace(/\//g, "\\");
    const to = join(o.gamesRoot, ...rel.split("/"));
    if (await exists(to)) {
      conflicts.push(display);
      long.push({ path: display, seconds, moved: false });
      continue;
    }
    if (!o.apply) {
      long.push({ path: display, seconds, moved: false });
      continue;
    }
    try {
      await mkdir(dirname(to), { recursive: true });
      await rename(from, to);
      moved += 1;
      long.push({ path: display, seconds, moved: true });
    } catch {
      long.push({ path: display, seconds, moved: false });
    }
  }
  return { looked, long, moved, conflicts, unreadable };
}
