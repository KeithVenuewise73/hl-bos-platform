/**
 * THE ONLY FILE IN DATESORT THAT DELETES A PHOTO.
 *
 * It removes ONE original from the card, and nothing else. It is only ever
 * called by free-card.ts, after that file has been proven (by its bytes) to
 * exist, identical, on the hard drive, and (for photos) on 5Star. A test
 * (free-card.test.ts) fails the build if any other file in DateSort deletes
 * anything but its own ".datesort-partial" copies.
 *
 * An SD card has no Recycle Bin: what this removes cannot be brought back.
 */

import { unlink } from "node:fs/promises";

/** Pieces the tests replace to simulate a failing card. */
export interface RemoveFs {
  unlink: (path: string) => Promise<void>;
}

export const realRemoveFs: RemoveFs = { unlink };

/** Delete exactly one file. Throws if it cannot (write-protected card, file in use). */
export async function removeOriginal(
  path: string,
  fs: RemoveFs = realRemoveFs,
): Promise<void> {
  await fs.unlink(path);
}
