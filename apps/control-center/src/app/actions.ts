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
// eslint-disable-next-line @typescript-eslint/require-await -- Next.js Server Actions must be async, even when the body is synchronous.
export async function refresh(): Promise<void> {
  revalidatePath("/");
}

/**
 * Approve and merge.
 *
 * This IS the CEO's approval. So it re-checks GitHub immediately before acting
 * rather than trusting what the page said when it rendered -- a dashboard can
 * be minutes stale, and "it was green when I looked" is not a good reason to
 * have merged something red.
 */
export async function approveMerge(
  number: number,
  title: string,
): Promise<ActionResult> {
  const { pullRequestIsMergeable, mergePullRequest } = await import("@/lib/github");
  const status = await repoStatus();
  if (!status.slug) {
    return {
      ok: false,
      headline: "This folder is not linked to GitHub.",
      meaning: "Nothing to merge.",
      detail: "",
    };
  }

  const check = await pullRequestIsMergeable(status.slug, number);
  if (!check.ready) {
    return {
      ok: false,
      headline: "Not ready to merge yet.",
      meaning: check.reason,
      detail: check.reason,
    };
  }

  const merged = await mergePullRequest(status.slug, number, title);
  revalidatePath("/");
  if (!merged.ok) {
    return {
      ok: false,
      headline: "GitHub would not complete the merge.",
      meaning: merged.reason,
      detail: merged.reason,
    };
  }
  return ok(
    "Merged. It is part of the product now.",
    "The change is on the main line. Nothing is deployed to customers by this — releasing is a separate decision.",
    `merge commit ${merged.sha}`,
  );
}

/** A form field is a string or a File; treat anything that is not a string as empty. */
function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Save connection tokens. The console writes the file; no editor, no terminal. */
export async function saveConnection(form: FormData): Promise<ActionResult> {
  const { writeEnvValues } = await import("@/lib/secrets");
  const values: Record<string, string> = {};
  const gh = field(form, "github");
  const sb = field(form, "supabase");
  const ref = field(form, "ref");
  if (gh) values["HLBOS_GITHUB_TOKEN"] = gh;
  if (sb) values["SUPABASE_ACCESS_TOKEN"] = sb;
  if (ref) values["HLBOS_SUPABASE_PROJECT_REF"] = ref;

  if (Object.keys(values).length === 0) {
    return {
      ok: false,
      headline: "Nothing to save.",
      meaning: "No token was entered.",
      detail: "",
    };
  }
  await writeEnvValues(values);
  revalidatePath("/");
  revalidatePath("/connect");
  return ok(
    "Connected.",
    "The console can now see your builds. This is stored on this machine only and is never committed.",
    Object.keys(values).join(", ") + " saved",
  );
}
