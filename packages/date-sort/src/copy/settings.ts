/**
 * DateSort's remembered choices, kept on this computer only:
 * %LOCALAPPDATA%\DateSort\settings.json on Windows (outside every photo
 * folder and outside HL-BOS's own folder, so updates never touch it).
 *
 * It remembers where the date folders go, and the event names typed on the
 * date cards (by date), so a refreshed page or a restart does not forget
 * them. A forgotten name once made a second, plain "<date>" folder beside
 * the named one.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Settings {
  readonly destination: string | null;
  /** Event name per date ("2026-10-04" -> "Caz vs Wheatfield"). */
  readonly eventNames: Readonly<Record<string, string>>;
  /** Where the iPhone's PHOTOS are kept (copied from the phone). */
  readonly iphoneFolder?: string | null;
  /** Where the iPhone's VIDEOS are kept: its own folder, so the two never mix. */
  readonly iphoneVideoFolder?: string | null;
  /** Where the one-button phone import keeps everything: a folder per phone inside it. */
  readonly iphoneBase?: string | null;
  /** The phones the owner has named ("Game phone 13 Pro"): Windows calls every one "Apple iPhone". */
  readonly iphonePhones?: readonly string[];
  /** When each named phone was last brought in (ISO time), so the next time only asks for what is new. */
  readonly iphoneLast?: Readonly<Record<string, string>>;
  /**
   * Phones the owner has said are used for nothing but 5 Star. Every other phone is treated as shared
   * with family: only the days the owner ticks are brought in from it.
   */
  readonly iphoneWorkOnly?: readonly string[];
}

/** A phone's name is a short plain label; it becomes a folder name, so nothing odd is kept. */
export function cleanPhoneName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const n = raw.replace(/\s+/g, " ").trim();
  return n.length >= 1 && n.length <= 40 && /^[A-Za-z0-9][A-Za-z0-9 ._()+-]*$/.test(n)
    ? n.replace(/[. ]+$/, "")
    : null;
}

/** The named phones: unique, at most 12. */
export function cleanPhones(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const r of raw) {
    const n = cleanPhoneName(r);
    if (n !== null && n !== "" && !out.some((o) => o.toLowerCase() === n.toLowerCase()))
      out.push(n);
    if (out.length >= 12) break;
  }
  return out;
}

/** The phones marked "only for 5 Star": only named phones count. */
export function cleanWorkOnly(raw: unknown, phones: readonly string[]): string[] {
  return cleanPhones(raw).filter((n) => phones.includes(n));
}

/** When each phone was last brought in: only real times, only for the named phones. */
export function cleanLast(
  raw: unknown,
  phones: readonly string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw === null || typeof raw !== "object") return out;
  for (const [name, at] of Object.entries(raw as Record<string, unknown>)) {
    if (
      phones.includes(name) &&
      typeof at === "string" &&
      Number.isFinite(Date.parse(at))
    )
      out[name] = new Date(at).toISOString();
  }
  return out;
}

/** Only real dates and short names are kept from whatever is in the file. */
export function cleanEventNames(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw === null || typeof raw !== "object") return out;
  for (const [day, name] of Object.entries(raw as Record<string, unknown>)) {
    if (
      /^\d{4}-\d{2}-\d{2}$/.test(day) &&
      typeof name === "string" &&
      name.trim() !== ""
    ) {
      out[day] = name.slice(0, 200);
    }
  }
  return out;
}

/** %LOCALAPPDATA%\DateSort on Windows; ~/.config/datesort elsewhere. */
export function settingsDir(): string {
  return process.platform === "win32"
    ? join(homedir(), "AppData", "Local", "DateSort")
    : join(homedir(), ".config", "datesort");
}

export async function loadSettings(dir: string = settingsDir()): Promise<Settings> {
  try {
    const raw = JSON.parse(await readFile(join(dir, "settings.json"), "utf8")) as {
      destination?: unknown;
      eventNames?: unknown;
      iphoneFolder?: unknown;
      iphoneVideoFolder?: unknown;
      iphoneBase?: unknown;
      iphonePhones?: unknown;
      iphoneLast?: unknown;
      iphoneWorkOnly?: unknown;
    };
    const phones = cleanPhones(raw.iphonePhones);
    return {
      destination: typeof raw.destination === "string" ? raw.destination : null,
      eventNames: cleanEventNames(raw.eventNames),
      iphoneFolder: typeof raw.iphoneFolder === "string" ? raw.iphoneFolder : null,
      iphoneVideoFolder:
        typeof raw.iphoneVideoFolder === "string" ? raw.iphoneVideoFolder : null,
      iphoneBase: typeof raw.iphoneBase === "string" ? raw.iphoneBase : null,
      iphonePhones: phones,
      iphoneLast: cleanLast(raw.iphoneLast, phones),
      iphoneWorkOnly: cleanWorkOnly(raw.iphoneWorkOnly, phones),
    };
  } catch {
    return {
      destination: null,
      eventNames: {},
      iphoneFolder: null,
      iphoneVideoFolder: null,
      iphoneBase: null,
      iphonePhones: [],
      iphoneLast: {},
      iphoneWorkOnly: [],
    };
  }
}

export async function saveSettings(
  settings: Settings,
  dir: string = settingsDir(),
): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "settings.json"), `${JSON.stringify(settings, null, 2)}\n`);
}
