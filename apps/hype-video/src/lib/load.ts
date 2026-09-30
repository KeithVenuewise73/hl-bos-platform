import "server-only";

import { notFound } from "next/navigation";

import type { HypeProject } from "@hl-bos/hype-video";

import { isId } from "./media.ts";
import { store } from "./store.ts";

export async function loadProject(id: string): Promise<HypeProject> {
  if (!isId(id)) notFound();
  const project = await store().get(id);
  if (project === null) notFound();
  return project;
}

/** Search params arrive as string | string[] | undefined; this takes the first string. */
export function param(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
