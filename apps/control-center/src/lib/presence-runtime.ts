import "server-only";
import { randomUUID } from "node:crypto";

import { createGooglePlacesClient, PLACES_KEY_ENV } from "@hl-bos/presence-scanner";
import { createNodeEgress } from "@hl-bos/presence-scanner/node";

import type { PresenceDeps } from "./presence";
import { FilePresenceRepository } from "./presence-store";
import { readEnvFile } from "./secrets";

/**
 * The real wiring: the file store, the Node egress adapter (SSRF-guarded at
 * connect time), and Google Places only when a key has been saved on the
 * Connections page (written to .env.local, like every other console token).
 * The key is read here, on the server, and never leaves it.
 */
export async function placesKey(): Promise<string | undefined> {
  const env = await readEnvFile();
  return env[PLACES_KEY_ENV] || undefined;
}

export async function presenceDeps(): Promise<PresenceDeps> {
  const key = await placesKey();
  return {
    repo: new FilePresenceRepository(),
    places: key
      ? createGooglePlacesClient({
          apiKey: key,
          fetchImpl: (url, init) => fetch(url, init),
        })
      : null,
    egress: createNodeEgress(),
    now: () => new Date(),
    newId: () => randomUUID(),
    actor: "Control Center operator",
  };
}
