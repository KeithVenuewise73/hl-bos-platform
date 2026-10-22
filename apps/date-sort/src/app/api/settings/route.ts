import { loadSettings, saveSettings } from "@hl-bos/date-sort/copy";

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

/** Remember a new destination. Only a path is stored; nothing is created. */
export async function POST(request: Request): Promise<Response> {
  const refused = guard(request);
  if (refused !== null) return refused;
  const body = (await request.json().catch(() => ({}))) as { destination?: unknown };
  if (typeof body.destination !== "string" || body.destination.trim() === "") {
    return Response.json({ error: "Expected a folder." }, { status: 400 });
  }
  await saveSettings({ destination: body.destination.trim() });
  return Response.json({ ok: true });
}
