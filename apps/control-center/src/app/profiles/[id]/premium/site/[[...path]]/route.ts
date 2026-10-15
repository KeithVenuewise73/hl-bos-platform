import { premiumAsset } from "@hl-bos/site-builder";

import { PREMIUM_PREVIEW_CSP } from "@/lib/premium";
import { readAsset } from "@/lib/premium-runtime";
import { FilePremiumRepository } from "@/lib/site-store";

export const dynamic = "force-dynamic";

/**
 * Serves one premium draft's pages, stylesheet and fonts to the console's
 * sandboxed preview. Local only, noindex, no scripts, same-origin assets only.
 * Only files the draft actually has are served; anything else is a 404.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; path?: string[] }> },
): Promise<Response> {
  const { id, path = [] } = await ctx.params;
  const d = await new FilePremiumRepository().getByProfile(id);
  if (!d)
    return new Response("No premium site has been built for this profile yet.", {
      status: 404,
    });
  const a = premiumAsset(d, path.join("/"));
  if (!a) return new Response("Not part of this site.", { status: 404 });
  const common = {
    "cache-control": "no-store",
    "x-robots-tag": "noindex, nofollow",
    "x-content-type-options": "nosniff",
  };
  if (a.kind === "page")
    return new Response(a.html, {
      headers: {
        ...common,
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": PREMIUM_PREVIEW_CSP,
      },
    });
  if (a.kind === "css")
    return new Response(a.css, {
      headers: { ...common, "content-type": "text/css; charset=utf-8" },
    });
  // The preview frame is sandboxed (an opaque origin), and fonts are fetched
  // with CORS, so the console's own fonts must allow it. They are public
  // OFL files; nothing private is exposed.
  return new Response(new Blob([new Uint8Array(await readAsset(a.file))]), {
    headers: {
      ...common,
      "content-type": "font/woff2",
      "access-control-allow-origin": "*",
    },
  });
}
