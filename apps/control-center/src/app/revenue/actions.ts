"use server";

import { revalidatePath } from "next/cache";

import { consoleRevenueSource } from "@/lib/revenue";

function field(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v : "";
}

/** One click: Send to Review. One database transaction; a second click is safe. */
export async function sendToReviewAction(form: FormData): Promise<void> {
  const src = await consoleRevenueSource();
  if (src.mode !== "development") return;
  const id = field(form, "prospectId");
  await src.rc.sendToReview(src.actor, id);
  revalidatePath("/revenue");
}

/**
 * The owner's decision on EXACTLY the version shown on the page: the form
 * carries the hash that was displayed, and the database refuses it if the
 * content has changed since.
 */
export async function decideAction(form: FormData): Promise<void> {
  const src = await consoleRevenueSource();
  if (src.mode !== "development") return;
  const decision = form.get("decision") === "approved" ? "approved" : "rejected";
  const pending = await src.rc.pendingApproval(src.actor, field(form, "instanceId"));
  await src.rc.decide(
    src.actor,
    { ...pending, sha256: field(form, "sha256") },
    decision,
  );
  revalidatePath("/revenue");
}
