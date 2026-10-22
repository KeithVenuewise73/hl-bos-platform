/**
 * DateSort's remembered choices, kept on this computer only:
 * %LOCALAPPDATA%\DateSort\settings.json on Windows (outside every photo
 * folder and outside HL-BOS's own folder, so updates never touch it).
 *
 * Today it remembers one thing: where the date folders go.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Settings {
  readonly destination: string | null;
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
    };
    return {
      destination: typeof raw.destination === "string" ? raw.destination : null,
    };
  } catch {
    return { destination: null };
  }
}

export async function saveSettings(
  settings: Settings,
  dir: string = settingsDir(),
): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "settings.json"), `${JSON.stringify(settings, null, 2)}\n`);
}
