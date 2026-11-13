/**
 * What DateSort remembers about the website's review area, on this computer
 * only (%LOCALAPPDATA%\DateSort\review.json, beside settings.json):
 *
 *   serviceUrl   the review service's address, once the website has one
 *   key          this computer's own publisher key. It never leaves the
 *                computer; only its fingerprint is sent, once, to connect.
 *   connectedAt  when the website accepted that fingerprint
 */

import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { settingsDir } from "../copy/settings";

export interface ReviewSettings {
  readonly serviceUrl: string | null;
  readonly key: string | null;
  readonly connectedAt: string | null;
}

const EMPTY: ReviewSettings = { serviceUrl: null, key: null, connectedAt: null };
const file = (dir: string) => join(dir, "review.json");

/** Only an https address (or this computer, for testing) is accepted. */
export function cleanServiceUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw.trim());
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !(local && u.protocol === "http:")) return null;
    return u.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export async function loadReview(dir: string = settingsDir()): Promise<ReviewSettings> {
  try {
    const raw = JSON.parse(await readFile(file(dir), "utf8")) as Record<
      string,
      unknown
    >;
    return {
      serviceUrl: cleanServiceUrl(raw["serviceUrl"]),
      key:
        typeof raw["key"] === "string" && raw["key"].length >= 40 ? raw["key"] : null,
      connectedAt: typeof raw["connectedAt"] === "string" ? raw["connectedAt"] : null,
    };
  } catch {
    return EMPTY;
  }
}

export async function saveReview(
  s: ReviewSettings,
  dir: string = settingsDir(),
): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(file(dir), `${JSON.stringify(s, null, 2)}\n`, { mode: 0o600 });
  await chmod(file(dir), 0o600).catch(() => undefined); // not meaningful on Windows
}

/** This computer's key: made once, then kept. */
export async function ensureKey(dir: string = settingsDir()): Promise<ReviewSettings> {
  const s = await loadReview(dir);
  if (s.key !== null) return s;
  const next = { ...s, key: randomBytes(32).toString("base64url") };
  await saveReview(next, dir);
  return next;
}
