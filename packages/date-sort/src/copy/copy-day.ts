/**
 * Copy one shooting date's photos into "<destination>\<YYYY-MM-DD[ - Event]>".
 *
 * COPY ONLY. Originals are opened for reading and nothing else; every write
 * goes through write-file.ts, which never overwrites. Copying the same date
 * again is safe: photos already there are found identical and skipped, so an
 * interrupted copy is finished by simply pressing the button again.
 */

import { join } from "node:path";

import type { ScannedFile, ScannedPhoto } from "../report";
import { folderName, isInside, planDay, type PlannedCopy } from "./plan";
import {
  copyOneFile,
  folderNames,
  freeBytes,
  makeFolder,
  pathKind,
  trueFolderName,
  type Fs,
} from "./write-file";

export class CopyError extends Error {}

export interface DayRequest {
  readonly day: string;
  readonly eventName?: string;
}

export interface CopyProgress {
  readonly day: string;
  readonly folder: string;
  /** Photos finished (copied, already there, conflict or failed) so far, all days. */
  readonly done: number;
  /** Of those, photos found already copied and skipped. */
  readonly alreadyThere: number;
  readonly total: number;
  readonly bytesCopied: number;
}

export interface DayResult {
  readonly day: string;
  readonly folder: string;
  readonly photos: number;
  readonly copied: number;
  readonly alreadyThere: number;
  /** Same name already in the folder with different contents: left alone. */
  readonly conflicts: ReadonlyArray<{
    readonly name: string;
    readonly source: string;
    readonly reason: string;
  }>;
  /** Could not be copied (unreadable original, disk error...). */
  readonly failed: ReadonlyArray<{
    readonly name: string;
    readonly source: string;
    readonly reason: string;
  }>;
  /** Copies given "(2)" names because another photo that day had the same name. */
  readonly renamedCopies: number;
}

export interface CopyRequest {
  /** The folder that was scanned. */
  readonly root: string;
  /** What the scan found. */
  readonly files: readonly ScannedFile[];
  readonly destination: string;
  readonly days: readonly DayRequest[];
  readonly onProgress?: (p: CopyProgress) => void;
  readonly signal?: AbortSignal;
  /** Tests only. */
  readonly fs?: Fs;
}

function plain(e: unknown): string {
  const code = (e as { code?: unknown } | null)?.code;
  if (code === "ENOSPC") return "The destination drive is full";
  if (code === "ENOENT") return "The original is no longer where the scan found it";
  if (code === "EACCES" || code === "EPERM") return "Windows did not allow it";
  if (code === "EBUSY") return "Another program has it locked";
  return e instanceof Error ? e.message : String(e);
}

/** Everything that must be true before anything is written. Throws CopyError. */
export async function checkDestination(
  root: string,
  destination: string,
  bytesNeeded: number,
): Promise<void> {
  if (destination.trim() === "")
    throw new CopyError("Choose where the date folders should go.");
  const kind = await pathKind(destination);
  if (kind === "none")
    throw new CopyError(
      `The destination "${destination}" does not exist. Choose an existing folder.`,
    );
  if (kind === "file") throw new CopyError(`"${destination}" is a file, not a folder.`);
  // Compared by their true names: "C:\\Users\\RUNNER~1\\x" and
  // "C:\\Users\\runneradmin\\x" are one folder, and so are a link and its target.
  const [trueDest, trueRoot] = await Promise.all([
    trueFolderName(destination),
    trueFolderName(root),
  ]);
  if (isInside(destination, root) || isInside(trueDest, trueRoot)) {
    throw new CopyError(
      "The destination is inside the folder you scanned. Choose a folder outside it, so the copies are never mixed in with the originals.",
    );
  }
  const free = await freeBytes(destination);
  if (free !== null && free < bytesNeeded) {
    const gb = (n: number) => (n / 1e9).toFixed(1);
    throw new CopyError(
      `Not enough space: this needs up to ${gb(bytesNeeded)} GB and the destination drive has ${gb(free)} GB free. Nothing was copied.`,
    );
  }
}

/**
 * The folder a date's photos go in. Normally "<date>" or "<date> - <event>".
 * But when no event name is given and the destination already holds exactly
 * one folder for that date under an event name, that folder is used: the
 * name was typed on an earlier copy and is simply not on screen now (a
 * refreshed page once forgot it, and a second, plain "<date>" folder got a
 * second copy of every photo). Two or more named folders for one date are
 * not guessed between.
 */
export function folderForDay(
  day: string,
  eventName: string,
  existing: readonly string[],
): string {
  const wanted = folderName(day, eventName);
  if (wanted !== day) return wanted; // a name was given: use it
  const lower = existing.map((n) => n.toLowerCase());
  if (lower.includes(day)) return wanted;
  const named = existing.filter((n) => n.toLowerCase().startsWith(`${day} - `));
  return named.length === 1 ? named[0]! : wanted;
}

export async function copyDays(request: CopyRequest): Promise<DayResult[]> {
  const photos = request.files.filter((f): f is ScannedPhoto => f.kind === "photo");
  const existing = await folderNames(request.destination);
  const plans = request.days.map((d) => ({
    day: d.day,
    folder: join(request.destination, folderForDay(d.day, d.eventName ?? "", existing)),
    items: planDay(photos, d.day),
  }));
  const total = plans.reduce((n, p) => n + p.items.length, 0);
  const bytesNeeded = plans.reduce(
    (n, p) => n + p.items.reduce((m, i) => m + i.size, 0),
    0,
  );
  await checkDestination(request.root, request.destination, bytesNeeded);

  const results: DayResult[] = [];
  let done = 0;
  let skipped = 0;
  let bytesCopied = 0;
  for (const plan of plans) {
    request.signal?.throwIfAborted();
    await makeFolder(plan.folder);
    let copied = 0;
    let alreadyThere = 0;
    const conflicts: { name: string; source: string; reason: string }[] = [];
    const failed: { name: string; source: string; reason: string }[] = [];
    const one = async (item: PlannedCopy) => {
      request.signal?.throwIfAborted();
      try {
        const outcome = await copyOneFile(
          join(request.root, item.source),
          join(plan.folder, item.name),
          {
            ...(request.signal ? { signal: request.signal } : {}),
            ...(request.fs ? { fs: request.fs } : {}),
          },
        );
        if (outcome.result === "copied") {
          copied += 1;
          bytesCopied += outcome.bytes;
        } else if (outcome.result === "already-there") {
          alreadyThere += 1;
          skipped += 1;
        } else
          conflicts.push({
            name: item.name,
            source: item.source,
            reason: outcome.reason,
          });
      } catch (e) {
        if (request.signal?.aborted) throw e;
        failed.push({ name: item.name, source: item.source, reason: plain(e) });
      }
      done += 1;
      request.onProgress?.({
        day: plan.day,
        folder: plan.folder,
        done,
        alreadyThere: skipped,
        total,
        bytesCopied,
      });
    };
    // Two at a time: enough to keep a laptop disk busy without thrashing it.
    let next = 0;
    const worker = async () => {
      while (next < plan.items.length) await one(plan.items[next++]!);
    };
    await Promise.all([worker(), worker()]);
    results.push({
      day: plan.day,
      folder: plan.folder,
      photos: plan.items.length,
      copied,
      alreadyThere,
      conflicts,
      failed,
      renamedCopies: plan.items.filter((i) => i.name !== i.source.split(/[\\/]/).pop())
        .length,
    });
  }
  return results;
}
