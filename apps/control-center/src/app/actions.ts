"use server";

import { revalidatePath } from "next/cache";
import { cmd } from "@/lib/shell";
import { repoStatus } from "@/lib/git";
import { explain, type Explained } from "@/lib/translate";

export interface ActionResult {
  ok: boolean;
  /** Plain English. Always safe to show the CEO. */
  headline: string;
  meaning: string;
  /** Raw output, collapsed behind "show details". */
  detail: string;
  /** Where to go next, if this action produced somewhere to go. */
  href?: string;
}

function ok(
  headline: string,
  meaning: string,
  detail: string,
  href?: string,
): ActionResult {
  // exactOptionalPropertyTypes: `href: undefined` is not the same as absent.
  // Spread it in only when it exists.
  return { ok: true, headline, meaning, detail, ...(href ? { href } : {}) };
}
function fail(raw: string): ActionResult {
  const e: Explained = explain(raw);
  return { ok: false, headline: e.headline, meaning: e.meaning, detail: e.detail };
}

/** Build the software. */
export async function buildProject(): Promise<ActionResult> {
  const r = await cmd("pnpm", ["build"], { timeoutMs: 600_000 });
  revalidatePath("/");
  return r.ok
    ? ok(
        "The software built successfully.",
        "Everything compiles. Nothing to do.",
        r.output,
      )
    : fail(r.output);
}

/** Run the tests. */
export async function runTests(): Promise<ActionResult> {
  const r = await cmd("pnpm", ["test"], { timeoutMs: 600_000 });
  revalidatePath("/");
  return r.ok
    ? ok(
        "All tests passed.",
        "The software behaves the way it is supposed to.",
        r.output,
      )
    : fail(r.output);
}

/** Check quality gates locally, before GitHub ever sees the code. */
export async function checkQuality(): Promise<ActionResult> {
  const r = await cmd("pnpm", ["check"], { timeoutMs: 900_000 });
  revalidatePath("/");
  return r.ok
    ? ok(
        "Everything passed.",
        "Formatting, code quality, types and tests are all clean.",
        r.output,
      )
    : fail(r.output);
}

/** Send this machine's work to GitHub. */
export async function pushChanges(): Promise<ActionResult> {
  const status = await repoStatus();
  const push = await cmd("git", ["push", "-u", "origin", status.branch], {
    timeoutMs: 180_000,
  });
  revalidatePath("/");
  if (!push.ok) return fail(push.output);
  return ok(
    "Your work is now on GitHub.",
    "The automated checks have started. They usually take a few minutes.",
    push.output,
    status.slug
      ? `https://github.com/${status.slug}/pull/new/${status.branch}`
      : undefined,
  );
}

/** Save work in progress. */
export async function saveWork(message: string): Promise<ActionResult> {
  const msg = message.trim();
  if (msg === "") {
    return {
      ok: false,
      headline: "A short description is needed.",
      meaning: "Say what changed, in a few words.",
      detail: "",
    };
  }
  const add = await cmd("git", ["add", "-A"]);
  if (!add.ok) return fail(add.output);
  const c = await cmd("git", ["commit", "-m", msg]);
  revalidatePath("/");
  return c.ok
    ? ok(
        "Saved.",
        "Your changes are recorded. They are not on GitHub until you send them.",
        c.output,
      )
    : fail(c.output);
}

/** Refresh. */
export async function refresh(): Promise<void> {
  revalidatePath("/");
}
