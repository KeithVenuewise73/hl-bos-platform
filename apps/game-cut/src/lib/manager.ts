import "server-only";

import { isStop } from "./engine.ts";
import { JobManager } from "./jobs.ts";

/** Said in plain words. The raw ffmpeg message is kept, shortened, after it. */
export function explainError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const short = raw.length > 400 ? `${raw.slice(0, 400)}…` : raw;
  if (/No space left|ENOSPC|disk space/i.test(raw)) {
    return `The drive ran out of room while working. Nothing was kept. ${short}`;
  }
  if (/EBUSY|EPERM|EACCES/.test(raw)) {
    return `Windows would not let Game Cut read or write a file (something else may be using it). ${short}`;
  }
  if (/Invalid data found|moov atom not found|could not find codec/i.test(raw)) {
    return `A video file could not be read. It may be damaged or still being copied. ${short}`;
  }
  return short;
}

/** One manager for the whole server, however many route bundles load this file. */
const g = globalThis as unknown as { __gameCutJobs?: JobManager };
export const jobs: JobManager = (g.__gameCutJobs ??= new JobManager(
  () => Date.now(),
  explainError,
  isStop,
));
