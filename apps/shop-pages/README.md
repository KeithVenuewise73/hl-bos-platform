# Shop Pages

Serves a shop's published `owned_website` page to the public internet.

## What this is, and what it is not

It is **the same handler** the Supabase `site` edge function runs. `server.ts`
imports `handle()` from
`supabase/functions/_shared/barberos/site_server.ts` — it does not copy it — so
routing, headers, caching, the lowercase redirect and the 404-that-hides-drafts
have exactly one implementation and one set of tests.

What differs is the host, and only two things follow from that:

|                     | Supabase `site` function    | This           |
| ------------------- | --------------------------- | -------------- |
| Page address        | `/functions/v1/site/<slug>` | `/<slug>`      |
| `Content-Type` HTML | rewritten to `text/plain`   | served as sent |

The second row is why this exists. Supabase documents it plainly: _"HTML content
is not supported. `GET` requests that return `text/html` will be rewritten to
`text/plain`."_ On the shared `*.supabase.co` domain a shop's page renders as its
own source code. Nothing rewrites anything here.

The Supabase deployment is not retired. It is the same code, it proves the
database path works as `anon` in production, and it remains a correct
API-shaped endpoint.

## Configuration

Three variables, all required. The server refuses to start without them rather
than guessing.

| Variable            | Example                              | Why                                                              |
| ------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| `SUPABASE_URL`      | `https://<ref>.supabase.co`          | Where the two read-only RPCs live.                               |
| `SUPABASE_ANON_KEY` | the project's anon / publishable key | Read-only, published-pages-only. **Never** the service-role key. |
| `SITE_PUBLIC_BASE`  | `https://shops.example.com`          | The address customers type.                                      |
| `PORT`              | `3000` (default)                     | Optional; the container is told its port.                        |

`SITE_PUBLIC_BASE` is required, not inferred, and that is the scar of a real
bug: the first deployment of this module built absolute URLs from the request
and advertised a sitemap on `edge-runtime.supabase.com`, a host we do not own.
Behind any proxy a request knows neither its external hostname nor its external
path prefix. It has to be told.

## Deploying on Coolify

- **Build pack:** Dockerfile
- **Base directory:** `/` — the build context must be the repository root,
  because the server imports the shared handler from `supabase/functions/`
- **Dockerfile location:** `apps/shop-pages/Dockerfile`
- **Port:** `3000`
- **Health check path:** `/robots.txt`

A note on that health check, so nobody later reads more into it than it says:
`/robots.txt` needs no database, so it proves the process is up and answering
and it proves nothing about whether the database is reachable. A green health
check with a broken database would show visitors a 503 page, which is the
correct behaviour but is not "healthy". Checking a real page instead would put a
database query on every health probe; that trade was made deliberately in favour
of the cheap check.

## What it can reach

`public.barberos_published_site()` and `public.barberos_published_sitemap()`
(migration 0053), called with the anon key. Those return **published pages
only** — a draft, an unpublished page and a slug nobody has used are all `NULL`,
and all three render the same byte-identical 404, so nobody can probe for pages a
shop has not published. There is no write path from this process at any depth,
and no service-role key is read.

The container runs as the non-root `deno` user with `--allow-net` and an
explicit `--allow-env` allowlist. No filesystem write, no subprocesses, no FFI.

## Running it locally

```bash
SUPABASE_URL=... SUPABASE_ANON_KEY=... SITE_PUBLIC_BASE=http://127.0.0.1:3000 \
  deno run --allow-net --allow-env apps/shop-pages/server.ts
```

The end-to-end (`scripts/local-test/site-serve-e2e.mjs`) starts this exact
entrypoint against a real PostgreSQL through a shim that executes every call as
the `anon` role, and asserts the root-path shape: a page at `/<slug>`
byte-identical to the other deployment's, served as real HTML with our own CSP,
a sitemap of clean root URLs, a redirect with no path prefix, and a draft still
invisible.
