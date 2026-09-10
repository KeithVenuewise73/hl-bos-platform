// site — serves a shop's published page to the public internet.
//
// This is the first HL-BOS edge function that is actually deployed, and the
// first HTTP surface in the platform that answers a caller with no account. Two
// consequences shape it.
//
// FIRST: it must run without a JWT. `supabase/config.toml` sets
// verify_jwt = false for this function ONLY. Every other function in this
// repository keeps the default, and a website that required a login to read
// would not be a website.
//
// SECOND: it has no third-party dependencies. The sibling functions use
// `jsr:@supabase/supabase-js`, which is the right choice when a function needs
// auth, realtime and a query builder; this one needs a single POST, and for an
// unauthenticated endpoint the smallest possible serving path is worth more
// than the convenience.
//
// WHAT IT CAN REACH. `public.barberos_published_site()` and
// `public.barberos_published_sitemap()` (migration 0053), called with the ANON
// key -- never the service role, which is not read here. Those two functions
// return published pages and nothing else, so even a total compromise of this
// process reads only what is already on the public internet, and can write
// nothing at any depth.
//
// Everything it actually does lives in two files that need no server and no
// network to test: `_shared/barberos/site_server.ts` (routing, headers,
// caching) and `_shared/barberos/site_source_rest.ts` (the two calls).

import { handle } from "../_shared/barberos/site_server.ts";
import { restSource } from "../_shared/barberos/site_source_rest.ts";

function required(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing required environment variable: ${name}`);
  return v;
}

const supabaseUrl = required("SUPABASE_URL");
const source = restSource(supabaseUrl, required("SUPABASE_ANON_KEY"));

// THE PUBLIC ADDRESS IS CONFIGURATION, NOT SOMETHING TO SNIFF.
//
// The first deployment of this function proved why: inside Supabase's edge
// runtime `x-forwarded-host` is `edge-runtime.supabase.com`, so a robots.txt
// built from the request advertised a sitemap on a domain we do not own, and
// the 301 redirect sent visitors there too (it answered 401
// INVALID_DENO_SUBHOST). The request genuinely does not know.
//
// SITE_PUBLIC_BASE is what to set when these pages get a real address -- a
// custom domain, or a proxy that serves them at the root. Until then the
// project's own API URL plus this function's path is exactly right, and needs
// no configuration to be correct.
const publicBase =
  Deno.env.get("SITE_PUBLIC_BASE") ??
  `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/site`;

Deno.serve((req) => handle(req, source, publicBase));
