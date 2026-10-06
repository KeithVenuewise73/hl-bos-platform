/** Display helpers. Pure; used by server and client components alike. */

import { longDay } from "@hl-bos/jersey-sort/folder-check";

/** "2026-10-03" -> "October 3, 2026". Parsed by hand: no time zone can shift the day. */
export function longDate(isoDay: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(isoDay) ? longDay(isoDay.slice(0, 10)) : isoDay;
}

/** "2026-10-03T19:31:05" -> "October 3, 2026 · 7:31 PM" */
export function longDateTime(local: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (m === null) return longDate(local);
  const h = Number(m[2]);
  return `${longDate(m[1] ?? "")} · ${h % 12 === 0 ? 12 : h % 12}:${m[3]} ${h < 12 ? "AM" : "PM"}`;
}

export function count(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

export function bytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** Only ever redirect to a path inside this app. */
export function safeReturn(raw: unknown, fallback = "/"): string {
  if (typeof raw !== "string") return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\"))
    return fallback;
  return raw.slice(0, 500);
}

export function withParam(path: string, key: string, value: string): string {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set(key, value);
  return `${base ?? "/"}?${params.toString()}`;
}

export const STATUS_LABEL: Readonly<Record<string, string>> = {
  uploaded: "Uploaded",
  queued: "Queued",
  processing: "Analyzing",
  completed: "Sorted",
  needs_review: "Needs review",
  failed: "Failed",
};
