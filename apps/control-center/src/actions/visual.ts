"use server";

import { revalidatePath } from "next/cache";

import type { PresenceResult } from "@/lib/presence";
import { FilePresenceRepository } from "@/lib/presence-store";
import { installBrowser, visualDeps, visualReviewLead } from "@/lib/visual";

/**
 * The visual review's buttons. Thin wrappers: the decisions are in
 * lib/visual.ts and packages/visual-review. Nothing here contacts a business
 * except by viewing its public website, read-only.
 */
const idOf = (fd: FormData) => {
  const v = fd.get("id");
  return typeof v === "string" ? v : "";
};

export async function runVisualReviewAction(fd: FormData): Promise<PresenceResult> {
  const id = idOf(fd);
  const r = await visualReviewLead(id, visualDeps(new FilePresenceRepository()));
  revalidatePath(`/presence/${id}`);
  return r;
}

export async function installBrowserAction(fd: FormData): Promise<PresenceResult> {
  const r = await installBrowser();
  revalidatePath(`/presence/${idOf(fd)}`);
  return r;
}
