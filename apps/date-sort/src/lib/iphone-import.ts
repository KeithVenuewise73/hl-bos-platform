/**
 * The one-button phone import: what it brings in, where each kind goes, and how far back to look.
 *
 * One press brings in everything new from the phone that is plugged in, in three steps that use the
 * same copy as the older buttons: short clips (under 1 GB), then photos, then game footage (over
 * 1 GB). Each phone has its own folder, because Windows calls every iPhone "Apple iPhone" and two
 * phones number their files alike (IMG_0124.MOV on both). Nothing here touches the phone.
 */

import { sizeText, type SizeChoice } from "./iphone-progress.ts";
import type { IphoneKind } from "./iphone-script.ts";

export type StepId = "clips" | "photos" | "games";

export interface ImportChoices {
  readonly clips: boolean;
  readonly photos: boolean;
  readonly games: boolean;
}

export const ALL_CHOICES: ImportChoices = { clips: true, photos: true, games: true };

export interface ImportStep {
  readonly id: StepId;
  readonly kind: IphoneKind;
  readonly size: SizeChoice;
  /** The folder this step keeps its files in. */
  readonly folder: string;
  /** "short clips", "photos", "game footage". */
  readonly title: string;
}

const SUBFOLDER: Record<StepId, string> = {
  clips: "Short Clips",
  photos: "Photos",
  games: "Game Footage",
};

const TITLE: Record<StepId, string> = {
  clips: "short clips",
  photos: "photos",
  games: "game footage",
};

const sepOf = (p: string) => (p.includes("\\") || !p.includes("/") ? "\\" : "/");

/** "D:\Phones" + "Game phone" + "Short Clips" -> "D:\Phones\Game phone\Short Clips". */
export function phoneFolder(base: string, phone: string, sub: string): string {
  const b = base.trim().replace(/[\\/]+$/, "");
  const s = sepOf(b);
  return `${b}${s}${phone}${s}${sub}`;
}

/** The three folders a phone's imports go to. */
export function phoneFolders(base: string, phone: string): Record<StepId, string> {
  return {
    clips: phoneFolder(base, phone, SUBFOLDER.clips),
    photos: phoneFolder(base, phone, SUBFOLDER.photos),
    games: phoneFolder(base, phone, SUBFOLDER.games),
  };
}

/** Short clips first (the quick ones, and what goes to 5Star), game footage last (it is the long one). */
export function importSteps(
  base: string,
  phone: string,
  choices: ImportChoices,
): ImportStep[] {
  const f = phoneFolders(base, phone);
  const all: ImportStep[] = [
    { id: "clips", kind: "videos", size: "small", folder: f.clips, title: TITLE.clips },
    {
      id: "photos",
      kind: "photos",
      size: "all",
      folder: f.photos,
      title: TITLE.photos,
    },
    { id: "games", kind: "videos", size: "large", folder: f.games, title: TITLE.games },
  ];
  return all.filter((s) => choices[s.id]);
}

/** The first time a phone is brought in: a month back, not years of old pictures. */
export const FIRST_TIME_DAYS = 30;
/** Never look back less than this: the phone groups by month, and a clip may be added late. */
const MIN_DAYS = 7;
const SLACK_DAYS = 3;
const DAY_MS = 86_400_000;

/**
 * How many days back to ask the phone for. After a first import it is the time since the last one
 * (plus a few days' slack, and files already in the folder are skipped anyway); the first time, or
 * when the last time is unknown, a month.
 */
export function lookBackDays(lastIso: string | null | undefined, now: Date): number {
  if (typeof lastIso !== "string") return FIRST_TIME_DAYS;
  const at = Date.parse(lastIso);
  if (!Number.isFinite(at) || at > now.getTime()) return FIRST_TIME_DAYS;
  const days = Math.ceil((now.getTime() - at) / DAY_MS) + SLACK_DAYS;
  return Math.min(3650, Math.max(MIN_DAYS, days));
}

/** What the person is told about how far back, in words. */
export function lookBackSentence(
  lastIso: string | null | undefined,
  days: number,
): string {
  return typeof lastIso === "string" && days !== FIRST_TIME_DAYS
    ? `Looking for what is new since the last time (about ${days} days back).`
    : `First time for this phone: looking back ${FIRST_TIME_DAYS} days.`;
}

/** What one step came to. */
export interface StepResult {
  readonly step: ImportStep;
  readonly copied: number;
  readonly already: number;
  readonly conflicts: number;
  readonly failed: readonly string[];
  readonly short: readonly string[];
  readonly bytes: number;
  /** Files the phone had that were not yet in the folder, when the step began (from the size check). */
  readonly todo: number;
  readonly todoBytes: number;
}

const n = (v: number) => v.toLocaleString("en-US");

/** "12 short clips", "1 game recording": the thing counted, in words. */
export function noun(step: ImportStep, count: number): string {
  const one =
    step.id === "clips"
      ? "short clip"
      : step.id === "games"
        ? "game recording"
        : "photo";
  return `${n(count)} ${count === 1 ? one : `${one}s`}`;
}

/** The answer to "Check first": what would come across, step by step. */
export function checkSentence(results: readonly StepResult[]): string {
  const parts = results.map((r) =>
    r.todo === 0
      ? `no new ${r.step.title}`
      : `${noun(r.step, r.todo)}${r.todoBytes > 0 ? ` (${sizeText(r.todoBytes)})` : ""}`,
  );
  const total = results.reduce((a, r) => a + r.todoBytes, 0);
  const sum = results.reduce((a, r) => a + r.todo, 0);
  if (sum === 0) return "Nothing new to bring in from this phone.";
  return `New on this phone: ${parts.join(", ")}.${total > 0 ? ` ${sizeText(total)} in all.` : ""}`;
}

/** The lines shown when the import has finished. */
export function doneLines(results: readonly StepResult[]): string[] {
  const lines: string[] = [];
  for (const r of results) {
    const bits = [`${noun(r.step, r.copied)} brought in`];
    if (r.already > 0) bits.push(`${n(r.already)} already there`);
    lines.push(`${bits.join(", ")}.`);
    if (r.failed.length > 0)
      lines.push(
        `${noun(r.step, r.failed.length)} could not be copied (${r.failed.slice(0, 3).join(", ")}${r.failed.length > 3 ? " and others" : ""}). Press the button again to retry just those.`,
      );
    if (r.short.length > 0)
      lines.push(
        `${noun(r.step, r.short.length)} in the folder ${r.short.length === 1 ? "was" : "were"} cut short by an earlier copy; the button finishes ${r.short.length === 1 ? "it" : "them"}.`,
      );
    if (r.conflicts > 0)
      lines.push(
        `${noun(r.step, r.conflicts)} ${r.conflicts === 1 ? "has" : "have"} the same name as a different file already in the folder and ${r.conflicts === 1 ? "was" : "were"} left alone.`,
      );
  }
  return lines;
}

/** True when the whole import went through with nothing left to retry. */
export function isClean(results: readonly StepResult[]): boolean {
  return results.every((r) => r.failed.length === 0 && r.short.length === 0);
}

/** The live line: one plain sentence, whatever step it is in. */
export function liveLine(
  step: ImportStep,
  index: number,
  total: number,
  done: number,
  todo: number,
  bytesLeftSeconds: number | null,
): string {
  const where = total > 1 ? `Step ${index + 1} of ${total}: ` : "";
  const left =
    bytesLeftSeconds === null
      ? ""
      : `, ${bytesLeftSeconds < 90 ? "about a minute" : `about ${Math.round(bytesLeftSeconds / 60)} minutes`} left`;
  return todo > 0
    ? `${where}bringing in ${step.title}: ${n(done)} of ${n(todo)}${left}`
    : `${where}looking at the phone for ${step.title}…`;
}

/**
 * Where to suggest keeping phone imports: a "Phone Imports" folder beside the old iPhone photos
 * folder (so on the same big drive), never on C: or OneDrive. null when there is nothing to go by.
 */
export function defaultBaseFolder(
  photosFolder: string | null | undefined,
  warning: (folder: string) => string | null,
): string | null {
  if (typeof photosFolder !== "string" || photosFolder.trim() === "") return null;
  const trimmed = photosFolder.trim().replace(/[\\/]+$/, "");
  const cut = Math.max(trimmed.lastIndexOf("\\"), trimmed.lastIndexOf("/"));
  if (cut <= 0) return null;
  const candidate = `${trimmed.slice(0, cut)}${sepOf(trimmed)}Phone Imports`;
  return warning(candidate) === null ? candidate : null;
}

/** One day on the phone: how many photos, short clips and game recordings, and how big together. */
export interface DayRow {
  /** yyyy-MM-dd, or "none" when the phone gives these files no date. */
  readonly d: string;
  readonly p: number;
  readonly c: number;
  readonly g: number;
  readonly b: number;
}

/** The day that stands for files the phone gives no date: never brought in. */
export const NO_DATE = "none";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2026-11-23" -> "Mon, Nov 23, 2026". */
export function dayLabel(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (m === null) return d;
  const at = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${WEEKDAYS[at.getUTCDay()]}, ${MONTHS[at.getUTCMonth()]} ${at.getUTCDate()}, ${m[1]}`;
}

/** "3 short clips, 12 photos, 1 game recording (3.2 GB)": what is on the phone for that day. */
export function dayContents(r: DayRow): string {
  const bits: string[] = [];
  if (r.c > 0) bits.push(`${n(r.c)} short ${r.c === 1 ? "clip" : "clips"}`);
  if (r.g > 0) bits.push(`${n(r.g)} game ${r.g === 1 ? "recording" : "recordings"}`);
  if (r.p > 0) bits.push(`${n(r.p)} ${r.p === 1 ? "photo" : "photos"}`);
  return `${bits.join(", ")}${r.b > 0 ? ` (${sizeText(r.b)})` : ""}`;
}

/** Newest day first; the "no date" row last, and never offered to tick. */
export function sortDays(rows: readonly DayRow[]): DayRow[] {
  return [...rows].sort((a, b) =>
    a.d === NO_DATE ? 1 : b.d === NO_DATE ? -1 : b.d.localeCompare(a.d),
  );
}

/** What the "Bring in" button says for a shared phone, and whether it can be pressed. */
export function pickedSentence(count: number): string {
  return count === 0
    ? "Tick the days to bring in. Nothing comes across from days you leave unticked."
    : `Bring in ${count === 1 ? "the 1 day" : `the ${count} days`} ticked.`;
}

/** What sorting by length did, in plain words. `apply` false = only counted. */
export function sortSentence(
  r: {
    readonly looked: number;
    readonly long: number;
    readonly moved: number;
    readonly conflicts: number;
    readonly unreadable: number;
  },
  apply: boolean,
): string {
  if (r.long === 0)
    return `Looked at ${n(r.looked)} ${r.looked === 1 ? "video" : "videos"}: all are short clips (3 minutes or less).${r.unreadable > 0 ? ` ${n(r.unreadable)} could not be read and were left alone.` : ""}`;
  const base = apply
    ? `${n(r.moved)} of ${n(r.long)} ${r.long === 1 ? "video is" : "videos are"} longer than 3 minutes, so ${r.moved === 1 ? "it was" : "they were"} moved from Short Clips to Game Footage (they are game recordings; GameCut can join them).`
    : `${n(r.long)} ${r.long === 1 ? "video is" : "videos are"} longer than 3 minutes and would move from Short Clips to Game Footage.`;
  const extra: string[] = [];
  if (r.conflicts > 0)
    extra.push(
      `${n(r.conflicts)} ${r.conflicts === 1 ? "was" : "were"} left in place because Game Footage already has a file with that name`,
    );
  if (r.unreadable > 0)
    extra.push(
      `${n(r.unreadable)} could not be read and ${r.unreadable === 1 ? "was" : "were"} left alone`,
    );
  return extra.length > 0 ? `${base} ${extra.join("; ")}.` : base;
}
