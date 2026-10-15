import "server-only";
import { randomUUID } from "node:crypto";

import { createClaudeCopyWriter } from "@hl-bos/site-builder";

import type { DemoDeps } from "./demo";
import { FilePresenceRepository } from "./presence-store";
import { readEnvFile } from "./secrets";
import { FileDraftRepository } from "./site-store";

/**
 * The real wiring for demo sites: the two file stores, and Claude for copy
 * only when an Anthropic key has been saved on the Connections page. Without
 * one, the template writer is used and every feature still works.
 */
export async function anthropicConnected(): Promise<boolean> {
  return Boolean((await readEnvFile())["ANTHROPIC_API_KEY"]);
}

export async function demoDeps(): Promise<DemoDeps> {
  const key = (await readEnvFile())["ANTHROPIC_API_KEY"];
  return {
    leads: new FilePresenceRepository(),
    drafts: new FileDraftRepository(),
    writer: key ? createClaudeCopyWriter({ apiKey: key }) : null,
    now: () => new Date(),
    newId: () => randomUUID(),
    actor: "Control Center operator",
  };
}
