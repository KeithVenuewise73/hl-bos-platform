/**
 * A written record of every file freed from a card: what it was, its
 * fingerprint, and where its verified copy is. Appended to a file in
 * DateSort's own settings folder (the same place settings.json lives), one
 * line of JSON per file, BEFORE the file is removed, so the record exists even
 * if the power goes out half way.
 */

import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

import { settingsDir } from "../copy/settings";

export interface LogLine {
  readonly at: string;
  readonly action: "removing" | "removed" | "failed";
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
  readonly driveCopy: string;
  readonly onFiveStar: boolean;
  readonly note?: string;
}

export function logFile(dir: string = settingsDir()): string {
  return join(dir, "freed-from-card.log");
}

export async function writeLog(
  line: LogLine,
  dir: string = settingsDir(),
): Promise<void> {
  await mkdir(dir, { recursive: true });
  await appendFile(logFile(dir), `${JSON.stringify(line)}\n`, "utf8");
}
