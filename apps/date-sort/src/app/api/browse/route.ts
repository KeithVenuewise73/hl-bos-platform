import { browseForFolder } from "@/lib/browse.ts";
import { guard } from "@/lib/guard.ts";

export const dynamic = "force-dynamic";

/** Open the Windows folder picker; answer with the chosen folder's path. */
export async function POST(request: Request): Promise<Response> {
  const refused = guard(request);
  if (refused !== null) return refused;
  const outcome = await browseForFolder();
  return Response.json(outcome, { headers: { "Cache-Control": "no-store" } });
}
