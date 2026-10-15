import { draftZip, zipFileName } from "@hl-bos/site-builder";

import { draftKey } from "@/lib/profiles";
import { FileDraftRepository, FileProfileRepository } from "@/lib/site-store";

export const dynamic = "force-dynamic";

/** The internal draft as a ZIP: index.html, LAUNCH-CHECKLIST.md, README.txt. */
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
  const zip = await draftZip(draft, new Date());
  return new Response(new Blob([new Uint8Array(zip)]), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${zipFileName(draft)}"`,
      "cache-control": "no-store",
    },
  });
}
