import { premiumZip, premiumZipName } from "@hl-bos/site-builder";

import { readAsset } from "@/lib/premium-runtime";
import { FilePremiumRepository } from "@/lib/site-store";

export const dynamic = "force-dynamic";

/** The premium draft as a ZIP: six pages, stylesheet, fonts and licences, readiness, readme. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const d = await new FilePremiumRepository().getByProfile(id);
  if (!d)
    return new Response("No premium site has been built for this profile yet.", {
      status: 404,
    });
  const zip = await premiumZip(d, readAsset, new Date());
  return new Response(new Blob([new Uint8Array(zip)]), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${premiumZipName(d)}"`,
      "cache-control": "no-store",
    },
  });
}
