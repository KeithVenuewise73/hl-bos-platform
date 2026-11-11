/**
 * The words for "how big is this and how long will it take", for bringing
 * files in from an iPhone. Pure, so it is tested directly.
 *
 * Time before the copy starts is an ESTIMATE from a typical USB speed to a
 * phone (20 to 40 MB/s); it says so. Once files are really moving, the time
 * left comes from the speed actually seen.
 */

/** Slowest and fastest typical USB speeds to a phone, in MB per second. */
export const SLOW_MB_PER_S = 20;
export const FAST_MB_PER_S = 40;

/** What "small" and "large" mean, in MB: under this comes first, over it waits for the night. */
export const SPLIT_MB = 1024;

export type SizeChoice = "all" | "small" | "large";

const GB = 1024 ** 3;
const MB = 1024 ** 2;

/** 51_800_000_000 -> "48.2 GB"; 850_000_000 -> "811 MB". */
export function sizeText(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`;
  return `${Math.round(bytes / MB).toLocaleString("en-US")} MB`;
}

/** 90 -> "about 2 minutes"; 7_800 -> "about 2 hours 10 minutes". */
export function durationText(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (seconds < 60) return "less than a minute";
  if (minutes < 60) return `about ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = `${h} ${h === 1 ? "hour" : "hours"}`;
  return m === 0 ? `about ${hours}` : `about ${hours} ${m} minutes`;
}

/** "20 minutes to 40 minutes" worth of range, written once: "about 20 to 40 minutes". */
export function estimateText(bytes: number): string {
  const slow = bytes / (SLOW_MB_PER_S * MB);
  const fast = bytes / (FAST_MB_PER_S * MB);
  if (slow < 60) return "under a minute";
  const a = durationText(fast).replace(/^about /, "");
  const b = durationText(slow).replace(/^about /, "");
  return a === b ? `about ${a}` : `between ${a} and ${b}`;
}

/**
 * Seconds left, from the speed seen so far. null until enough has been copied
 * for the speed to mean something (a file done and half a minute gone).
 */
export function secondsLeft(
  todoBytes: number,
  copiedBytes: number,
  elapsedSeconds: number,
): number | null {
  if (copiedBytes <= 0 || elapsedSeconds < 30) return null;
  const left = Math.max(0, todoBytes - copiedBytes);
  return left / (copiedBytes / elapsedSeconds);
}

export interface Found {
  /** Files that match (kind, how far back, size), including ones already there. */
  readonly total: number;
  /** Of those, how many are not in the folder yet, and how big they are together. */
  readonly todo: number;
  readonly todoBytes: number;
  /** Left out for being older than the chosen days. */
  readonly older: number;
  /** Left out because of the size choice (the other half). */
  readonly held: number;
}

/** The answer to "Check size first". */
export function previewSentence(
  plural: "photos" | "videos",
  size: SizeChoice,
  f: Found,
): string {
  const other = size === "small" ? "larger" : "smaller";
  const lead =
    f.todo > 0 && f.todoBytes === 0
      ? `${f.todo.toLocaleString("en-US")} ${f.todo === 1 ? plural.slice(0, -1) : plural} to bring in. The phone did not report their sizes, so DateSort cannot say how big they are or how long this will take.`
      : f.todo === 0
        ? `Nothing new to bring in (${f.total.toLocaleString("en-US")} ${plural} here are already copied).`
        : `${f.todo.toLocaleString("en-US")} ${f.todo === 1 ? plural.slice(0, -1) : plural} to bring in, ${sizeText(f.todoBytes)} in all: ${estimateText(f.todoBytes)} at typical cable speed (20 to 40 MB/s; yours may differ).`;
  const parts = [lead];
  if (f.held > 0 && size !== "all") {
    parts.push(`${f.held.toLocaleString("en-US")} ${other} files are left for later.`);
  }
  if (f.older > 0) {
    parts.push(`${f.older.toLocaleString("en-US")} older files are left on the phone.`);
  }
  return parts.join(" ");
}
