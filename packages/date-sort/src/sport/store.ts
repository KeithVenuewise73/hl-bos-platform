/**
 * What the sport feature keeps on this computer, beside DateSort's settings
 * (%LOCALAPPDATA%\DateSort on Windows; never inside HL-BOS's own folder, so
 * an update can never collect or publish it):
 *
 *   claude-key.txt       the Anthropic API key the CEO pasted in once. It is
 *                        only ever read on the server side; the page is told
 *                        whether one is saved, never what it is.
 *   sport-guesses.json   each date's answer, kept with the exact photos it was
 *                        based on, so asking again for the same photos costs
 *                        nothing.
 */

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { settingsDir } from "../copy/settings";
import type { SportGuess } from "./sports";

const KEY_FILE = "claude-key.txt";
const GUESS_FILE = "sport-guesses.json";

/** Anthropic API keys start "sk-ant-"; anything else is refused before it is sent anywhere. */
export function looksLikeKey(key: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key.trim());
}

export async function loadKey(dir: string = settingsDir()): Promise<string | null> {
  try {
    const key = (await readFile(join(dir, KEY_FILE), "utf8")).trim();
    return looksLikeKey(key) ? key : null;
  } catch {
    return null;
  }
}

export async function saveKey(key: string, dir: string = settingsDir()): Promise<void> {
  if (!looksLikeKey(key))
    throw new Error("That does not look like an Anthropic API key.");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, KEY_FILE), `${key.trim()}\n`, { mode: 0o600 });
}

export async function forgetKey(dir: string = settingsDir()): Promise<void> {
  await unlink(join(dir, KEY_FILE)).catch(() => undefined);
}

type Saved = Record<string, { readonly samples: string; readonly guess: SportGuess }>;

async function loadAll(dir: string): Promise<Saved> {
  try {
    const raw = JSON.parse(await readFile(join(dir, GUESS_FILE), "utf8")) as unknown;
    return raw !== null && typeof raw === "object" ? (raw as Saved) : {};
  } catch {
    return {};
  }
}

/** The saved guess for this date, only if it was made from these same photos. */
export async function savedGuess(
  day: string,
  samples: string,
  dir: string = settingsDir(),
): Promise<SportGuess | null> {
  const hit = (await loadAll(dir))[day];
  return hit !== undefined && hit.samples === samples ? hit.guess : null;
}

export async function saveGuess(
  guess: SportGuess,
  samples: string,
  dir: string = settingsDir(),
): Promise<void> {
  const all = await loadAll(dir);
  all[guess.day] = { samples, guess };
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, GUESS_FILE), `${JSON.stringify(all, null, 2)}\n`);
}
