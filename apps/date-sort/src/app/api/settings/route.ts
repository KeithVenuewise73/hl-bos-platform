import { cleanEventNames, loadSettings, saveSettings } from "@hl-bos/date-sort/copy";

import { guard } from "@/lib/guard.ts";

export const dynamic = "force-dynamic";

/** The remembered destination for date folders. */
export async function GET(request: Request): Promise<Response> {
  const refused = guard(request);
  if (refused !== null) return refused;
  return Response.json(await loadSettings(), {
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Remember the destination and/or the event names. Only text is stored;
 * nothing is created.
 */
export async function POST(request: Request): Promise<Response> {
  const refused = guard(request);
  if (refused !== null) return refused;
  const body = (await request.json().catch(() => ({}))) as {
    destination?: unknown;
    eventNames?: unknown;
  };
  const destination =
    typeof body.destination === "string" && body.destination.trim() !== ""
      ? body.destination.trim()
      : null;
  if (destination === null && body.eventNames === undefined) {
    return Response.json(
      { error: "Expected a folder or event names." },
      { status: 400 },
    );
  }
  const now = await loadSettings();
  await saveSettings({
    destination: destination ?? now.destination,
    eventNames:
      body.eventNames === undefined ? now.eventNames : cleanEventNames(body.eventNames),
  });
  return Response.json({ ok: true });
}
