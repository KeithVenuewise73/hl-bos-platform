import type { Quality } from "@hl-bos/game-cut";

/**
 * Reading what the page sent. Everything is checked: the page is ours, but the
 * server does not trust it (another program on this computer could call it).
 */

const WINDOWS_OR_POSIX_ABSOLUTE = /^[A-Za-z]:[\\/]|^\\\\|^\//;

export function asPath(v: unknown): string | null {
  return typeof v === "string" &&
    v.trim() !== "" &&
    WINDOWS_OR_POSIX_ABSOLUTE.test(v.trim())
    ? v.trim()
    : null;
}

export function asQuality(v: unknown): Quality {
  return v === "draft" ? "draft" : "full";
}

/** A quiet-cut choice: a number of seconds from 10 to 3600, or null for "keep everything". */
export function asQuietCut(v: unknown): number | null {
  if (v === null || v === "never") return null;
  return typeof v === "number" && Number.isFinite(v) && v >= 10 && v <= 3600 ? v : 90;
}

/** Seconds kept before or after a time: 0 to 120, whatever else falls back. */
export function asPadding(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 120
    ? v
    : fallback;
}

/** The typed list of times: text, at most 20,000 characters. */
export function asTimesText(v: unknown): string | null {
  return typeof v === "string" && v.length <= 20_000 ? v : null;
}
