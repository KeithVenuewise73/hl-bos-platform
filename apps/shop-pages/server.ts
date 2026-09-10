// shop-pages — the shop website server, for a host that can actually serve HTML.
//
// WHY THIS EXISTS SEPARATELY FROM supabase/functions/site
//
// It is the same handler. Not a port, not a rewrite, not a copy: this file
// imports `handle()` from the same module the Supabase deployment imports, so
// there is exactly one implementation of routing, headers, caching and the
// 404-that-hides-drafts, and one set of tests covering it.
//
// What differs is only what a host does with the response. Supabase's Edge
// Function gateway rewrites `text/html` to `text/plain` on its shared domain --
// their documentation says so outright -- so a shop's page renders there as its
// own source code. Nothing rewrites anything here.
//
// WHAT DIFFERS, CONCRETELY
//
//   * pages live at the ROOT: /<slug>, not /functions/v1/site/<slug>
//   * PORT comes from the environment, because a container is told its port
//   * SITE_PUBLIC_BASE is REQUIRED rather than defaulted. On Supabase there is
//     a correct default (the project's own API URL); here there is not, and a
//     guess would put the wrong hostname into robots.txt and the sitemap. The
//     first deployment of this module already produced that bug once by
//     inferring an address instead of being told one.
//
// WHAT IT CAN REACH. Two read-only RPCs, with the ANON key, which return
// published pages and nothing else. No service-role key is read here and there
// is no write path at any depth.

import { handle } from "../../supabase/functions/_shared/barberos/site_server.ts";
import { restSource } from "../../supabase/functions/_shared/barberos/site_source_rest.ts";

function required(name: string): string {
  const v = Deno.env.get(name);
  if (!v || v.trim() === "") {
    throw new Error(
      `missing required environment variable: ${name}. ` +
        `shop-pages needs SUPABASE_URL, SUPABASE_ANON_KEY and SITE_PUBLIC_BASE.`,
    );
  }
  return v.trim();
}

const supabaseUrl = required("SUPABASE_URL");
const anonKey = required("SUPABASE_ANON_KEY");

// The address customers actually type, e.g. https://shops.example.com -- used
// for the sitemap's absolute URLs, the Sitemap: line in robots.txt, and the
// path a lowercase redirect points at. Never inferred from the request: behind
// any proxy the request knows neither its external host nor its external path.
const publicBase = required("SITE_PUBLIC_BASE");

const port = Number(Deno.env.get("PORT") ?? "3000");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`PORT is not a usable port number: ${Deno.env.get("PORT")}`);
}

const source = restSource(supabaseUrl, anonKey);

console.log(`shop-pages listening on :${port}, serving ${publicBase}`);

// hostname 0.0.0.0 because inside a container the loopback default would be
// unreachable from the proxy in front of it.
Deno.serve({ port, hostname: "0.0.0.0" }, (req) => handle(req, source, publicBase));
