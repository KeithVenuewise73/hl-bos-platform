import { guard } from "@/lib/guard.ts";
import { pickFile, type PickPurpose } from "@/lib/picker.ts";

export const dynamic = "force-dynamic";

const PURPOSES: readonly PickPurpose[] = ["video-a", "video-b", "video", "save"];

/** Open Windows' file window and answer with the chosen path. */
export async function POST(request: Request): Promise<Response> {
  const refused = guard(request);
  if (refused !== null) return refused;
  const body = (await request.json().catch(() => ({}))) as {
    purpose?: unknown;
    suggestedName?: unknown;
    startFolder?: unknown;
  };
  const purpose = PURPOSES.find((p) => p === body.purpose);
  if (purpose === undefined)
    return Response.json({ error: "Unknown request." }, { status: 400 });
  const name =
    typeof body.suggestedName === "string"
      ? body.suggestedName.replace(/[\\/:*?"<>|]/g, "-").slice(0, 120)
      : "";
  const folder =
    typeof body.startFolder === "string" ? body.startFolder.slice(0, 400) : "";
  return Response.json(await pickFile(purpose, name, folder), {
    headers: { "Cache-Control": "no-store" },
  });
}
