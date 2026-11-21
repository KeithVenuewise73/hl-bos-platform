// The one thing that talks to the database: two POSTs to two RPCs.
//
// Separate from `../../site/index.ts` so it can be tested without starting a
// server, and separate from `site_server.ts` so the routing can be tested
// without a network.
//
// It calls the functions migration 0053 exposes, with the ANON key. Those
// return published pages and nothing else, so this file holds no privilege
// worth stealing and has no write path at any depth.

import type { SiteContent } from "./site_render.ts";
import type { SiteSource, SitemapEntry } from "./site_server.ts";

export function restSource(baseUrl: string, anonKey: string): SiteSource {
  const root = baseUrl.replace(/\/+$/, "");

  const call = async (fn: string, body: Record<string, unknown>): Promise<unknown> => {
    const r = await fetch(`${root}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      // The status is enough to diagnose from the logs. The response body is
      // deliberately not included: a PostgREST error can echo the statement,
      // and this string travels towards a public response.
      throw new Error(`${fn} returned ${r.status}`);
    }
    return await r.json();
  };

  return {
    async page(slug: string): Promise<SiteContent | null> {
      const out = await call("barberos_published_site", { p_slug: slug });
      // The RPC returns the page object, or JSON null for all of "no such
      // slug", "draft" and "unpublished". Anything that is not an object is
      // treated as absent rather than rendered: a 200 carrying a surprise is
      // still a surprise.
      if (out === null || typeof out !== "object" || Array.isArray(out)) return null;
      return out as SiteContent;
    },
    async sitemap(): Promise<SitemapEntry[]> {
      const out = await call("barberos_published_sitemap", {});
      if (!Array.isArray(out)) return [];
      return out.filter(
        (e): e is SitemapEntry =>
          !!e && typeof e === "object" && typeof (e as SitemapEntry).slug === "string",
      );
    },
  };
}
