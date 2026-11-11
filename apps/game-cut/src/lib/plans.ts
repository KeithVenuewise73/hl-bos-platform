import "server-only";

import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { Analysis, HighlightPlanResult, Quality } from "@hl-bos/game-cut";

/**
 * Plans waiting to be made. A plan is the whole result of the (slow) looking
 * step, which for two long games takes the better part of an hour; making the
 * video later, or adding moments to it, reuses it instead of looking again.
 *
 * Kept in memory AND saved on this computer, so closing Game Cut, a restart or a
 * Windows update does not throw away half an hour of work. Only the last few are
 * kept. A plan names the video files; if they have moved it says so when used.
 */

export type StoredPlan =
  | {
      readonly kind: "broadcast";
      readonly id: string;
      readonly fileA: string;
      readonly fileB: string;
      readonly analysis: Analysis;
    }
  | {
      readonly kind: "times";
      readonly id: string;
      readonly fileA: string;
      /** Null with one camera. */
      readonly fileB: string | null;
      readonly plan: HighlightPlanResult;
    };

const KEEP = 10;
const g = globalThis as unknown as {
  __gameCutPlans?: Map<string, StoredPlan>;
  __gameCutPlanN?: number;
  __gameCutPlanDir?: string;
};
const memory = (g.__gameCutPlans ??= new Map<string, StoredPlan>());

/** %LOCALAPPDATA%\GameCut\plans on Windows; ~/.config/gamecut/plans elsewhere. */
export function defaultPlansDir(): string {
  return process.platform === "win32"
    ? join(homedir(), "AppData", "Local", "GameCut", "plans")
    : join(homedir(), ".config", "gamecut", "plans");
}

/** Where plans are saved. Tests point this at a temporary folder. */
export function setPlansDir(dir: string | null): void {
  if (dir === null) delete g.__gameCutPlanDir;
  else g.__gameCutPlanDir = dir;
  memory.clear();
}
const dir = () => g.__gameCutPlanDir ?? defaultPlansDir();

export function newPlanId(): string {
  g.__gameCutPlanN = (g.__gameCutPlanN ?? 0) + 1;
  // Time first, so ids from different runs never collide and sort in the order made.
  return `plan-${Date.now().toString(36)}-${g.__gameCutPlanN}`;
}

const SAFE_ID = /^plan-[a-z0-9-]+$/;

/** Only what looks like a plan we saved is accepted back from disk. */
function looksLikePlan(v: unknown): v is StoredPlan {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  if (
    typeof p["id"] !== "string" ||
    !SAFE_ID.test(p["id"]) ||
    typeof p["fileA"] !== "string"
  )
    return false;
  if (p["kind"] === "broadcast")
    return (
      typeof p["fileB"] === "string" &&
      typeof p["analysis"] === "object" &&
      p["analysis"] !== null
    );
  if (p["kind"] === "times") return typeof p["plan"] === "object" && p["plan"] !== null;
  return false;
}

export async function savePlan(p: StoredPlan): Promise<void> {
  memory.set(p.id, p);
  try {
    await mkdir(dir(), { recursive: true });
    await writeFile(join(dir(), `${p.id}.json`), JSON.stringify(p));
    const files = (await readdir(dir())).filter((f) => f.endsWith(".json"));
    if (files.length > KEEP) {
      const dated = await Promise.all(
        files.map(async (f) => ({ f, t: (await stat(join(dir(), f))).mtimeMs })),
      );
      dated.sort((a, b) => a.t - b.t);
      for (const old of dated.slice(0, dated.length - KEEP)) {
        await rm(join(dir(), old.f), { force: true });
        memory.delete(old.f.replace(/\.json$/, ""));
      }
    }
  } catch {
    // Not saving is not a reason to lose the plan: it is still in memory.
  }
}

export async function getPlan(id: string): Promise<StoredPlan | undefined> {
  const held = memory.get(id);
  if (held !== undefined) return held;
  if (!SAFE_ID.test(id)) return undefined;
  try {
    const parsed: unknown = JSON.parse(
      await readFile(join(dir(), `${id}.json`), "utf8"),
    );
    if (looksLikePlan(parsed) && parsed.id === id) {
      memory.set(id, parsed);
      return parsed;
    }
  } catch {
    // not there, or not readable: it is simply not available
  }
  return undefined;
}

/** The most recently made plan, from this run or an earlier one. */
export async function latestPlan(): Promise<StoredPlan | undefined> {
  let best: { id: string; t: number } | null = null;
  try {
    for (const f of await readdir(dir())) {
      if (!f.endsWith(".json")) continue;
      const t = (await stat(join(dir(), f))).mtimeMs;
      if (best === null || t > best.t) best = { id: f.replace(/\.json$/, ""), t };
    }
  } catch {
    // no folder yet: nothing saved
  }
  if (best !== null) return getPlan(best.id);
  // Nothing on disk (saving failed?): the newest held in memory.
  let last: StoredPlan | undefined;
  for (const p of memory.values()) last = p;
  return last;
}

export type { Quality };
