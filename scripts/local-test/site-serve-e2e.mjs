// End-to-end: a real shop's page, served over real HTTP by the real edge
// function, out of the real database.
//
// Nothing here is a stand-in except the transport to PostgREST, and that shim
// runs the two functions AS THE `anon` ROLE, so the grants are exercised rather
// than assumed. The chain under test is:
//
//   HTTP request -> supabase/functions/site/index.ts (Deno.serve)
//     -> site_source_rest.ts (fetch, anon key)
//       -> public.barberos_published_site()  [as role anon]
//         -> barberos.published_site()       [published-only]
//           -> barberos.sites + hours + services + links
//     -> site_render.ts -> HTML
//
// The last two checks are the ones worth having: unpublishing a page must make
// the URL stop working, and republishing must bring it back. That is the only
// way to know the word "published" in the database means anything on the wire.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// `pg` and the shim live in the throwaway harness folder described in
// README.md, not in the repository. CommonJS `require` honours NODE_PATH and
// ESM import does not, so they are loaded this way rather than imported.
const require = createRequire(import.meta.url);
const pg = require("pg");
const { main: startShim } = require("./postgrest-rpc-shim.cjs");

const SHIM_PORT = 4556;
const SITE_PORT = 8000;
const PAGES_PORT = 8001;
const PAGES_BASE = `http://127.0.0.1:${PAGES_PORT}`;
const BASE = `http://127.0.0.1:${SITE_PORT}`;
const DENO = process.env["HLBOS_DENO"] || "deno";

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? " -- " + detail : ""}`);
  }
}

const db = new pg.Client({
  host: "/tmp",
  port: 5433,
  user: "postgres",
  database: "hlbos",
});
await db.connect();
const run = async (sql, p = []) => (await db.query(sql, p)).rows;

// --- Seed one published page and one draft, through the real write paths -----
await run(readFileSync("/tmp/pgtest/tests/_fixtures.sql.inc", "utf8"));
await run("select tests.seed()");
const T = (await run("select tests.uid('tenant_a') u"))[0].u;
const T2 = (await run("select tests.uid('tenant_b') u"))[0].u;

async function asOwner(which, fn) {
  await run("reset role");
  await run(
    `select set_config('request.jwt.claims',
       json_build_object('sub', tests.uid($1)::text,'role','authenticated')::text, false)`,
    [which],
  );
  await run("set role authenticated");
  await fn();
  await run("reset role");
}

await asOwner("owner_a", async () => {
  await run("select barberos.upsert_shop($1,'Truth Barbershop',2)", [T]);
  await run("select barberos.enable_capability($1,'owned_website')", [T]);
  await run(
    `select barberos.upsert_site($1,'truth-barbershop',
       'Barbering on Seneca Street', 'Truth has been cutting on Seneca Street for years.',
       '716-939-3443','2476 Seneca St','West Seneca','NY','14210',
       'https://maps.google.com/?q=2476+Seneca+St+West+Seneca+NY',
       'https://truthbarbershop.glossgenius.com/')`,
    [T],
  );
  for (const [d, closed, o, cl] of [
    [1, false, "09:00", "19:00"],
    [2, false, "09:00", "19:00"],
    [3, false, "09:00", "19:00"],
    [4, false, "09:00", "20:00"],
    [5, false, "09:00", "20:00"],
    [6, false, "08:00", "17:00"],
    [0, true, null, null],
  ]) {
    await run("select barberos.set_site_hours($1,$2::smallint,$3,$4::time,$5::time)", [
      T,
      d,
      closed,
      o,
      cl,
    ]);
  }
  for (const [n, p, dur, ord] of [
    ["Haircut", 3500, 30, 1],
    ["Skin fade", 4000, 45, 2],
    ["Hot towel shave", null, 45, 3],
  ]) {
    await run("select barberos.upsert_site_service($1,$2,$3,$4,$5)", [
      T,
      n,
      p,
      dur,
      ord,
    ]);
  }
  await run(
    "select barberos.set_site_link($1,'instagram','https://instagram.com/truthbarbershop')",
    [T],
  );
  await run("select barberos.publish_site($1)", [T]);
});

// A page that exists and is NOT published. It must be indistinguishable from
// a slug nobody has ever used.
await asOwner("owner_b", async () => {
  await run("select barberos.upsert_shop($1,'88 South Barbershop',1)", [T2]);
  await run("select barberos.enable_capability($1,'owned_website')", [T2]);
  await run("select barberos.upsert_site($1,'88-south-barbershop')", [T2]);
});

// --- Start the shim and the real function ------------------------------------
const shim = await startShim(SHIM_PORT);
const site = spawn(
  DENO,
  ["run", "--allow-net", "--allow-env", "--quiet", "supabase/functions/site/index.ts"],
  {
    env: {
      ...process.env,
      SUPABASE_URL: `http://127.0.0.1:${SHIM_PORT}`,
      SUPABASE_ANON_KEY: "local-anon-key",
      // The public address is configuration. Set here so the run also proves
      // the variable is read -- the first real deployment showed that a
      // request cannot tell the function its own public address.
      SITE_PUBLIC_BASE: `${BASE}/site`,
    },
    stdio: ["ignore", "inherit", "inherit"],
  },
);

async function waitFor(url) {
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(url);
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return false;
}

/** The second server, started part-way through. Killed in the finally block. */
let pages = null;

let exitCode = 1;
try {
  if (!(await waitFor(`${BASE}/site/robots.txt`)))
    throw new Error("the site function never came up");
  console.log("\nserving on", BASE, "\n");

  // --- The page ---------------------------------------------------------------
  const page = await fetch(`${BASE}/site/truth-barbershop`);
  const html = await page.text();
  check("a published page is served", page.status === 200, `status ${page.status}`);
  check("with the shop's name", html.includes("Truth Barbershop"));
  check(
    "its real phone number as a call button",
    html.includes('href="tel:7169393443"'),
  );
  check("the hours it stated", html.includes("9:00 am – 7:00 pm"));
  check("Sunday closed, because it said so", html.includes(">Closed<"));
  check("its prices", html.includes("$35") && html.includes("$40"));
  check("and no invented price for the shave", html.includes("Price on request"));
  check("a booking link", html.includes("truthbarbershop.glossgenius.com"));
  check(
    "served as HTML",
    page.headers.get("content-type") === "text/html; charset=utf-8",
  );
  check(
    "with a content security policy",
    (page.headers.get("content-security-policy") || "").includes("default-src 'none'"),
  );
  console.log(`       (${html.length} bytes)`);

  // --- The gateway path serves the same page ----------------------------------
  const viaGateway = await fetch(`${BASE}/functions/v1/site/truth-barbershop`);
  check(
    "the same page through the /functions/v1 path",
    viaGateway.status === 200 &&
      viaGateway.headers.get("etag") === page.headers.get("etag"),
  );

  // --- Not found, and the draft that must look identical ----------------------
  const draft = await fetch(`${BASE}/site/88-south-barbershop`);
  const nothing = await fetch(`${BASE}/site/no-such-shop-anywhere`);
  const draftBody = await draft.text();
  const nothingBody = await nothing.text();
  check("an unpublished page is 404", draft.status === 404, `status ${draft.status}`);
  check("an unused slug is 404", nothing.status === 404);
  check("and the two are byte-identical", draftBody === nothingBody);

  // --- Redirect, robots, sitemap ----------------------------------------------
  const caps = await fetch(`${BASE}/site/Truth-Barbershop`, { redirect: "manual" });
  check(
    "a capitalised URL redirects to the real one, relatively",
    caps.status === 301 && caps.headers.get("location") === "/site/truth-barbershop",
    `${caps.status} ${caps.headers.get("location")}`,
  );

  const robots = await (await fetch(`${BASE}/site/robots.txt`)).text();
  check("robots.txt allows indexing", robots.includes("Allow: /"));
  check(
    "and names the sitemap at the CONFIGURED address",
    robots.includes(`Sitemap: ${BASE}/site/sitemap.xml`),
    robots.trim(),
  );

  const sitemap = await (await fetch(`${BASE}/site/sitemap.xml`)).text();
  check("the sitemap lists the published page", sitemap.includes("truth-barbershop"));
  check("and not the draft", !sitemap.includes("88-south"));
  check(
    "with an absolute URL built from the configured base",
    sitemap.includes(`<loc>${BASE}/site/truth-barbershop</loc>`),
  );

  // --- Methods and caching ----------------------------------------------------
  const head = await fetch(`${BASE}/site/truth-barbershop`, { method: "HEAD" });
  check("HEAD works and returns no body", head.status === 200);
  const post = await fetch(`${BASE}/site/truth-barbershop`, { method: "POST" });
  check(
    "POST is refused",
    post.status === 405 && post.headers.get("allow") === "GET, HEAD",
  );
  const cached = await fetch(`${BASE}/site/truth-barbershop`, {
    headers: { "if-none-match": page.headers.get("etag") },
  });
  check("an unchanged page comes back 304", cached.status === 304);

  // --- The part that proves publishing is real --------------------------------
  await asOwner("owner_a", async () => {
    await run("select barberos.unpublish_site($1)", [T]);
  });
  const afterUnpublish = await fetch(`${BASE}/site/truth-barbershop`);
  check(
    "unpublishing takes the page off the internet",
    afterUnpublish.status === 404,
    `status ${afterUnpublish.status}`,
  );
  const sitemapAfter = await (await fetch(`${BASE}/site/sitemap.xml`)).text();
  check("and out of the sitemap", !sitemapAfter.includes("truth-barbershop"));

  await asOwner("owner_a", async () => {
    await run("select barberos.publish_site($1)", [T]);
  });
  const afterRepublish = await fetch(`${BASE}/site/truth-barbershop`);
  check("republishing puts it back", afterRepublish.status === 200);

  // =========================================================================
  // The SAME handler, on the host that will actually serve customers
  //
  // apps/shop-pages is not a port or a copy: it imports handle() from the same
  // module. What changes is the shape of the deployment -- pages at the ROOT
  // rather than under /functions/v1/site -- and that shape has only ever been
  // unit-tested. This runs the real entrypoint over real HTTP.
  // =========================================================================
  console.log("\n--- apps/shop-pages (root paths, the Coolify shape) ---\n");
  pages = spawn(
    DENO,
    ["run", "--allow-net", "--allow-env", "--quiet", "apps/shop-pages/server.ts"],
    {
      env: {
        ...process.env,
        SUPABASE_URL: `http://127.0.0.1:${SHIM_PORT}`,
        SUPABASE_ANON_KEY: "local-anon-key",
        SITE_PUBLIC_BASE: PAGES_BASE,
        PORT: String(PAGES_PORT),
      },
      stdio: ["ignore", "inherit", "inherit"],
    },
  );
  if (!(await waitFor(`${PAGES_BASE}/robots.txt`))) {
    throw new Error("apps/shop-pages never came up");
  }

  const rootPage = await fetch(`${PAGES_BASE}/truth-barbershop`);
  const rootHtml = await rootPage.text();
  check("a page is served at the ROOT path", rootPage.status === 200);
  check("with the same bytes as the other deployment", rootHtml === html);
  check(
    "as real HTML, because nothing here rewrites it",
    rootPage.headers.get("content-type") === "text/html; charset=utf-8",
  );
  check(
    "and our own content security policy survives",
    (rootPage.headers.get("content-security-policy") || "").includes(
      "frame-ancestors 'none'",
    ),
  );

  const rootRobots = await (await fetch(`${PAGES_BASE}/robots.txt`)).text();
  check(
    "robots points at the root sitemap",
    rootRobots.includes(`Sitemap: ${PAGES_BASE}/sitemap.xml`),
    rootRobots.trim(),
  );
  const rootSitemap = await (await fetch(`${PAGES_BASE}/sitemap.xml`)).text();
  check(
    "the sitemap carries clean root URLs",
    rootSitemap.includes(`<loc>${PAGES_BASE}/truth-barbershop</loc>`),
  );
  const rootRedirect = await fetch(`${PAGES_BASE}/Truth-Barbershop`, {
    redirect: "manual",
  });
  check(
    "and a capitalised URL redirects with no path prefix at all",
    rootRedirect.status === 301 &&
      rootRedirect.headers.get("location") === "/truth-barbershop",
    `${rootRedirect.status} ${rootRedirect.headers.get("location")}`,
  );
  const rootDraft = await fetch(`${PAGES_BASE}/88-south-barbershop`);
  check("a draft is still invisible here", rootDraft.status === 404);

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  exitCode = failures === 0 ? 0 : 1;
} catch (e) {
  console.error("\nERROR:", e instanceof Error ? e.message : String(e));
} finally {
  site.kill("SIGKILL");
  if (pages !== null) pages.kill("SIGKILL");
  shim.close();
  await db.end();
}
process.exit(exitCode);
