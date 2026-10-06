/**
 * THE ONLY FILE IN DATESORT'S SCANNER THAT TOUCHES THE FILESYSTEM.
 *
 * Everything it can do is a read: list a folder, look at a file's size and
 * modified time, open a file for reading ("r") and read bytes from it. It has
 * no way to write, create, move, rename, delete, copy or re-date anything,
 * and a test (read-only.test.ts) fails the build if one is ever added here or
 * if any other scanner file imports the filesystem directly.
 *
 * Opening a file for reading does not change its modified time. (Windows may
 * update a file's *last access* time on read when that feature is switched
 * on; that is the operating system's bookkeeping, not a change to the photo.)
 */

import { lstat, open, readdir } from "node:fs/promises";

import type { ByteSource } from "./isobmff";

export interface FolderEntry {
  readonly name: string;
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  /** Shortcuts, symlinks and junctions are never followed. */
  readonly isLink: boolean;
}

export async function listFolder(dir: string): Promise<FolderEntry[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.map((e) => ({
    name: e.name,
    isFile: e.isFile(),
    isDirectory: e.isDirectory(),
    isLink: e.isSymbolicLink(),
  }));
}

export interface FileFacts {
  readonly size: number;
  readonly modified: Date;
  readonly isDirectory: boolean;
}

export async function fileFacts(path: string): Promise<FileFacts> {
  const st = await lstat(path);
  return { size: st.size, modified: st.mtime, isDirectory: st.isDirectory() };
}

export interface OpenForReading extends ByteSource {
  close(): Promise<void>;
}

/** Open a file READ-ONLY. The caller must close it. */
export async function openForReading(path: string): Promise<OpenForReading> {
  const handle = await open(path, "r");
  const { size } = await handle.stat();
  return {
    size,
    async read(offset: number, length: number): Promise<Uint8Array> {
      const len = Math.max(0, Math.min(length, size - offset));
      if (len === 0) return new Uint8Array(0);
      const buf = Buffer.alloc(len);
      const { bytesRead } = await handle.read(buf, 0, len, offset);
      return buf.subarray(0, bytesRead);
    },
    close: () => handle.close(),
  };
}
