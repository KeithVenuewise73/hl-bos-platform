import { renderSite } from "@hl-bos/site-builder";

import { PREVIEW_HEADERS } from "@/lib/demo";
import { FileDraftRepository } from "@/lib/site-store";

export const dynamic = "force-dynamic";

/** The demo page itself, rendered fresh from the draft. Local only, noindex, no scripts. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const draft = await new FileDraftRepository().getByProspect(id);
  if (!draft)
    return new Response("No demo has been built for this lead yet.", { status: 404 });
  return new Response(renderSite(draft), { headers: PREVIEW_HEADERS });
}
