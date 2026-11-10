/**
 * Room on a drive, and how much a result needs. Reads only.
 *
 * Why this exists: a long job that fills the drive an hour in is the failure
 * this project has already had twice. Check before starting, say what is needed
 * in plain words, and refuse a job that cannot fit.
 */

import { statfs } from "node:fs/promises";
import { dirname } from "node:path";

import type { Quality } from "./ffmpeg.ts";

/** Free bytes on the drive that holds `path` (which need not exist yet), or null if unreadable. */
export async function freeBytes(path: string): Promise<number | null> {
  let dir = path;
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

/** Bytes per second of finished video: about 8.2 Mbit/s at full quality, 3.7 at draft, with a margin. */
export function bytesPerSecond(quality: Quality): number {
  return ((quality === "draft" ? 3.7 : 8.2) * 1_000_000 * 1.25) / 8;
}

/**
 * What a job needs while it runs: the small pieces AND the joined result sit on
 * the drive together, so peak use is about twice the finished size.
 */
export function bytesNeeded(
  videoSeconds: number,
  quality: Quality,
): { result: number; peak: number } {
  const result = Math.ceil(videoSeconds * bytesPerSecond(quality));
  return { result, peak: result * 2 };
}

export interface RoomCheck {
  readonly enough: boolean;
  readonly known: boolean;
  /** Plain words for the person. */
  readonly message: string;
}

const GB = 1024 ** 3;
const gb = (n: number) => `${(n / GB).toFixed(1)} GB`;

/** Will `peakBytes` fit on the drive with 2 GB to spare? When free space cannot be read, it does not block, and says so. */
export function checkRoom(
  driveName: string,
  free: number | null,
  peakBytes: number,
): RoomCheck {
  if (free === null) {
    return {
      enough: true,
      known: false,
      message: `Could not read how much room ${driveName} has, so cannot say whether this will fit (it needs about ${gb(peakBytes)} while it works).`,
    };
  }
  const spare = 2 * GB;
  if (free >= peakBytes + spare) {
    return {
      enough: true,
      known: true,
      message: `${driveName} has ${gb(free)} free; this needs about ${gb(peakBytes)} while it works.`,
    };
  }
  return {
    enough: false,
    known: true,
    message: `This will not fit: it needs about ${gb(peakBytes)} while it works (and ${gb(spare)} to spare), but ${driveName} has only ${gb(free)} free. Choose a drive with more room, or make a Draft first, which is smaller.`,
  };
}
