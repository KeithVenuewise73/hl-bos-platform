/**
 * The Claude key DateSort saved on this laptop, so the CEO pastes it once.
 *
 * DateSort keeps it in %LOCALAPPDATA%\DateSort\claude-key.txt (on Windows;
 * ~/.config/datesort elsewhere), outside HL-BOS's folder. JerseySort only
 * READS it, and only when no ANTHROPIC_API_KEY is set. The location is
 * written out here rather than imported, so the two apps still share no code.
 *
 * Free of `server-only` so it can be tested.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export function dateSortKeyFile(
  home: string = homedir(),
  platform: NodeJS.Platform = process.platform,
): string {
  return platform === "win32"
    ? path.join(home, "AppData", "Local", "DateSort", "claude-key.txt")
    : path.join(home, ".config", "datesort", "claude-key.txt");
}

/** The saved key, or undefined if there is none (or it is not a key). */
export function readSharedKey(file: string = dateSortKeyFile()): string | undefined {
  try {
    const key = readFileSync(file, "utf8").trim();
    return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key) ? key : undefined;
  } catch {
    return undefined;
  }
}
