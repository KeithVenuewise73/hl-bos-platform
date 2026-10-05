"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db.ts";
import { recomputeAll } from "@/lib/repo/review.ts";
import { saveProvider, saveThresholds } from "@/lib/repo/settings.ts";
import { requireUser } from "@/lib/session.ts";

const text = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};

/** Thresholds and provider are an organization decision (jerseysort.settings.manage in 0052). */
async function requireOwner() {
  const user = await requireUser();
  if (user.role !== "owner") {
    redirect(
      `/settings?error=${encodeURIComponent("Only the organization's owner can change this.")}`,
    );
  }
  return user;
}

export async function saveThresholdsAction(form: FormData): Promise<void> {
  const user = await requireOwner();
  const t = {
    high: Number(text(form, "high")) / 100,
    medium: Number(text(form, "medium")) / 100,
  };
  let n = 0;
  try {
    saveThresholds(db(), user.organizationId, t);
    n = recomputeAll(db(), user.organizationId, t);
  } catch (e) {
    redirect(
      `/settings?error=${encodeURIComponent(e instanceof Error ? e.message : "Could not save.")}`,
    );
  }
  revalidatePath("/", "layout");
  redirect(
    `/settings?notice=${encodeURIComponent(`Saved. ${n.toLocaleString()} photos re-sorted under the new thresholds.`)}`,
  );
}

export async function saveProviderAction(form: FormData): Promise<void> {
  const user = await requireOwner();
  const v = text(form, "provider");
  const provider = v === "claude" || v === "local-ocr" || v === "none" ? v : null;
  saveProvider(db(), user.organizationId, provider);
  revalidatePath("/", "layout");
  redirect(
    `/settings?notice=${encodeURIComponent("Saved. New uploads use this. To re-check existing photos, use Re-analyze on an event.")}`,
  );
}
