/**
 * How much room the drive holding a folder has. Only reads: it asks the
 * operating system for the drive's free space and creates, changes and
 * deletes nothing. It lives here, with the other disk code, because the app
 * itself is never allowed to import the filesystem.
 */

import { statfs } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Free bytes on the drive that holds `folder`, or null when it cannot be read.
 * The folder may not exist yet (it is made on the first copy), so this asks
 * the nearest folder above it that does.
 */
export async function freeBytes(folder: string): Promise<number | null> {
  let dir = folder;
  for (let i = 0; i < 64; i += 1) {
    try {
      const s = await statfs(dir);
      return Number(s.bavail) * Number(s.bsize);
    } catch {
      const up = dirname(dir);
      if (up === dir) return null;
      dir = up;
    }
  }
  return null;
}
