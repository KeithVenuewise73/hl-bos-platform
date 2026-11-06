"use server";

import { revalidatePath } from "next/cache";

import type { PresenceResult } from "@/lib/presence";
import { FilePresenceRepository } from "@/lib/presence-store";
import {
  guidedStatus,
  installBrowser,
  startGuidedReview,
  stopGuidedReview,
  visualDeps,
  visualReviewLead,
  type GuidedStatus,
} from "@/lib/visual";

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

/** "View it yourself": open the website in a visible browser window on this computer. */
export async function startGuidedReviewAction(fd: FormData): Promise<PresenceResult> {
  return startGuidedReview(idOf(fd), visualDeps(new FilePresenceRepository()));
}

/** Is the window still open, and how many pages has it recorded? */
export async function guidedStatusAction(fd: FormData): Promise<GuidedStatus> {
  const s = guidedStatus(idOf(fd));
  if (s.state === "finished") revalidatePath(`/presence/${idOf(fd)}`);
  return Promise.resolve(s);
}

/** The Done button: close the window and save what was recorded. */
export async function stopGuidedReviewAction(fd: FormData): Promise<PresenceResult> {
  const r = await stopGuidedReview(idOf(fd));
  revalidatePath(`/presence/${idOf(fd)}`);
  return r;
}
