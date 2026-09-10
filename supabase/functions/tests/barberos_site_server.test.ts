// The serving layer. What a stranger gets, and what a stranger cannot get.
//
// Most of these assert a NEGATIVE, because the interesting failures here are
// all things leaking out: a draft distinguishable from a missing page, an
// error message rendered onto a shop's own page, a write reachable by changing
// the method.

import {
  handle,
  publicOrigin,
  routeOf,
  splitPath,
  type SiteSource,
  type SitemapEntry,
} from "../_shared/barberos/site_server.ts";
import { restSource } from "../_shared/barberos/site_source_rest.ts";
import type { SiteContent } from "../_shared/barberos/site_render.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("assertion failed: " + msg);
}
function assertEquals<T>(a: T, b: T, msg: string) {
  if (a !== b) throw new Error(`assertion failed: ${msg} (got ${a}, want ${b})`);
}

const PUBLISHED: SiteContent = {
  slug: "elmwood-barber-co",
  status: "published",
  shop_name: "Elmwood Barber Co.",
  headline: "Traditional cuts on Elmwood",
  about: null,
  phone: "(716) 555-0100",
  address_line1: "742 Elmwood Ave",
  locality: "Buffalo",
  region: "NY",
  postal_code: "14222",
  map_url: null,
  booking_url: null,
  hours: [{ day: 1, closed: false, opens: "09:00:00", closes: "19:00:00" }],
  services: [{ name: "Haircut", price_cents: 3500, duration_minutes: 30 }],
  links: [],
};

/** Only `elmwood-barber-co` is published. Everything else is absent. */
function source(over: Partial<SiteSource> = {}): SiteSource {
  return {
    page: (slug) => Promise.resolve(slug === PUBLISHED.slug ? PUBLISHED : null),
    sitemap: () =>
      Promise.resolve<SitemapEntry[]>([
        { slug: "elmwood-barber-co", published_at: "2026-09-10T12:00:00+00:00" },
      ]),
    ...over,
  };
}

const get = (path: string, init: RequestInit = {}) =>
  handle(new Request(`https://shops.example${path}`, init), source());

// ===========================================================================
// Routing
// ===========================================================================

Deno.test("the function name is consumed however Supabase spells the path", () => {
  for (const p of [
    "/site/elmwood-barber-co",
    "/functions/v1/site/elmwood-barber-co",
    "/elmwood-barber-co",
  ]) {
    const r = routeOf(p);
    assertEquals(r.kind, "page", `${p} routes to a page`);
    assertEquals(
      r.kind === "page" ? r.slug : "",
      "elmwood-barber-co",
      `${p} keeps the slug`,
    );
  }
});

Deno.test("a shop whose slug is a path word is still reachable", () => {
  // The prefix is consumed in order, each part at most once, so "site" as a
  // slug does not get eaten by the "site" in the path.
  const r = routeOf("/site/site");
  assertEquals(r.kind, "page", "routed");
  assertEquals(r.kind === "page" ? r.slug : "", "site", "the slug survived");
});

Deno.test(
  "splitPath reports the prefix, which is what absolute URLs are built from",
  () => {
    assertEquals(
      splitPath("/functions/v1/site/x").basePath,
      "/functions/v1/site",
      "full",
    );
    assertEquals(splitPath("/site/x").basePath, "/site", "short");
    assertEquals(splitPath("/x").basePath, "/", "none");
  },
);

Deno.test("anything that is not one slug is not a page", () => {
  for (const p of ["/site", "/site/a/b", "/site/", "/"]) {
    assertEquals(routeOf(p).kind, "none", `${p} is not a page`);
  }
});

Deno.test(
  "a slug the database could not hold is refused before the database is asked",
  () => {
    for (const bad of [
      "Elmwood_Barber",
      "-leading-dash",
      "trailing-dash-",
      "a",
      "x".repeat(65),
      "../../etc/passwd",
      "elmwood%00",
    ]) {
      assert(routeOf(`/site/${bad}`).kind !== "page", `${bad} is not a page route`);
    }
  },
);

Deno.test(
  "a capitalised link is redirected to the one real address, not duplicated",
  () => {
    const r = routeOf("/site/Elmwood-Barber-Co");
    assertEquals(r.kind, "moved", "permanent redirect");
    assertEquals(r.kind === "moved" ? r.slug : "", "elmwood-barber-co", "lowercased");
  },
);

Deno.test("a malformed percent-escape is a 404, not a crash", () => {
  assertEquals(routeOf("/site/%E0%A4%A").kind, "none", "refused");
});

// ===========================================================================
// What comes back
// ===========================================================================

Deno.test("a published page is served as HTML the shop would recognise", async () => {
  const res = await get("/site/elmwood-barber-co");
  assertEquals(res.status, 200, "200");
  assertEquals(
    res.headers.get("content-type"),
    "text/html; charset=utf-8",
    "content type",
  );
  const html = await res.text();
  assert(html.includes("Elmwood Barber Co."), "the shop's name");
  assert(html.includes("Traditional cuts on Elmwood"), "its headline");
  assert(html.includes('href="tel:7165550100"'), "a working call button");
});

Deno.test(
  "a draft and a slug nobody has used are byte-for-byte the same 404",
  async () => {
    // The whole point. If these differed, a wordlist would reveal which shops
    // have pages they have not published.
    const a = await get("/site/some-unpublished-shop");
    const b = await get("/site/no-such-shop-anywhere");
    assertEquals(a.status, 404, "draft-ish is 404");
    assertEquals(b.status, 404, "unknown is 404");
    assertEquals(await a.text(), await b.text(), "identical bodies");
  },
);

Deno.test("a 404 asks not to be indexed, and a page does not", async () => {
  const missing = await get("/site/no-such-shop-anywhere");
  assertEquals(missing.headers.get("x-robots-tag"), "noindex", "404 is noindex");
  const page = await get("/site/elmwood-barber-co");
  assertEquals(page.headers.get("x-robots-tag"), null, "a real page is indexable");
});

Deno.test("every response carries the headers that keep the page inert", async () => {
  for (const path of ["/site/elmwood-barber-co", "/site/nothing-here"]) {
    const res = await get(path);
    const csp = res.headers.get("content-security-policy") ?? "";
    assert(csp.includes("default-src 'none'"), `${path}: nothing loads by default`);
    assert(csp.includes("frame-ancestors 'none'"), `${path}: cannot be framed`);
    assert(!csp.includes("script-src"), `${path}: scripts are not re-allowed`);
    assertEquals(
      res.headers.get("x-content-type-options"),
      "nosniff",
      `${path}: nosniff`,
    );
    assertEquals(
      res.headers.get("referrer-policy"),
      "no-referrer",
      `${path}: referrer`,
    );
  }
});

// ===========================================================================
// Methods
// ===========================================================================

Deno.test("nothing but GET and HEAD is accepted", async () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const res = await get("/site/elmwood-barber-co", { method });
    assertEquals(res.status, 405, `${method} refused`);
    assertEquals(res.headers.get("allow"), "GET, HEAD", `${method} is told what is`);
  }
});

Deno.test("HEAD returns the headers of the page and none of the page", async () => {
  const head = await get("/site/elmwood-barber-co", { method: "HEAD" });
  assertEquals(head.status, 200, "200");
  assertEquals(await head.text(), "", "no body");
  const full = await get("/site/elmwood-barber-co");
  assertEquals(head.headers.get("etag"), full.headers.get("etag"), "same etag");
});

// ===========================================================================
// Caching
// ===========================================================================

Deno.test("an unchanged page is not sent twice", async () => {
  const first = await get("/site/elmwood-barber-co");
  const etag = first.headers.get("etag");
  assert(etag && /^"[0-9a-f]{24}"$/.test(etag), "a strong etag");
  const second = await handle(
    new Request("https://shops.example/site/elmwood-barber-co", {
      headers: { "if-none-match": etag! },
    }),
    source(),
  );
  assertEquals(second.status, 304, "not modified");
  assertEquals(await second.text(), "", "and no body");
});

Deno.test("a stale etag gets the page", async () => {
  const res = await handle(
    new Request("https://shops.example/site/elmwood-barber-co", {
      headers: { "if-none-match": '"deadbeefdeadbeefdeadbeef"' },
    }),
    source(),
  );
  assertEquals(res.status, 200, "served");
});

// ===========================================================================
// robots and sitemap
// ===========================================================================

Deno.test(
  "robots points at the CONFIGURED sitemap address, not a sniffed one",
  async () => {
    // The bug the first deployment found: inside Supabase's edge runtime
    // x-forwarded-host is `edge-runtime.supabase.com`, so a robots.txt built
    // from the request advertised a sitemap on a domain we do not own. The
    // configured base must win over anything in the request.
    const res = await handle(
      new Request("https://internal.invalid/site/robots.txt", {
        headers: { "x-forwarded-host": "edge-runtime.supabase.com" },
      }),
      source(),
      "https://shops.example/functions/v1/site",
    );
    const body = await res.text();
    assert(body.includes("Allow: /"), "indexing is allowed -- that is the point");
    assert(
      body.includes("Sitemap: https://shops.example/functions/v1/site/sitemap.xml"),
      "the configured base, not the forwarded host",
    );
    assert(!body.includes("edge-runtime"), "the internal host appears nowhere");
  },
);

Deno.test("a trailing slash on the configured base does not double up", async () => {
  const res = await handle(
    new Request("https://x.invalid/site/robots.txt"),
    source(),
    "https://shops.example/site/",
  );
  assert(
    (await res.text()).includes("Sitemap: https://shops.example/site/sitemap.xml"),
    "one slash",
  );
});

Deno.test("the redirect is relative, so it is right on every address", async () => {
  // An absolute Location built from the request sent visitors to
  // edge-runtime.supabase.com, which answered 401 INVALID_DENO_SUBHOST. A
  // relative Location is resolved by the browser against the address it
  // actually used, so it is correct on the Supabase URL, on a custom domain and
  // behind any proxy.
  const res = await handle(
    new Request("https://internal.invalid/functions/v1/site/Elmwood-Barber-Co", {
      headers: { "x-forwarded-host": "edge-runtime.supabase.com" },
    }),
    source(),
  );
  assertEquals(res.status, 301, "permanent");
  assertEquals(
    res.headers.get("location"),
    "/functions/v1/site/elmwood-barber-co",
    "relative, no host, and the PUBLIC path prefix",
  );
});

Deno.test(
  "the redirect uses the PUBLIC path, not the one the request arrived on",
  async () => {
    // The production bug, exactly. Supabase's gateway strips `/functions/v1`
    // before the function sees the URL, so a redirect built from the request path
    // pointed at `/site/x` -- which the gateway rejects as an invalid path. The
    // configured base carries the external prefix; the request does not have it.
    const res = await handle(
      new Request("https://internal.invalid/site/Elmwood-Barber-Co"),
      source(),
      "https://shops.example/functions/v1/site",
    );
    assertEquals(res.status, 301, "permanent");
    assertEquals(
      res.headers.get("location"),
      "/functions/v1/site/elmwood-barber-co",
      "the prefix the visitor actually needs",
    );
  },
);

Deno.test("pages served at the root of a host redirect to the root", async () => {
  const res = await handle(
    new Request("https://internal.invalid/site/Elmwood-Barber-Co"),
    source(),
    "https://shops.example",
  );
  assertEquals(res.headers.get("location"), "/elmwood-barber-co", "no prefix at all");
});

Deno.test("a query string survives the redirect", async () => {
  const res = await get("/site/Elmwood-Barber-Co?utm_source=card");
  assertEquals(
    res.headers.get("location"),
    "/site/elmwood-barber-co?utm_source=card",
    "kept",
  );
});

Deno.test(
  "the sitemap lists published pages as absolute, configured URLs",
  async () => {
    const res = await handle(
      new Request("https://internal.invalid/functions/v1/site/sitemap.xml", {
        headers: { "x-forwarded-host": "edge-runtime.supabase.com" },
      }),
      source(),
      "https://shops.example/functions/v1/site",
    );
    assertEquals(
      res.headers.get("content-type"),
      "application/xml; charset=utf-8",
      "xml",
    );
    const xml = await res.text();
    assert(
      xml.includes(
        "<loc>https://shops.example/functions/v1/site/elmwood-barber-co</loc>",
      ),
      "absolute, from the configured base",
    );
    assert(!xml.includes("edge-runtime"), "and never the internal host");
    assert(xml.includes("<lastmod>2026-09-10</lastmod>"), "a date, not a timestamp");
  },
);

Deno.test(
  "a slug the sitemap should not contain is dropped rather than emitted",
  async () => {
    // Defence in depth: the constraint makes this impossible in the database,
    // so if one ever appears here something upstream is wrong and the sitemap
    // should not be the thing that publishes it.
    const res = await handle(
      new Request("https://shops.example/site/sitemap.xml"),
      source({
        sitemap: () =>
          Promise.resolve([
            { slug: "ok-shop", published_at: null },
            { slug: "../../evil", published_at: null },
            { slug: "<script>", published_at: null },
          ]),
      }),
    );
    const xml = await res.text();
    assert(xml.includes("ok-shop"), "the good one is there");
    assert(!xml.includes("evil"), "the traversal is not");
    assert(!xml.includes("<script>"), "nor the tag");
  },
);

// ===========================================================================
// When the database is unreachable
// ===========================================================================

Deno.test(
  "a database failure is a 503, and never text on the shop's page",
  async () => {
    const res = await handle(
      new Request("https://shops.example/site/elmwood-barber-co"),
      source({
        page: () => Promise.reject(new Error("connection refused to 10.0.0.4")),
      }),
    );
    assertEquals(res.status, 503, "503, not 200 with an apology");
    const body = await res.text();
    assert(!body.includes("10.0.0.4"), "no internals in the response");
    assert(!body.includes("connection refused"), "not even the reason");
    assertEquals(res.headers.get("cache-control"), "no-store", "and it is not cached");
  },
);

// ===========================================================================
// publicOrigin
// ===========================================================================

Deno.test(
  "the public address comes from the forwarding headers when there are any",
  () => {
    const fwd = new Request("https://internal.invalid/site/x", {
      headers: { "x-forwarded-host": "shops.example", "x-forwarded-proto": "https" },
    });
    assertEquals(publicOrigin(fwd), "https://shops.example", "forwarded wins");
    const plain = new Request("https://direct.example/site/x");
    assertEquals(
      publicOrigin(plain),
      "https://direct.example",
      "otherwise the request",
    );
  },
);

// ===========================================================================
// The REST source
// ===========================================================================

Deno.test("the source sends the anon key and asks for exactly one slug", async () => {
  let seen: { url: string; body: string; headers: Headers } | null = null;
  const original = globalThis.fetch;
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    seen = {
      url: String(url),
      body: String(init?.body ?? ""),
      headers: new Headers(init?.headers),
    };
    return Promise.resolve(
      new Response(JSON.stringify(PUBLISHED), {
        headers: { "content-type": "application/json" },
      }),
    );
  }) as typeof fetch;
  try {
    const s = restSource("https://db.example/", "anon-key-value");
    const page = await s.page("elmwood-barber-co");
    assertEquals(page?.shop_name, "Elmwood Barber Co.", "the page came back");
    assertEquals(
      seen!.url,
      "https://db.example/rest/v1/rpc/barberos_published_site",
      "trailing slash trimmed, one RPC",
    );
    assertEquals(seen!.body, '{"p_slug":"elmwood-barber-co"}', "one parameter");
    assertEquals(seen!.headers.get("apikey"), "anon-key-value", "anon key sent");
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test(
  "a null answer is absence, and a surprise answer is also absence",
  async () => {
    const original = globalThis.fetch;
    const answering = (body: string) => {
      globalThis.fetch = (() =>
        Promise.resolve(
          new Response(body, { headers: { "content-type": "application/json" } }),
        )) as typeof fetch;
      return restSource("https://db.example", "k");
    };
    try {
      assertEquals(await answering("null").page("x"), null, "null is absent");
      assertEquals(await answering('"a string"').page("x"), null, "a string is absent");
      assertEquals(await answering("[]").page("x"), null, "an array is absent");
      assertEquals((await answering("null").sitemap()).length, 0, "sitemap too");
      assertEquals(
        (await answering('[{"slug":"a"},{"nope":1}]').sitemap()).length,
        1,
        "and rows without a slug are dropped",
      );
    } finally {
      globalThis.fetch = original;
    }
  },
);

Deno.test("an error status raises without echoing the body back", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response('{"message":"syntax error at or near SELECT secret"}', {
        status: 400,
      }),
    )) as typeof fetch;
  try {
    await restSource("https://db.example", "k").page("x");
    throw new Error("assertion failed: it should have raised");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    assert(msg.includes("returned 400"), "the status is reported");
    assert(!msg.includes("secret"), "the database's own words are not");
  } finally {
    globalThis.fetch = original;
  }
});
