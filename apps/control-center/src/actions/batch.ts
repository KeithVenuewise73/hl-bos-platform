"use server";

import { revalidatePath } from "next/cache";

import {
  buildBatchItem,
  summarize,
  type BatchItemResult,
  type BatchRun,
} from "@/lib/batch";
import { demoDeps } from "@/lib/demo-runtime";
import { FileBatchStore } from "@/lib/site-store";

/**
 * Batch building, one lead per call so the screen can show each lead's
 * status as it happens and one failure never stops the rest. Template copy
 * only (buildBatchItem forces it). Nothing is published or sent.
 */
export async function buildBatchLead(id: string): Promise<BatchItemResult> {
  const r = await buildBatchItem(id, await demoDeps());
  revalidatePath(`/presence/${id}`);
  return r;
}

export async function recordBatch(
  startedAt: string,
  items: BatchItemResult[],
): Promise<BatchRun> {
  const run: BatchRun = {
    id: crypto.randomUUID(),
    startedAt,
    finishedAt: new Date().toISOString(),
    actor: "Control Center operator",
    items,
    summary: summarize(items),
  };
  await new FileBatchStore().save(run);
  revalidatePath("/presence");
  return run;
}
