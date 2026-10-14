"use server";

import { revalidatePath } from "next/cache";

import { reviewLead, startScan, type PresenceResult } from "@/lib/presence";
import { presenceDeps } from "@/lib/presence-runtime";

/**
 * The Presence Scanner's buttons. Thin wrappers, as everywhere else here: the
 * decisions are in lib/presence.ts (tested) and the engine package.
 *
 * Nothing here sends a message, publishes a page or contacts a business.
 */

export async function runPresenceScan(fd: FormData): Promise<PresenceResult> {
  const r = await startScan(fd, await presenceDeps());
  revalidatePath("/presence");
  const { run: _run, ...result } = r;
  return result;
}

const field = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

export async function reviewPresenceLead(fd: FormData): Promise<PresenceResult> {
  const id = field(fd, "id");
  const kind = field(fd, "kind");
  const deps = await presenceDeps();
  let r: PresenceResult;
  switch (kind) {
    case "stage":
      r = await reviewLead(
        id,
        { kind, to: field(fd, "to"), note: field(fd, "note") },
        deps,
      );
      break;
    case "note":
      r = await reviewLead(id, { kind, text: field(fd, "text") }, deps);
      break;
    case "override":
      r = await reviewLead(
        id,
        { kind, status: field(fd, "status"), note: field(fd, "note") },
        deps,
      );
      break;
    case "clear_override":
      r = await reviewLead(id, { kind }, deps);
      break;
    case "correct":
      r = await reviewLead(
        id,
        { kind, field: field(fd, "field"), value: field(fd, "value") },
        deps,
      );
      break;
    case "rescan":
      r = await reviewLead(id, { kind }, deps);
      break;
    default:
      r = {
        ok: false,
        headline: "Unknown action.",
        meaning: "Reload the page and try again.",
      };
  }
  revalidatePath("/presence");
  revalidatePath(`/presence/${id}`);
  return r;
}
