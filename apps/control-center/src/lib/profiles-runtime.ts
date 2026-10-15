import "server-only";
import { randomUUID } from "node:crypto";

import { createNodeEgress } from "@hl-bos/presence-scanner/node";

import type { ProfileDeps } from "./profiles";
import { FilePresenceRepository } from "./presence-store";
import { FileDraftRepository, FileProfileRepository } from "./site-store";

/**
 * The real wiring for Business Profiles: the three file stores on this
 * computer and the SSRF-guarded Node egress (used only when no saved homepage
 * copy is given). Nothing here can publish or send anything.
 */
export function profileDeps(): ProfileDeps {
  return {
    profiles: new FileProfileRepository(),
    leads: new FilePresenceRepository(),
    drafts: new FileDraftRepository(),
    egress: createNodeEgress(),
    now: () => new Date(),
    newId: () => randomUUID(),
    actor: "Control Center operator",
  };
}
