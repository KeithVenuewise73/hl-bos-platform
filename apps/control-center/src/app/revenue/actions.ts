"use server";

import {
  mockDiscovery,
  backfillCampaign,
  type BusinessLine,
} from "@hl-bos/growth-intelligence";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { consoleRevenueSource, type ConnectedSource } from "@/lib/revenue";
import { RevenueErrorLog } from "@/lib/revenue-errors";
import { pilotClient, pilotConfig } from "@/lib/revenue-pilot";
import { readEnvFile } from "@/lib/secrets";

function field(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v : "";
}

/**
 * Run a change; land back on the page with a plain-English result either way.
 * Every failure is also written to the Revenue Center error log.
 */
async function act(
  action: string,
  run: (src: ConnectedSource) => Promise<string>,
): Promise<never> {
  let msg: string;
  let ok = true;
  let mode = "unknown";
  try {
    const src = await consoleRevenueSource(true);
    mode = src.mode;
    if (src.mode !== "development" && src.mode !== "pilot") throw new Error(src.reason);
    msg = await run(src);
  } catch (e) {
    ok = false;
    msg = e instanceof Error ? e.message : String(e);
    await new RevenueErrorLog().record({ action, message: msg, mode }).catch(() => {});
  }
  revalidatePath("/revenue");
  redirect(
    `/revenue?${new URLSearchParams({ [ok ? "done" : "error"]: msg }).toString()}`,
  );
}

/** Sign in to HL-BOS (pilot). The password goes to HL-BOS's Auth server only; it is never stored. */
export async function signInAction(form: FormData): Promise<void> {
  let error = "";
  try {
    const cfg = pilotConfig(await readEnvFile());
    if (!cfg) throw new Error("The HL-BOS pilot is not configured on this computer.");
    const client = await pilotClient(cfg, true);
    const { error: e } = await client.auth.signInWithPassword({
      email: field(form, "email"),
      password: field(form, "password"),
    });
    // Do not say which half was wrong.
    if (e) throw new Error("Sign-in failed. Check the email and password.");
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    await new RevenueErrorLog()
      .record({ action: "sign_in", message: error, mode: "pilot" })
      .catch(() => {});
  }
  revalidatePath("/revenue");
  redirect(
    error ? `/revenue?${new URLSearchParams({ error }).toString()}` : "/revenue",
  );
}

export async function signOutAction(): Promise<void> {
  const cfg = pilotConfig(await readEnvFile());
  if (cfg) await (await pilotClient(cfg, true)).auth.signOut();
  revalidatePath("/revenue");
  redirect("/revenue");
}

/** One click: Send to Review. One database transaction; a second click is safe. */
export async function sendToReviewAction(form: FormData): Promise<void> {
  await act("send_to_review", async (src) => {
    const r = await src.rc.sendToReview(src.actor, field(form, "prospectId"));
    return r.replayed
      ? "This evidence was already reviewed; nothing new was created."
      : `Review completed (score ${r.growthScore}).`;
  });
}

/** The owner's decision on EXACTLY the version shown: the form carries the fingerprint that was displayed. */
export async function decideAction(form: FormData): Promise<void> {
  await act("decide", async (src) => {
    const decision = field(form, "decision") === "approved" ? "approved" : "rejected";
    const pending = await src.rc.pendingApproval(src.actor, field(form, "instanceId"));
    await src.rc.decide(
      src.actor,
      { ...pending, sha256: field(form, "sha256") },
      decision,
    );
    return decision === "approved" ? "Approved. Nothing has been sent." : "Rejected.";
  });
}

export async function rejectProspectAction(form: FormData): Promise<void> {
  await act("reject_prospect", async (src) => {
    const reason = field(form, "reason").trim() || "Not a fit (owner decision)";
    await src.rc.setStatus(src.actor, field(form, "prospectId"), "rejected", reason);
    return "Rejected. It will not be re-added, and backfill can replace it.";
  });
}

export async function resolveInquiryAction(form: FormData): Promise<void> {
  await act("resolve_inquiry", async (src) => {
    const line = field(form, "line") === "hscs" ? "hscs" : "hld";
    await src.rc.resolveInquiry(src.actor, field(form, "inquiryId"), line);
    return `Inquiry filed with ${line.toUpperCase()}.`;
  });
}

/** Development only: backfill one campaign from the MOCK source (synthetic businesses). */
export async function mockBackfillAction(form: FormData): Promise<void> {
  await act("mock_backfill", async (src) => {
    if (src.mode !== "development")
      throw new Error(
        "Synthetic backfill runs only on the development database, never in the pilot.",
      );
    const line: BusinessLine = field(form, "line") === "hscs" ? "hscs" : "hld";
    const r = await backfillCampaign(
      src.rc,
      src.actor,
      line,
      field(form, "campaign"),
      mockDiscovery(),
    );
    return `Synthetic backfill: ${r.added.length} added, ${r.duplicatesSkipped} duplicates skipped.`;
  });
}
