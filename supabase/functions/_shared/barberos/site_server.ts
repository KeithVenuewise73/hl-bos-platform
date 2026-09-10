// Serving a shop's page: routing, headers and the four things a visitor can ask
// for. Everything except the actual data fetch lives here, so all of it is
// testable without a network or a database.
//
// WHAT IS DELIBERATELY NOT HERE
//
// No framework, no router library, no Supabase client. This is the first thing
// in the platform reachable by an unauthenticated stranger, so its dependency
// list is a security property: one `fetch` to one RPC, written out in
// `../../site/index.ts`, and nothing else. A page with no third-party code in
// its serving path cannot be compromised by third-party code in its serving
// path.
//
// WHAT A 404 MUST NOT SAY
//
// A slug nobody has used, a draft, and an unpublished page all produce exactly
// the same 404 with exactly the same body. That is not laziness: the database
// returns NULL for all three (migration 0053), and if this layer distinguished
// them it would hand anyone with a wordlist a way to find out which shops have
// pages they have not published yet.

import { renderSite, esc, type SiteContent } from "./site_render.ts";

export interface SitemapEntry {
  slug: string;
  published_at: string | null;
}

/**
 * Where the pages come from. Injected so the routing above can be tested
 * against fakes, and so the same handler runs against PostgREST in production
 * and against a local PostgreSQL in `scripts/local-test/`.
 */
export interface SiteSource {
  page(slug: string): Promise<SiteContent | null>;
  sitemap(): Promise<SitemapEntry[]>;
}

/** The same shape `barberos.sites.slug` is constrained to. */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

export type Route =
  | { kind: "page"; slug: string }
  | { kind: "moved"; to: string }
  | { kind: "robots" }
  | { kind: "sitemap" }
  | { kind: "none" };

// Supabase serves this at /site/<slug> and, through the API gateway, at
// /functions/v1/site/<slug>. Both are consumed here, in order and each at most
// once, so a shop whose slug happens to be "site" is still reachable at
// /site/site rather than vanishing.
const PREFIX = ["functions", "v1", "site"] as const;

export function splitPath(pathname: string): { basePath: string; rest: string[] } {
  const all = pathname.split("/").filter((s) => s.length > 0);
  let i = 0;
  let p = 0;
  while (i < all.length && p < PREFIX.length) {
    if (all[i]!.toLowerCase() === PREFIX[p]) i++;
    p++;
  }
  return { basePath: "/" + all.slice(0, i).join("/"), rest: all.slice(i) };
}

export function routeOf(pathname: string): Route {
  const { basePath, rest } = splitPath(pathname);
  if (rest.length !== 1) return { kind: "none" };

  const raw = rest[0]!;
  if (raw === "robots.txt") return { kind: "robots" };
  if (raw === "sitemap.xml") return { kind: "sitemap" };

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return { kind: "none" };
  }

  // Slugs are lowercase by constraint. Rather than 404 someone who typed or was
  // sent a capitalised link, send them to the one real address -- a permanent
  // redirect, not a second URL serving the same page, so there is no duplicate
  // for a search engine to split the shop's ranking between.
  const slug = decoded.toLowerCase();
  if (!SLUG_RE.test(slug)) return { kind: "none" };
  if (slug !== decoded) {
    return { kind: "moved", to: `${basePath === "/" ? "" : basePath}/${slug}` };
  }
  return { kind: "page", slug };
}

/**
 * The address this page is being served at, as seen from outside. Read from the
 * forwarding headers when they are present, because behind Supabase's gateway
 * the request URL is the internal one.
 */
export function publicOrigin(req: Request): string {
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}

async function etagOf(body: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  const hex = Array.from(new Uint8Array(digest))
    .slice(0, 12)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `"${hex}"`;
}

// The rendered page is entirely self-contained -- one inline <style>, no
// scripts, no external anything -- so the policy that describes it is almost
// entirely 'none'. If a future renderer wants a font or an image, this is the
// line that has to change first, on purpose.
const CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

function baseHeaders(): Record<string, string> {
  return {
    "content-security-policy": CSP,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-frame-options": "DENY",
  };
}

const NOT_FOUND_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Page not found</title>
<style>body{font:16px/1.6 system-ui,sans-serif;margin:0;padding:3rem 1.25rem;color:#1a1a1a}
main{max-width:32rem;margin:0 auto}h1{font-size:1.35rem;margin:0 0 .5rem}
p{margin:0;color:#555}</style>
</head>
<body><main>
<h1>Page not found</h1>
<p>There is no page at this address.</p>
</main></body>
</html>`;

function notFound(): Response {
  return new Response(NOT_FOUND_HTML, {
    status: 404,
    headers: {
      ...baseHeaders(),
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=60",
      "x-robots-tag": "noindex",
    },
  });
}

/**
 * One request in, one response out. `source` is the only thing that touches the
 * database; every other decision here is made from the request alone.
 */
export async function handle(req: Request, source: SiteSource): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed\n", {
      status: 405,
      headers: { ...baseHeaders(), allow: "GET, HEAD", "content-type": "text/plain" },
    });
  }

  const url = new URL(req.url);
  const route = routeOf(url.pathname);
  const origin = publicOrigin(req);

  if (route.kind === "none") return notFound();

  if (route.kind === "moved") {
    return new Response(null, {
      status: 301,
      headers: { ...baseHeaders(), location: `${origin}${route.to}${url.search}` },
    });
  }

  if (route.kind === "robots") {
    const { basePath } = splitPath(url.pathname);
    const body = `User-agent: *\nAllow: /\n\nSitemap: ${origin}${basePath === "/" ? "" : basePath}/sitemap.xml\n`;
    return respond(req, body, "text/plain; charset=utf-8", "public, max-age=3600");
  }

  try {
    if (route.kind === "sitemap") {
      const { basePath } = splitPath(url.pathname);
      const prefix = `${origin}${basePath === "/" ? "" : basePath}`;
      const entries = await source.sitemap();
      const urls = entries
        .filter((e) => SLUG_RE.test(e.slug))
        .map((e) => {
          const lastmod = e.published_at ? e.published_at.slice(0, 10) : null;
          return (
            `  <url><loc>${esc(`${prefix}/${e.slug}`)}</loc>` +
            (lastmod ? `<lastmod>${esc(lastmod)}</lastmod>` : "") +
            `</url>`
          );
        })
        .join("\n");
      const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
      return respond(
        req,
        body,
        "application/xml; charset=utf-8",
        "public, max-age=600",
      );
    }

    const content = await source.page(route.slug);
    // Null covers all three of "no such slug", "draft" and "unpublished", and
    // this layer never learns which. See the note at the top of the file.
    if (!content) return notFound();

    return await respond(
      req,
      renderSite(content),
      "text/html; charset=utf-8",
      "public, max-age=60, s-maxage=300",
    );
  } catch (e) {
    // The database is unreachable or answered wrongly. Say so as a status code
    // and log it server-side; never render the error into the shop's page,
    // where a customer would read it as the shop being broken.
    console.error("site: source failed:", e instanceof Error ? e.message : String(e));
    return new Response("This page is temporarily unavailable.\n", {
      status: 503,
      headers: {
        ...baseHeaders(),
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "retry-after": "30",
      },
    });
  }
}

async function respond(
  req: Request,
  body: string,
  contentType: string,
  cacheControl: string,
): Promise<Response> {
  const etag = await etagOf(body);
  const headers = {
    ...baseHeaders(),
    "content-type": contentType,
    "cache-control": cacheControl,
    etag,
  };
  // A shop's page changes when the shop changes it and not otherwise, so a
  // repeat visitor should be re-sent bytes only when there are new ones.
  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(req.method === "HEAD" ? null : body, { status: 200, headers });
}
