import { renderSite } from "@hl-bos/site-builder";

import { PREVIEW_HEADERS } from "@/lib/demo";
import { draftKey } from "@/lib/profiles";
import { FileDraftRepository, FileProfileRepository } from "@/lib/site-store";

export const dynamic = "force-dynamic";

/** The internal draft page itself, rendered fresh. Local only, noindex, no scripts. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const p = await new FileProfileRepository().get(id);
  const draft = p
    ? await new FileDraftRepository().getByProspect(draftKey(p))
    : undefined;
  if (!draft)
    return new Response("No internal draft has been built for this profile yet.", {
      status: 404,
    });
  return new Response(renderSite(draft), { headers: PREVIEW_HEADERS });
}
