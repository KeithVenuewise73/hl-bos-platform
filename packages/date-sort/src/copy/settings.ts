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
    };
    return {
      destination: typeof raw.destination === "string" ? raw.destination : null,
      eventNames: cleanEventNames(raw.eventNames),
    };
  } catch {
    return { destination: null, eventNames: {} };
  }
}

export async function saveSettings(
  settings: Settings,
  dir: string = settingsDir(),
): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "settings.json"), `${JSON.stringify(settings, null, 2)}\n`);
}
