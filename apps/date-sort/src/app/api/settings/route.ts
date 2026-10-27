import { cleanEventNames, loadSettings, saveSettings } from "@hl-bos/date-sort/copy";

import { guard } from "@/lib/guard.ts";

export const dynamic = "force-dynamic";

/**
 * Saves take turns. Each one reads the settings, changes its part and writes
 * them back; two at once (typing an event name, then pressing Copy, saves the
 * name and the destination together) would let the second write undo the
 * first. That happened: the destination was lost.
 */
let queue: Promise<void> = Promise.resolve();
function oneAtATime(work: () => Promise<void>): Promise<void> {
  const next = queue.then(work, work);
  queue = next.catch(() => undefined);
  return next;
}

/** The remembered destination for date folders. */
export async function GET(request: Request): Promise<Response> {
  const refused = guard(request);
  if (refused !== null) return refused;
  return Response.json(await loadSettings(), {
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Remember the destination, the event names and/or the iPhone's folder. Only text is stored;
 * nothing is created.
 */
export async function POST(request: Request): Promise<Response> {
  const refused = guard(request);
  if (refused !== null) return refused;
  const body = (await request.json().catch(() => ({}))) as {
    destination?: unknown;
    eventNames?: unknown;
    iphoneFolder?: unknown;
  };
  const destination =
    typeof body.destination === "string" && body.destination.trim() !== ""
      ? body.destination.trim()
      : null;
  const iphoneFolder =
    typeof body.iphoneFolder === "string" && body.iphoneFolder.trim() !== ""
      ? body.iphoneFolder.trim()
      : null;
  if (destination === null && body.eventNames === undefined && iphoneFolder === null) {
    return Response.json(
      { error: "Expected a folder or event names." },
      { status: 400 },
    );
  }
  await oneAtATime(async () => {
    const now = await loadSettings();
    await saveSettings({
      destination: destination ?? now.destination,
      eventNames:
        body.eventNames === undefined
          ? now.eventNames
          : cleanEventNames(body.eventNames),
      // Every save keeps the iPhone folder, or a destination save would forget it.
      iphoneFolder: iphoneFolder ?? now.iphoneFolder ?? null,
    });
  });
  return Response.json({ ok: true });
}
