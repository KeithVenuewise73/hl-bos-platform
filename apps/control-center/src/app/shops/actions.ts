"use server";

import { revalidatePath } from "next/cache";
import { cmd } from "@/lib/shell";
import { readEnvFile } from "@/lib/secrets";
import { explain } from "@/lib/translate";
import type { ActionResult } from "@/app/actions";

/**
 * The Shop Analysis page's two real actions.
 *
 * Both shell out to scripts in this repository, the same way "Run tests" does.
 * The heavy one makes outbound requests to third-party websites, which is why
 * it belongs in a child process on the machine the console is running on --
 * and why it cannot run in a cloud build environment at all.
 */

function fail(raw: string): ActionResult {
  const e = explain(raw);
  return { ok: false, headline: e.headline, meaning: e.meaning, detail: e.detail };
}

async function supabaseEnv(): Promise<
  { ok: true; env: Record<string, string> } | { ok: false; result: ActionResult }
> {
  const env = await readEnvFile();
  const token = env["SUPABASE_ACCESS_TOKEN"];
  const ref = env["HLBOS_SUPABASE_PROJECT_REF"];
  if (!token || !ref) {
    return {
      ok: false,
      result: {
        ok: false,
        headline: "Supabase is not connected yet.",
        meaning:
          "The analysis reads and writes the shop data in HL-BOS Core. Add an access " +
          "token and choose the project on Connect accounts, then try again.",
        detail: "",
        href: "/connect",
      },
    };
  }
  return {
    ok: true,
    env: { SUPABASE_ACCESS_TOKEN: token, HLBOS_SUPABASE_PROJECT_REF: ref },
  };
}

/** How many shops each press will attempt. Bounded so a press is predictable. */
const BATCH = 10;

/**
 * Look at the websites of shops nobody has looked at yet, and store what is
 * there.
 *
 * One request per shop with a pause between them. Nothing is retried
 * automatically: a shop whose site did not answer is recorded as unreachable,
 * with no score, which is a true statement and a re-runnable one.
 */
export async function analysePendingShops(): Promise<ActionResult> {
  const e = await supabaseEnv();
  if (!e.ok) return e.result;

  const r = await cmd(
    "node",
    [
      "--experimental-strip-types",
      "scripts/audit-shops.mts",
      "--campaign",
      "wny_barbers_50",
      "--limit",
      String(BATCH),
    ],
    { timeoutMs: 600_000, env: e.env },
  );
  revalidatePath("/shops");

  if (!r.ok) return fail(r.output);

  // The script prints one JSON object per line. Summarise them in plain
  // English rather than showing the CEO a log.
  const lines = r.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("{"));
  let analysed = 0;
  let failed = 0;
  const named: string[] = [];
  for (const l of lines) {
    try {
      const p = JSON.parse(l) as {
        event?: string;
        shop?: string;
        score?: number | null;
      };
      if (p.event === "shop") {
        analysed++;
        if (p.shop)
          named.push(`${p.shop} — ${p.score === null ? "no score" : p.score}`);
      }
      if (p.event === "error") failed++;
    } catch {
      // A line that is not JSON is not a result. Ignore it rather than
      // guessing what it meant.
    }
  }

  if (analysed === 0 && failed === 0) {
    return {
      ok: true,
      headline: "Every shop with a website has already been looked at.",
      meaning:
        "Nothing was left to do. Shops with no website of their own were analysed " +
        "from the list itself and do not need a visit.",
      detail: r.output,
    };
  }
  return {
    ok: true,
    headline: `Looked at ${analysed} shop${analysed === 1 ? "" : "s"}.`,
    meaning:
      named.slice(0, 8).join(" · ") +
      (named.length > 8 ? ` · and ${named.length - 8} more` : "") +
      (failed > 0
        ? ` — ${failed} site${failed === 1 ? "" : "s"} did not answer and were recorded as unreachable, with no score.`
        : ""),
    detail: r.output,
  };
}

/**
 * Import a prospect spreadsheet.
 *
 * The path is a real file on this machine. It is passed as an argument to a
 * fixed script through execFile, never through a shell, so a filename
 * containing shell syntax is a filename.
 */
export async function importProspectList(formData: FormData): Promise<ActionResult> {
  // FormData.get can return a File. A File is not a path, and stringifying one
  // would produce "[object File]" and then a baffling error from the script.
  const raw = formData.get("path");
  const path = typeof raw === "string" ? raw.trim() : "";
  if (path === "") {
    return {
      ok: false,
      headline: "No file was given.",
      meaning: "Paste the full path to the spreadsheet on this machine.",
      detail: "",
    };
  }
  const e = await supabaseEnv();
  if (!e.ok) return e.result;

  const r = await cmd(
    "node",
    [
      "--experimental-strip-types",
      "scripts/import-prospects.mts",
      path,
      "--import",
      "--campaign",
      "wny_barbers_50",
    ],
    { timeoutMs: 120_000, env: e.env },
  );
  revalidatePath("/shops");
  if (!r.ok) return fail(r.output);

  const imported = /imported (\d+) shops/.exec(r.stderr);
  return {
    ok: true,
    headline: imported
      ? `${imported[1]} shops are in the list.`
      : "The spreadsheet was imported.",
    meaning:
      (r.stderr.split("\n").find((l) => l.includes("with a URL")) ?? "").trim() +
      " Re-importing a corrected file updates the shops rather than duplicating them. " +
      "Nothing has been analysed yet — use Look at the websites for that.",
    detail: r.output,
  };
}
