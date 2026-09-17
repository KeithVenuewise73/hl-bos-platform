import "server-only";

import { appendFile, mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { config } from "../config.ts";
import { currentMode, getViewer, serverSupabase } from "../session.ts";
import { sanitizeProps, type EventName, type EventProps } from "./events.ts";

/**
 * Recording an event must never be able to break the thing it is measuring.
 *
 * Every function here swallows its own failures. That is the opposite of the
 * rule everywhere else in this app — claim validation fails closed, the
 * deployment guard fails closed — and the difference is deliberate: a missing
 * analytics row costs us one data point, while an exception thrown from a
 * counter costs the user the resume they were exporting.
 *
 * Two destinations, whichever this installation has:
 *   authenticated -> ats.product_events, under the signed-in user's own RLS
 *   local         -> a JSON-lines file beside the workspace
 */

/** Fire-and-forget. Never awaited by a caller that has real work to do. */
export function track(name: EventName, props?: EventProps): void {
  void record(name, props).catch(() => {
    /* analytics is not a control; see the note above */
  });
}

export async function record(name: EventName, props?: EventProps): Promise<void> {
  try {
    const safe = sanitizeProps(props);
    const viewer = await getViewer();
    if (viewer.userId === null) return;

    if (currentMode() === "authenticated") {
      const client = await serverSupabase();
      if (client === null) return;
      // A failed insert is returned, not thrown, by supabase-js. Either way
      // this function is done: there is no retry and no user-visible error.
      await client
        .schema("ats")
        .from("product_events")
        .insert({ owner_id: viewer.userId, event_name: name, props: safe });
      return;
    }

    await appendLocal(viewer.userId, name, safe);
  } catch {
    /* swallowed on purpose */
  }
}

async function appendLocal(
  userId: string,
  name: EventName,
  props: EventProps,
): Promise<void> {
  const base = config().dataDir;
  const root = isAbsolute(base) ? base : resolve(process.cwd(), base);
  const path = join(root, "events.jsonl");
  await mkdir(dirname(path), { recursive: true });
  const line = `${JSON.stringify({
    at: new Date().toISOString(),
    owner: userId,
    event: name,
    props,
  })}\n`;
  await appendFile(path, line, "utf8");
}
