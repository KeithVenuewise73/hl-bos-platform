/** Words for times and sizes, shared by the page and its tests. */

/** 4400 -> "1:13:20"; 754 -> "12:34"; 9 -> "0:09". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

/** 9_400_000_000 -> "8.8 GB"; 800_000 -> "1 MB". */
export function sizeText(bytes: number): string {
  const GB = 1024 ** 3;
  const MB = 1024 ** 2;
  return bytes >= GB
    ? `${(bytes / GB).toFixed(1)} GB`
    : `${Math.max(1, Math.round(bytes / MB)).toLocaleString("en-US")} MB`;
}

/** Rough size of a finished video: full about 1.3 MB/s, draft about 0.6 MB/s. Said as "about". */
export function estimateBytes(seconds: number, quality: "full" | "draft"): number {
  return seconds * (quality === "draft" ? 0.58e6 : 1.28e6);
}

/**
 * How long is left, from how far along it is. Null until enough has happened for
 * the guess to mean anything (a few percent and 20 seconds in).
 */
export function secondsLeft(fraction: number, elapsedSeconds: number): number | null {
  if (fraction < 0.03 || elapsedSeconds < 20 || fraction >= 1) return null;
  return (elapsedSeconds * (1 - fraction)) / fraction;
}

/** 5400 -> "about 1 hour 30 minutes"; 90 -> "about 2 minutes"; 20 -> "less than a minute". */
export function durationWords(seconds: number): string {
  if (seconds < 60) return "less than a minute";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `about ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = `${h} ${h === 1 ? "hour" : "hours"}`;
  return m === 0 ? `about ${hours}` : `about ${hours} ${m} minutes`;
}
