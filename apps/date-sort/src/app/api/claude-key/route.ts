import {
  checkKey,
  forgetKey,
  loadKey,
  looksLikeKey,
  saveKey,
} from "@hl-bos/date-sort/sport";

import { guard } from "@/lib/guard.ts";

export const dynamic = "force-dynamic";

/** Whether a Claude key is saved. The key itself never leaves the server. */
export async function GET(request: Request): Promise<Response> {
  const refused = guard(request);
  if (refused !== null) return refused;
  return Response.json(
    { saved: (await loadKey()) !== null },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Save a key, after Anthropic has said it accepts it. */
export async function POST(request: Request): Promise<Response> {
  const refused = guard(request);
  if (refused !== null) return refused;
  const body = (await request.json().catch(() => ({}))) as { key?: unknown };
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!looksLikeKey(key)) {
    return Response.json(
      {
        error:
          'That does not look like a Claude API key. Keys start with "sk-ant-"; copy the whole key from the Anthropic Console.',
      },
      { status: 400 },
    );
  }
  const problem = await checkKey(key);
  if (problem !== null) return Response.json({ error: problem }, { status: 400 });
  await saveKey(key);
  return Response.json({ saved: true });
}

/** Forget the saved key. */
export async function DELETE(request: Request): Promise<Response> {
  const refused = guard(request);
  if (refused !== null) return refused;
  await forgetKey();
  return Response.json({ saved: false });
}
