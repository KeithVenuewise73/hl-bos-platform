"use server";

import { revalidatePath } from "next/cache";
import { cmd } from "@/lib/shell";
import { readEnvFile } from "@/lib/secrets";
import { explain } from "@/lib/translate";
import { connect, HLD_TENANT_SLUG } from "@/lib/shop-audit";
import { RECORD_CALL_SQL, answersPayload } from "@/lib/discovery-sql";
import {
  DECIDE_SQL,
  DRAFT_SQL,
  SAVE_SQL,
  SEND_SQL,
  loadAssembleContext,
  loadCatalog,
  loadProposal,
} from "@/lib/proposal-sql";
import { assembleDocument, type ProposalDocument } from "@/lib/proposal-doc";
import { matchCapabilities } from "@/lib/capability-match";
import type { SqlRunner } from "@/lib/shop-audit-sql";

import type { ActionResult } from "@/app/actions";

type Investment = ProposalDocument["investment"];

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

/**
 * Record what a shop said on the discovery call.
 *
 * Unlike the two actions above, this one writes to HL-BOS Core directly rather
 * than shelling out -- there is no crawling to do and no third party to wait
 * for. It goes through the Management API's SQL endpoint, which connects as
 * `postgres`; RECORD_CALL_SQL puts the permission checks back by impersonating
 * the tenant owner, and refuses outright if the tenant has no active owner to
 * act as. A console that can store what the application itself would refuse is
 * not a console, it is a back door.
 */
export async function recordCall(
  prospectId: string,
  answers: Record<string, unknown>,
): Promise<ActionResult> {
  // A uuid, because it is inlined into SQL. Anything else never reaches the
  // database.
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(prospectId)
  ) {
    return {
      ok: false,
      headline: "That is not a shop.",
      meaning: "The page was opened with an address the console does not recognise.",
      detail: "",
    };
  }
  if (Object.keys(answers).length === 0) {
    return {
      ok: false,
      headline: "Nothing to save.",
      meaning: "No answer was changed, so there is nothing to record.",
      detail: "",
    };
  }

  const state = await connect();
  if (!state.connected) {
    return {
      ok: false,
      headline: "Supabase is not connected yet.",
      meaning: state.reason,
      detail: "",
      href: "/connect",
    };
  }

  try {
    await state.conn.run(
      RECORD_CALL_SQL(HLD_TENANT_SLUG, prospectId, answersPayload(answers)),
    );
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
  revalidatePath(`/shops/${prospectId}/call`);
  revalidatePath("/shops");
  return {
    ok: true,
    headline: "Saved.",
    meaning: "Only the answers you changed were written; the rest are as they were.",
    detail: "",
  };
}

// ---------------------------------------------------------------------------
// Proposals
//
// Four actions, all of them writing as the tenant owner through the
// permission-checked functions in migration 0055. None of them decides
// anything the database would not also enforce: the honesty rules live in the
// trigger, the lifecycle lives in the trigger, and these report what happened.
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notAThing(what: string): ActionResult {
  return {
    ok: false,
    headline: `That is not a ${what}.`,
    meaning: "The page was opened with an address the console does not recognise.",
    detail: "",
  };
}

async function runner(): Promise<
  { ok: true; run: SqlRunner } | { ok: false; result: ActionResult }
> {
  const state = await connect();
  if (!state.connected) {
    return {
      ok: false,
      result: {
        ok: false,
        headline: "Supabase is not connected yet.",
        meaning: state.reason,
        detail: "",
        href: "/connect",
      },
    };
  }
  return { ok: true, run: state.conn.run };
}

/**
 * Freeze what we currently know into a draft.
 *
 * The snapshot is taken HERE, from live data, and never again. Everything
 * after this edits words around evidence that has stopped moving.
 */
export async function createProposal(prospectId: string): Promise<ActionResult> {
  if (!UUID.test(prospectId)) return notAThing("shop");
  const r = await runner();
  if (!r.ok) return r.result;

  try {
    const ctx = await loadAssembleContext(r.run, HLD_TENANT_SLUG, prospectId);
    if (ctx === null) {
      return {
        ok: false,
        headline: "No such shop.",
        meaning: "Nothing in the prospect list has that id.",
        detail: "",
      };
    }
    const catalog = await loadCatalog(r.run);
    const gaps = matchCapabilities(ctx.stack, catalog);
    if (gaps.length === 0) {
      // A proposal that offers nothing is not a proposal. The database refuses
      // to SEND one; there is no reason to let a person build one either.
      return {
        ok: false,
        headline: "There is nothing to propose yet.",
        meaning:
          "Cross-referencing what this shop has against the catalog produced no gaps. " +
          "Either they are already covered, or nobody has audited or called them.",
        detail: "",
      };
    }
    const document = assembleDocument({
      shop: ctx.shop,
      audit: ctx.audit,
      stack: ctx.stack,
      answeredAt: ctx.answeredAt,
      notes: ctx.notes,
      gaps,
      preparedAt: new Date().toISOString(),
    });
    await r.run(DRAFT_SQL(HLD_TENANT_SLUG, prospectId, ctx.runId, document));
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }

  revalidatePath(`/shops/${prospectId}/proposal`);
  return {
    ok: true,
    headline: "Draft created.",
    meaning:
      "What we know about this shop is now frozen into it. Add the covering note and " +
      "the pricing, then send it.",
    detail: "",
  };
}

/** Edit the words. The snapshot inside the document is passed back untouched. */
export async function saveProposal(
  prospectId: string,
  proposalId: string,
  edits: { message: string; investment: Investment; nextSteps: string[] },
): Promise<ActionResult> {
  if (!UUID.test(prospectId)) return notAThing("shop");
  if (!UUID.test(proposalId)) return notAThing("proposal");
  const r = await runner();
  if (!r.ok) return r.result;

  try {
    const current = await loadProposal(r.run, HLD_TENANT_SLUG, proposalId);
    if (current === null) return notAThing("proposal");
    const document = {
      ...current.document,
      message: edits.message,
      investment: edits.investment,
      next_steps: edits.nextSteps,
    };
    await r.run(SAVE_SQL(HLD_TENANT_SLUG, proposalId, document));
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }

  revalidatePath(`/shops/${prospectId}/proposal/${proposalId}`);
  return {
    ok: true,
    headline: "Saved.",
    meaning: "The evidence in the document is unchanged; only the wording moved.",
    detail: "",
  };
}

/** The commitment. After this the document cannot change. */
export async function sendProposal(
  prospectId: string,
  proposalId: string,
): Promise<ActionResult> {
  if (!UUID.test(prospectId)) return notAThing("shop");
  if (!UUID.test(proposalId)) return notAThing("proposal");
  const r = await runner();
  if (!r.ok) return r.result;

  try {
    await r.run(SEND_SQL(HLD_TENANT_SLUG, proposalId));
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }

  revalidatePath(`/shops/${prospectId}/proposal/${proposalId}`);
  revalidatePath(`/shops/${prospectId}/proposal`);
  return {
    ok: true,
    headline: "Marked as sent.",
    meaning:
      "The document is frozen from here. If something needs to change, draft a new " +
      "one -- the shop has this version.",
    detail: "",
  };
}

/** What came back. */
export async function decideProposal(
  prospectId: string,
  proposalId: string,
  status: string,
  note: string,
): Promise<ActionResult> {
  if (!UUID.test(prospectId)) return notAThing("shop");
  if (!UUID.test(proposalId)) return notAThing("proposal");
  if (status !== "accepted" && status !== "declined" && status !== "withdrawn") {
    return {
      ok: false,
      headline: "That is not an outcome.",
      meaning: "A proposal is accepted, declined or withdrawn.",
      detail: "",
    };
  }
  const r = await runner();
  if (!r.ok) return r.result;

  try {
    await r.run(DECIDE_SQL(HLD_TENANT_SLUG, proposalId, status, note));
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }

  revalidatePath(`/shops/${prospectId}/proposal/${proposalId}`);
  revalidatePath(`/shops/${prospectId}/proposal`);
  return {
    ok: true,
    headline: "Recorded.",
    meaning: "",
    detail: "",
  };
}
