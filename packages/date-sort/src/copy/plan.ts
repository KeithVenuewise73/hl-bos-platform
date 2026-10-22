/**
 * What a copy WILL do, decided before a single byte moves. Pure: no disk.
 *
 *   - the folder name for a shooting date ("2026-10-04" or
 *     "2026-10-04 - Caz vs Wheatfield"), safe for Windows;
 *   - which photos go in it, and the name each copy gets;
 *   - whether a destination is allowed at all.
 *
 * Copy names: a copy keeps its original's name. Canon restarts numbering
 * after IMG_9999 and two cameras can both write IMG_0001.JPG, so one shooting
 * date can hold two DIFFERENT photos with the same name. The second (in a
 * fixed order: by path inside the scanned folder) is copied as
 * "IMG_0001 (2).JPG". The order is fixed so that copying again gives every
 * photo the same name it got the first time, and finds it already there.
 * Originals are never renamed: only the copy's name differs.
 */

import type { ScannedPhoto } from "../report";

/** Characters Windows does not allow in a file or folder name. */
const ILLEGAL = /[<>:"/\\|?*]/g;
/** Names Windows reserves for devices, with or without an extension. */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const MAX_EVENT_NAME = 80;

/** An event name made safe for a folder name; "" when nothing usable is left. */
export function cleanEventName(name: string): string {
  // Control characters (codes below 32) are not allowed either.
  const visible = [...name].map((c) => (c.charCodeAt(0) < 32 ? " " : c)).join("");
  let s = visible.replace(ILLEGAL, " ").replace(/\s+/g, " ").trim();
  if (s.length > MAX_EVENT_NAME) s = s.slice(0, MAX_EVENT_NAME).trim();
  s = s.replace(/[. ]+$/, ""); // Windows drops trailing dots and spaces
  return RESERVED.test(s) ? `${s}_` : s;
}

/** "2026-10-04" or "2026-10-04 - Caz vs Wheatfield". */
export function folderName(day: string, eventName = ""): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`Not a date: ${day}`);
  const clean = cleanEventName(eventName);
  return clean === "" ? day : `${day} - ${clean}`;
}

/** The last part of a path, whichever separator it uses. */
export function baseName(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

function withSuffix(name: string, n: number): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
}

export interface PlannedCopy {
  /** Path inside the scanned folder, as the scan reported it. */
  readonly source: string;
  /** File name the copy gets inside the date folder. */
  readonly name: string;
  readonly size: number;
}

/** Every photo taken on `day`, with the name its copy gets. */
export function planDay(photos: readonly ScannedPhoto[], day: string): PlannedCopy[] {
  const chosen = photos
    .filter((p) => p.takenAt !== null && p.takenAt.slice(0, 10) === day)
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const used = new Set<string>();
  const out: PlannedCopy[] = [];
  for (const p of chosen) {
    const original = baseName(p.path);
    let name = original;
    // Windows treats IMG_0001.JPG and img_0001.jpg as the same file.
    for (let n = 2; used.has(name.toLowerCase()); n++) name = withSuffix(original, n);
    used.add(name.toLowerCase());
    out.push({ source: p.path, name, size: p.size });
  }
  return out;
}

/**
 * Is `child` the same folder as `parent`, or inside it? Compares Windows
 * paths case-insensitively and ignores trailing separators. Pure string
 * work on absolute paths.
 */
export function isInside(child: string, parent: string): boolean {
  const norm = (p: string) => {
    let s = p.replace(/\//g, "\\").replace(/\\+$/, "");
    if (/^[a-z]:/i.test(s)) s = s.toLowerCase();
    return s;
  };
  const c = norm(child);
  const pa = norm(parent);
  return c === pa || c.startsWith(`${pa}\\`);
}
