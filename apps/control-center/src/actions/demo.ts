"use server";

import { revalidatePath } from "next/cache";

import { approveDemo, buildDemo, editDemo, editFromForm } from "@/lib/demo";
import { demoDeps } from "@/lib/demo-runtime";
import type { PresenceResult } from "@/lib/presence";

/**
 * The Instant Site Builder's buttons. Thin wrappers over lib/demo.ts.
 * Nothing here publishes a page, registers a domain or contacts anyone.
 */

const id = (fd: FormData) => {
  const v = fd.get("id");
  return typeof v === "string" ? v : "";
};

function refresh(prospectId: string) {
  revalidatePath("/presence");
  revalidatePath(`/presence/${prospectId}`);
  revalidatePath(`/presence/${prospectId}/demo`);
}

export async function buildDemoSite(fd: FormData): Promise<PresenceResult> {
  const r = await buildDemo(id(fd), await demoDeps());
  refresh(id(fd));
  return r;
}

export async function editDemoSite(fd: FormData): Promise<PresenceResult> {
  const r = await editDemo(id(fd), editFromForm(fd), await demoDeps());
  refresh(id(fd));
  return r;
}

export async function approveDemoSite(fd: FormData): Promise<PresenceResult> {
  const r = await approveDemo(id(fd), await demoDeps());
  refresh(id(fd));
  return r;
}
