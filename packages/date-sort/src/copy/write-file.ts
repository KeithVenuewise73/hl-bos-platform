/**
 * THE ONLY FILE IN DATESORT THAT WRITES PHOTOS (copies of them, in the
 * destination). The one other write in DateSort is settings.ts, which saves
 * settings.json in DateSort's own settings folder.
 *
 * It copies ONE file, and its rules are the whole safety story:
 *
 *   - The source is only ever opened for reading ("r").
 *   - The destination is never overwritten. If a file of that name is
 *     already there, it is compared byte for byte (SHA-256): the same photo
 *     is reported "already there"; a different file is reported as a
 *     conflict and left exactly as it is.
 *   - A copy is written under a temporary name ("<name>.datesort-partial"),
 *     checked against the original, given the original's dates, and only
 *     then given its real name, by an operation that FAILS if that name
 *     appeared in the meantime (a hard link; or, on drives without hard
 *     links such as exFAT, an exclusive copy). A copy that was cut short
 *     (power loss, unplugged drive) is therefore never mistaken for a photo.
 *   - The only thing it ever deletes is its own ".datesort-partial" file.
 *
 * Nothing here knows about dates or folders: copy-day.ts decides what to
 * copy where; this decides how to copy one file without risk.
 */

import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  copyFile,
  link,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  stat,
  statfs,
  unlink,
  utimes,
} from "node:fs/promises";

export const PARTIAL_SUFFIX = ".datesort-partial";

export type CopyOutcome =
  | { readonly result: "copied"; readonly bytes: number }
  | { readonly result: "already-there" }
  | { readonly result: "conflict"; readonly reason: string };

/** Pieces the tests replace to simulate drives and failures. */
export interface Fs {
  link: (existing: string, created: string) => Promise<void>;
}
const realFs: Fs = { link };

const CHUNK = 1024 * 1024;

async function sha256(path: string): Promise<{ hash: string; size: number }> {
  const handle = await open(path, "r");
  try {
    const h = createHash("sha256");
    const buf = Buffer.alloc(CHUNK);
    let size = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buf, 0, CHUNK, null);
      if (bytesRead === 0) break;
      h.update(buf.subarray(0, bytesRead));
      size += bytesRead;
    }
    return { hash: h.digest("hex"), size };
  } finally {
    await handle.close();
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (e) {
    if ((e as { code?: string }).code === "ENOENT") return false;
    throw e;
  }
}

/** Same bytes? Size first, then SHA-256. */
async function sameContent(a: string, b: string): Promise<boolean> {
  const [sa, sb] = await Promise.all([stat(a), stat(b)]);
  if (sa.size !== sb.size) return false;
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
  return ha.hash === hb.hash;
}

async function compareExisting(source: string, dest: string): Promise<CopyOutcome> {
  return (await sameContent(source, dest))
    ? { result: "already-there" }
    : {
        result: "conflict",
        reason:
          "A different file with this name is already in the folder. It was left as it is.",
      };
}

/** Write `source` into `partial` (which must not exist), hashing as it goes. */
async function writePartial(
  source: string,
  partial: string,
  signal?: AbortSignal,
): Promise<{ hash: string; size: number }> {
  const input = await open(source, "r");
  try {
    // "wx": create, and FAIL if the name exists. Never truncates anything.
    const output = await open(partial, "wx");
    try {
      const h = createHash("sha256");
      const buf = Buffer.alloc(CHUNK);
      let size = 0;
      for (;;) {
        signal?.throwIfAborted();
        const { bytesRead } = await input.read(buf, 0, CHUNK, null);
        if (bytesRead === 0) break;
        const chunk = buf.subarray(0, bytesRead);
        h.update(chunk);
        let written = 0;
        while (written < bytesRead) {
          const { bytesWritten } = await output.write(
            chunk,
            written,
            bytesRead - written,
          );
          written += bytesWritten;
        }
        size += bytesRead;
      }
      await output.sync();
      return { hash: h.digest("hex"), size };
    } finally {
      await output.close();
    }
  } finally {
    await input.close();
  }
}

/** Errors that mean "this drive cannot make hard links". */
const NO_HARD_LINKS = new Set([
  "EPERM",
  "ENOTSUP",
  "EOPNOTSUPP",
  "EXDEV",
  "EINVAL",
  "ENOSYS",
  "EACCES",
]);

/**
 * Copy `source` to `dest`, never overwriting. See the header for the rules.
 * Throws only for real failures (unreadable source, full disk, cancelled);
 * a partial file is removed before it throws.
 */
export async function copyOneFile(
  source: string,
  dest: string,
  options: { signal?: AbortSignal; fs?: Fs } = {},
): Promise<CopyOutcome> {
  const fs = options.fs ?? realFs;
  if (await exists(dest)) return compareExisting(source, dest);

  const partial = dest + PARTIAL_SUFFIX;
  // A partial file can only be left by an earlier copy of ours that was cut
  // short; it is never a photo. Remove it and start again.
  if (await exists(partial)) await unlink(partial);

  let partialExists = false;
  try {
    partialExists = true;
    const written = await writePartial(source, partial, options.signal);
    const check = await sha256(partial);
    if (check.hash !== written.hash || check.size !== written.size) {
      throw new Error("The copy did not match the original when read back.");
    }
    const src = await stat(source);
    await utimes(partial, src.atime, src.mtime);

    try {
      await fs.link(partial, dest); // fails if dest exists: never overwrites
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      if (code === "EEXIST") return compareExisting(source, dest);
      if (!NO_HARD_LINKS.has(code)) throw e;
      // exFAT / FAT32 / network shares: an exclusive copy instead.
      try {
        await copyFile(partial, dest, constants.COPYFILE_EXCL);
      } catch (e2) {
        if ((e2 as { code?: string }).code === "EEXIST")
          return compareExisting(source, dest);
        throw e2;
      }
      const final = await sha256(dest);
      if (final.hash !== written.hash) {
        await unlink(dest); // ours, written a moment ago, and wrong
        throw new Error("The copy did not match the original when read back.", {
          cause: e,
        });
      }
      await utimes(dest, src.atime, src.mtime);
    }
    return { result: "copied", bytes: written.size };
  } finally {
    if (partialExists) await unlink(partial).catch(() => undefined);
  }
}

/** Make a folder (and its parents). Never touches what is already there. */
export async function makeFolder(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

/** What kind of thing is at `path`, if anything. */
export async function pathKind(path: string): Promise<"folder" | "file" | "none"> {
  try {
    return (await stat(path)).isDirectory() ? "folder" : "file";
  } catch {
    return "none";
  }
}

/** Free bytes on the drive holding `path`, or null if it cannot be told. */
export async function freeBytes(path: string): Promise<number | null> {
  try {
    const s = await statfs(path);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

/**
 * A folder's one true name: links, junctions and old-style short names
 * (C:\\USERS\\RUNNER~1) resolved. Two spellings of one folder give the same
 * answer, so "is this inside that?" cannot be fooled. Unchanged if it
 * cannot be resolved.
 */
export async function trueFolderName(path: string): Promise<string> {
  try {
    return await realpath(path); // the OS resolver: long names on Windows
  } catch {
    return path;
  }
}

/** The names of the folders directly inside `path` (none if it cannot be read). */
export async function folderNames(path: string): Promise<string[]> {
  try {
    return (await readdir(path, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
}
