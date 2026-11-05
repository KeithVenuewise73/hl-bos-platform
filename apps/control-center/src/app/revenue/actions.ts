"use server";

import {
  mockDiscovery,
  backfillCampaign,
  type BusinessLine,
} from "@hl-bos/growth-intelligence";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { consoleRevenueSource } from "@/lib/revenue";

function field(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v : "";
}

/** Run a change; land back on the page with a plain-English result either way. */
async function act(run: () => Promise<string>): Promise<never> {
  let msg: string;
  let ok = true;
  try {
    const src = await consoleRevenueSource();
    if (src.mode !== "development")
      throw new Error("The Revenue Center database is not connected.");
    msg = await run();
  } catch (e) {
    ok = false;
    msg = e instanceof Error ? e.message : String(e);
  }
  revalidatePath("/revenue");
  redirect(
    `/revenue?${new URLSearchParams({ [ok ? "done" : "error"]: msg }).toString()}`,
  );
}

async function dev() {
  const src = await consoleRevenueSource();
  if (src.mode !== "development")
    throw new Error("The Revenue Center database is not connected.");
  return src;
}

/** One click: Send to Review. One database transaction; a second click is safe. */
export async function sendToReviewAction(form: FormData): Promise<void> {
  await act(async () => {
    const src = await dev();
    const r = await src.rc.sendToReview(src.actor, field(form, "prospectId"));
    return r.replayed
      ? "This evidence was already reviewed; nothing new was created."
      : `Review completed (score ${r.growthScore}).`;
  });
}

/** The owner's decision on EXACTLY the version shown: the form carries the fingerprint that was displayed. */
export async function decideAction(form: FormData): Promise<void> {
  await act(async () => {
    const src = await dev();
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
  await act(async () => {
    const src = await dev();
    const reason = field(form, "reason").trim() || "Not a fit (owner decision)";
    await src.rc.setStatus(src.actor, field(form, "prospectId"), "rejected", reason);
    return "Rejected. It will not be re-added, and backfill can replace it.";
  });
}

export async function resolveInquiryAction(form: FormData): Promise<void> {
  await act(async () => {
    const src = await dev();
    const line = field(form, "line") === "hscs" ? "hscs" : "hld";
    await src.rc.resolveInquiry(src.actor, field(form, "inquiryId"), line);
    return `Inquiry filed with ${line.toUpperCase()}.`;
  });
}

/** Development only: backfill one campaign from the MOCK source (synthetic businesses). */
export async function mockBackfillAction(form: FormData): Promise<void> {
  await act(async () => {
    const src = await dev();
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
