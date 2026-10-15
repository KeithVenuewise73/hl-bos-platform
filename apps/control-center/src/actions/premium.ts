"use server";

import { revalidatePath } from "next/cache";

import type { PresenceResult } from "@/lib/presence";
import { approvePremium, buildPremium } from "@/lib/premium";
import { premiumDeps } from "@/lib/premium-runtime";

/**
 * Premium Business Site buttons. Thin wrappers over lib/premium.ts. Approval
 * is internal sign-off on a design; nothing here publishes, configures an
 * address or contacts anyone.
 */
const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

function refresh(id: string) {
  revalidatePath("/profiles");
  revalidatePath(`/profiles/${id}`);
  revalidatePath(`/profiles/${id}/premium`);
}

export async function buildPremiumSite(fd: FormData): Promise<PresenceResult> {
  const id = str(fd, "id");
  const r = await buildPremium(id, premiumDeps());
  refresh(id);
  return r;
}

export async function approvePremiumSite(fd: FormData): Promise<PresenceResult> {
  const id = str(fd, "id");
  const r = await approvePremium(id, premiumDeps());
  refresh(id);
  return r;
}
