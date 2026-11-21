/**
 * Free up an SD card: delete the originals that are safely somewhere else.
 *
 * An original is deleted ONLY when every one of these is true, checked by its
 * actual bytes (SHA-256), not by name, size or date:
 *
 *   1. A copy of it exists in the date's folder on the destination drive, and
 *      is byte for byte identical.
 *   2. That copy is a different file on a different drive (never the original
 *      itself, a link to it, a folder inside the card, or the card's own drive).
 *   3. For photos: 5Star's review area already holds a photo with the same
 *      fingerprint. (Videos are not sent to 5Star, so they need 1 and 2 only.)
 *   4. The original was not changed while it was being checked.
 *
 * Anything else is KEPT, with the reason. If 5Star cannot be asked, the photos
 * are kept. Nothing is ever deleted that this file did not just prove.
 *
 * Two steps, so a person sees the numbers first:
 *   checkCard()  reads, deletes nothing, and returns what is safe and what is kept.
 *   freeCard()   takes that result and a confirmation, RE-PROVES each file just
 *                before deleting it (its copy is read again; the original must
 *                be untouched; 5Star is asked again), writes a record, deletes it.
 *
 * Only remove.ts deletes. A deleted file cannot be brought back: an SD card has
 * no Recycle Bin.
 */

import { createHash } from "node:crypto";
import { lstat, open, realpath, stat } from "node:fs/promises";
import { join } from "node:path";

import { isInside, planDay } from "../copy/plan";
import { folderNames, pathKind, trueFolderName } from "../copy/write-file";
import { isVideo } from "../formats";
import type { ScannedFile, ScannedPhoto } from "../report";
import { writeLog } from "./log";
import { realRemoveFs, removeOriginal, type RemoveFs } from "./remove";

export class FreeCardError extends Error {}

export type KeepReason =
  | "no-date"
  | "no-folder"
  | "many-folders"
  | "no-copy"
  | "copy-differs"
  | "same-file"
  | "same-drive"
  | "not-on-5star"
  | "5star-unavailable"
  | "changed"
  | "unreadable"
  | "not-a-file"
  | "not-removed";

/** Why a file was kept, in words for the person. */
export const KEEP_WORDS: Record<KeepReason, string> = {
  "no-date": "no date could be read, so it was never copied to a date folder",
  "no-folder": "there is no folder for its date on your hard drive yet",
  "many-folders": "its date has more than one folder on your hard drive",
  "no-copy": "no copy of it was found on your hard drive",
  "copy-differs": "the copy on your hard drive is not identical",
  "same-file": "the 'copy' is the original itself",
  "same-drive": "the copy is on the same drive as the original",
  "not-on-5star": "it is not on 5Star yet",
  "5star-unavailable": "5Star could not be checked",
  changed: "it changed while it was being checked",
  unreadable: "it could not be read",
  "not-a-file": "it is not an ordinary file",
  "not-removed": "Windows would not delete it",
};

export interface Kept {
  readonly path: string;
  readonly reason: KeepReason;
}

interface Key {
  readonly size: number;
  readonly mtimeMs: number;
  readonly dev: number;
  readonly ino: number;
}

export interface Safe {
  /** Path inside the scanned card folder. */
  readonly path: string;
  readonly size: number;
  readonly hash: string;
  readonly driveCopy: string;
  readonly video: boolean;
  readonly source: Key;
  readonly copy: Key;
}

export interface CheckResult {
  readonly safe: readonly Safe[];
  readonly kept: readonly Kept[];
  readonly bytesSafe: number;
  /** Files that are not photos or videos (left alone, never touched). */
  readonly notMedia: number;
}

/** Asks 5Star which of these fingerprints it already holds. May throw. */
export type OnSite = (hashes: string[]) => Promise<ReadonlySet<string>>;

/** Pieces the tests replace to simulate drives and failures. */
export interface FreeCardFs extends RemoveFs {
  /** A number that differs between two drives and matches within one. */
  deviceOf: (path: string) => Promise<number>;
}

export interface CardProgress {
  readonly phase: "checking" | "removing";
  readonly done: number;
  readonly total: number;
}

export interface CardRequest {
  /** The folder that was scanned (the card). */
  readonly root: string;
  readonly files: readonly ScannedFile[];
  /** The hard drive folder the date folders were copied into. */
  readonly destination: string;
  /** null when 5Star cannot be asked: photos are then all kept. */
  readonly onSite: OnSite | null;
  readonly onProgress?: (p: CardProgress) => void;
  readonly signal?: AbortSignal;
  /** Tests only. */
  readonly fs?: Partial<FreeCardFs>;
  /** Where the record of freed files is kept (tests use a temp folder). */
  readonly logDir?: string;
}

const CHUNK = 1024 * 1024;
const ASK = 2000;

async function sha256(path: string, signal?: AbortSignal): Promise<string> {
  const handle = await open(path, "r");
  try {
    const h = createHash("sha256");
    const buf = Buffer.alloc(CHUNK);
    for (;;) {
      signal?.throwIfAborted();
      const { bytesRead } = await handle.read(buf, 0, CHUNK, null);
      if (bytesRead === 0) break;
      h.update(buf.subarray(0, bytesRead));
    }
    return h.digest("hex");
  } finally {
    await handle.close();
  }
}

const keyOf = (s: {
  size: number;
  mtimeMs: number;
  dev: number;
  ino: number;
}): Key => ({ size: s.size, mtimeMs: s.mtimeMs, dev: s.dev, ino: s.ino });

const sameKey = (a: Key, b: Key) =>
  a.size === b.size && a.mtimeMs === b.mtimeMs && a.dev === b.dev && a.ino === b.ino;

async function defaultDeviceOf(path: string): Promise<number> {
  return (await stat(path)).dev;
}

function fsOf(o: Partial<FreeCardFs> | undefined): FreeCardFs {
  return {
    unlink: o?.unlink ?? realRemoveFs.unlink,
    deviceOf: o?.deviceOf ?? defaultDeviceOf,
  };
}

/** Everything that must be true of the two folders before any file is judged. */
async function checkFolders(root: string, destination: string): Promise<void> {
  if (destination.trim() === "")
    throw new FreeCardError("Choose the hard-drive folder your copies are in first.");
  const kind = await pathKind(destination);
  if (kind !== "folder")
    throw new FreeCardError(
      `The hard-drive folder "${destination}" cannot be found. Plug the drive in and choose the folder again.`,
    );
  const [trueDest, trueRoot] = await Promise.all([
    trueFolderName(destination),
    trueFolderName(root),
  ]);
  if (
    isInside(destination, root) ||
    isInside(trueDest, trueRoot) ||
    isInside(root, destination) ||
    isInside(trueRoot, trueDest)
  )
    throw new FreeCardError(
      "The hard-drive folder and the card folder are the same place, or one is inside the other. Nothing can be freed that way.",
    );
}

type Verdict = { safe: Safe } | { kept: Kept };

/** Judge ONE file: is there an identical copy, somewhere else? Reads only. */
async function judge(
  root: string,
  folder: string,
  item: { source: string; name: string },
  video: boolean,
  fs: FreeCardFs,
  signal: AbortSignal | undefined,
): Promise<Verdict> {
  const path = item.source;
  const src = join(root, item.source);
  const dst = join(folder, item.name);
  const keep = (reason: KeepReason): Verdict => ({ kept: { path, reason } });
  let s;
  try {
    s = await lstat(src);
  } catch {
    return keep("unreadable");
  }
  if (!s.isFile()) return keep("not-a-file");
  let d;
  try {
    d = await lstat(dst);
  } catch {
    return keep("no-copy");
  }
  if (!d.isFile()) return keep("no-copy");
  // The "copy" must not be the original itself (a link, the same folder, the same file).
  const [realSrc, realDst] = await Promise.all([
    realpath(src).catch(() => src),
    realpath(dst).catch(() => dst),
  ]);
  if (realSrc === realDst || (s.ino !== 0 && s.ino === d.ino && s.dev === d.dev))
    return keep("same-file");
  // It must be on another drive: a copy on the card itself is not a backup.
  try {
    const [a, b] = await Promise.all([fs.deviceOf(src), fs.deviceOf(dst)]);
    if (a !== 0 && a === b) return keep("same-drive");
  } catch {
    return keep("unreadable");
  }
  if (s.size !== d.size) return keep("copy-differs");
  let hashSrc: string;
  let hashDst: string;
  try {
    [hashSrc, hashDst] = await Promise.all([sha256(src, signal), sha256(dst, signal)]);
  } catch (e) {
    if (signal?.aborted) throw e;
    return keep("unreadable");
  }
  if (hashSrc !== hashDst) return keep("copy-differs");
  // The original must not have been touched while it was read.
  let after;
  try {
    after = await lstat(src);
  } catch {
    return keep("changed");
  }
  if (!sameKey(keyOf(s), keyOf(after))) return keep("changed");
  return {
    safe: {
      path,
      size: s.size,
      hash: hashSrc,
      driveCopy: dst,
      video,
      source: keyOf(s),
      copy: keyOf(d),
    },
  };
}

/** Ask 5Star about every photo fingerprint. Null when it could not be asked. */
async function askSite(
  onSite: OnSite | null,
  hashes: string[],
): Promise<ReadonlySet<string> | null> {
  if (hashes.length === 0) return new Set();
  if (onSite === null) return null;
  try {
    const known = new Set<string>();
    for (let i = 0; i < hashes.length; i += ASK)
      for (const h of await onSite(hashes.slice(i, i + ASK))) known.add(h);
    return known;
  } catch {
    return null;
  }
}

/** Reads and compares; deletes nothing. */
export async function checkCard(req: CardRequest): Promise<CheckResult> {
  await checkFolders(req.root, req.destination);
  const fs = fsOf(req.fs);
  const media = req.files.filter((f): f is ScannedPhoto => f.kind === "photo");
  const notMedia = req.files.length - media.length;

  const kept: Kept[] = [];
  const candidates: Safe[] = [];
  const existing = await folderNames(req.destination);
  const days = new Set<string>();
  for (const p of media) {
    if (p.takenAt === null) kept.push({ path: p.path, reason: "no-date" });
    else days.add(p.takenAt.slice(0, 10));
  }

  const work: { folder: string; source: string; name: string; video: boolean }[] = [];
  for (const day of [...days].sort()) {
    const forDay = existing.filter((n) => {
      const l = n.toLowerCase();
      return l === day || l.startsWith(`${day} - `);
    });
    const items = planDay(media, day);
    if (forDay.length !== 1) {
      const reason = forDay.length === 0 ? "no-folder" : "many-folders";
      for (const i of items) kept.push({ path: i.source, reason });
      continue;
    }
    const folder = join(req.destination, forDay[0]!);
    const byPath = new Map(media.map((p) => [p.path, p]));
    for (const i of items)
      work.push({
        folder,
        source: i.source,
        name: i.name,
        video: isVideo(byPath.get(i.source)!.format),
      });
  }

  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < work.length) {
      req.signal?.throwIfAborted();
      const w = work[next++]!;
      const v = await judge(req.root, w.folder, w, w.video, fs, req.signal);
      if ("safe" in v) candidates.push(v.safe);
      else kept.push(v.kept);
      done += 1;
      req.onProgress?.({ phase: "checking", done, total: work.length });
    }
  };
  await Promise.all([worker(), worker()]);

  // Photos must also be on 5Star. Videos are not sent there: the drive copy is enough.
  const photoHashes = [
    ...new Set(candidates.filter((c) => !c.video).map((c) => c.hash)),
  ];
  const known = await askSite(req.onSite, photoHashes);
  const safe: Safe[] = [];
  for (const c of candidates) {
    if (c.video) safe.push(c);
    else if (known === null) kept.push({ path: c.path, reason: "5star-unavailable" });
    else if (!known.has(c.hash)) kept.push({ path: c.path, reason: "not-on-5star" });
    else safe.push(c);
  }
  safe.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return {
    safe,
    kept,
    bytesSafe: safe.reduce((n, s) => n + s.size, 0),
    notMedia,
  };
}

export interface FreeResult {
  readonly removed: number;
  readonly bytesFreed: number;
  /** Files that were safe when checked but were kept after the final re-check. */
  readonly kept: readonly Kept[];
  /** Files that could not be deleted (card write-protected, file in use...). */
  readonly failed: readonly { readonly path: string; readonly message: string }[];
  readonly stopped: boolean;
}

/**
 * Delete what checkCard() found safe, re-proving each file first. Needs the
 * check's result and an explicit confirmation: it will not run without both.
 */
export async function freeCard(
  req: CardRequest,
  check: CheckResult,
  confirmed: boolean,
): Promise<FreeResult> {
  if (confirmed !== true)
    throw new FreeCardError(
      "Deleting needs the person's confirmation. Nothing was deleted.",
    );
  await checkFolders(req.root, req.destination);
  const fs = fsOf(req.fs);
  const kept: Kept[] = [];
  const failed: { path: string; message: string }[] = [];
  let removed = 0;
  let bytesFreed = 0;
  let stopped = false;

  // 5Star is asked again, now, for every photo about to go.
  const known = await askSite(req.onSite, [
    ...new Set(check.safe.filter((s) => !s.video).map((s) => s.hash)),
  ]);

  const aborted = () => req.signal?.aborted === true;
  let done = 0;
  for (const s of check.safe) {
    if (aborted()) {
      stopped = true;
      break;
    }
    done += 1;
    req.onProgress?.({ phase: "removing", done, total: check.safe.length });
    const keep = (reason: KeepReason) => {
      kept.push({ path: s.path, reason });
    };
    const src = join(req.root, s.path);

    // The original must be exactly what was checked.
    let now;
    try {
      now = await lstat(src);
    } catch {
      keep("changed");
      continue;
    }
    if (!now.isFile() || !sameKey(keyOf(now), s.source)) {
      keep("changed");
      continue;
    }
    // The copy must still be there, untouched, and read again now.
    let copy;
    try {
      copy = await lstat(s.driveCopy);
    } catch {
      keep("no-copy");
      continue;
    }
    if (!copy.isFile() || copy.size !== s.size || copy.mtimeMs !== s.copy.mtimeMs) {
      keep("copy-differs");
      continue;
    }
    if (
      (await realpath(src).catch(() => src)) ===
        (await realpath(s.driveCopy).catch(() => s.driveCopy)) ||
      (now.ino !== 0 && now.ino === copy.ino && now.dev === copy.dev)
    ) {
      keep("same-file");
      continue;
    }
    try {
      const [a, b] = await Promise.all([fs.deviceOf(src), fs.deviceOf(s.driveCopy)]);
      if (a !== 0 && a === b) {
        keep("same-drive");
        continue;
      }
    } catch {
      keep("unreadable");
      continue;
    }
    let again: string;
    try {
      again = await sha256(s.driveCopy, req.signal);
    } catch {
      if (aborted()) {
        stopped = true;
        break;
      }
      keep("unreadable");
      continue;
    }
    if (again !== s.hash) {
      keep("copy-differs");
      continue;
    }
    if (!s.video) {
      if (known === null) {
        keep("5star-unavailable");
        continue;
      }
      if (!known.has(s.hash)) {
        keep("not-on-5star");
        continue;
      }
    }

    const line = {
      path: join(req.root, s.path),
      size: s.size,
      sha256: s.hash,
      driveCopy: s.driveCopy,
      onFiveStar: !s.video,
    };
    // The record is written first, so it exists even if the power goes out now.
    await writeLog(
      { at: new Date().toISOString(), action: "removing", ...line },
      req.logDir,
    );
    try {
      await removeOriginal(src, fs);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await writeLog(
        { at: new Date().toISOString(), action: "failed", ...line, note: message },
        req.logDir,
      ).catch(() => undefined);
      keep("not-removed");
      failed.push({ path: s.path, message });
      continue;
    }
    removed += 1;
    bytesFreed += s.size;
    await writeLog(
      { at: new Date().toISOString(), action: "removed", ...line },
      req.logDir,
    ).catch(() => undefined);
  }
  return { removed, bytesFreed, kept, failed, stopped };
}
