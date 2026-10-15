import { draftZip, zipFileName } from "@hl-bos/site-builder";

import { FileDraftRepository } from "@/lib/site-store";

export const dynamic = "force-dynamic";

/** The demo as a ZIP: index.html, LAUNCH-CHECKLIST.md, README.txt. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const draft = await new FileDraftRepository().getByProspect(id);
  if (!draft)
    return new Response("No demo has been built for this lead yet.", { status: 404 });
  const zip = await draftZip(draft, new Date());
  return new Response(new Blob([new Uint8Array(zip)]), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${zipFileName(draft)}"`,
      "cache-control": "no-store",
    },
  });
}
