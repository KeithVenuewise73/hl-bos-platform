#!/usr/bin/env node
/**
 * The whole publishing loop, in a real browser, against the REAL review service and a
 * REAL local PostgreSQL (migrations 0055-0057): the owner approves photos and files a
 * folder under a team; a visitor sees them on that team's own public page; rejecting a
 * photo, or making the team private, takes them down. Stand-ins: Supabase Auth and storage.
 *
 *   WEBSITE_DIR=/path/to/5star-sports-media DENO_BIN=deno node scripts/local-test/verify-team-pages.cjs
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawn } = require("node:child_process");

const REPO = path.resolve(__dirname, "../..");
const SITE = process.env.WEBSITE_DIR || path.resolve(REPO, "../5star-sports-media");
const DENO = process.env.DENO_BIN || "deno";
const SITE_PORT = 4660,
  API_PORT = 4661;
const SHOTS = process.env.OWNER_SCREENSHOTS || null;
const sharp = require(
  path.join(REPO, "packages", "date-sort", "node_modules", "sharp"),
);
const pg = require(process.env.PG_MODULE || "pg");

let checks = 0,
  failures = 0;
function check(name, ok, detail) {
  checks++;
  if (!ok) failures++;
  console.log(
    `  ${ok ? "OK  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : " — " + detail}`,
  );
}
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const KEY = "k".repeat(48);
const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};
const palette = ["#1f4f8f", "#2c7a4b", "#8f3b1f", "#6a3d8f", "#8f7a1f", "#1f7a8f"];
const siteServer = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (req.method === "PUT") {
    req.resume();
    res.writeHead(200).end();
    return;
  }
  if (u.pathname.startsWith("/img/")) {
    const hash = /([0-9a-f]{64})-(web|thumb)/.exec(u.pathname);
    const colour = palette[hash ? parseInt(hash[1][0], 16) % palette.length : 0];
    const size = hash && hash[2] === "web" ? [1200, 800] : [320, 240];
    const buf = await sharp({
      create: { width: size[0], height: size[1], channels: 3, background: colour },
    })
      .jpeg()
      .toBuffer();
    res
      .writeHead(200, {
        "content-type": "image/jpeg",
        "access-control-allow-origin": "*",
      })
      .end(buf);
    return;
  }
  let file = path.join(SITE, decodeURIComponent(u.pathname));
  if (fs.existsSync(file) && fs.statSync(file).isDirectory())
    file = path.join(file, "index.html");
  if (!file.startsWith(SITE) || !fs.existsSync(file)) {
    res.writeHead(404).end("no");
    return;
  }
  res
    .writeHead(200, {
      "content-type": MIME[path.extname(file)] || "application/octet-stream",
    })
    .end(fs.readFileSync(file));
});
async function api(route, body, headers) {
  const res = await fetch(
    `http://127.0.0.1:${API_PORT}/functions/v1/media-review${route}`,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    },
  );
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

(async () => {
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch {
    const root = execFileSync(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["root", "-g"],
      { shell: process.platform === "win32" },
    )
      .toString()
      .trim();
    ({ chromium } = require(path.join(root, "playwright")));
  }
  const db = new pg.Client({
    host: "/tmp",
    port: 5433,
    user: "postgres",
    database: "hlbos",
  });
  await db.connect();
  await db.query(
    "delete from review.photos; delete from review.batches; delete from review.folders; delete from storage.objects where bucket_id in ('review-photos','review-public')",
  );
  await db.query(
    "delete from review.teams where slug not in ('west-seneca-high-school','west-seneca-club-hockey','cazenovia-chiefs','cheektowaga-warriors'); update review.teams set visibility = 'public'",
  );
  await db.query(
    "update review.settings set publisher_key_sha256 = null, connect_until = now() + interval '1 hour'",
  );
  await new Promise((r) => siteServer.listen(SITE_PORT, "127.0.0.1", r));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "team-pages-"));
  fs.mkdirSync(path.join(work, "review"));
  for (const f of ["core.ts", "pg-store.ts"])
    fs.copyFileSync(
      path.join(REPO, "supabase/functions/_shared/review", f),
      path.join(work, "review", f),
    );
  fs.copyFileSync(
    path.join(__dirname, "owner-api-local.ts"),
    path.join(work, "server.ts"),
  );
  fs.writeFileSync(path.join(work, "deno.json"), '{"nodeModulesDir":"auto"}');
  const deno = spawn(DENO, ["run", "-A", "--no-check", "server.ts"], {
    cwd: work,
    env: {
      ...process.env,
      IMG_BASE: `http://127.0.0.1:${SITE_PORT}`,
      API_PORT: String(API_PORT),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  deno.stdout.on("data", (d) => (out += d));
  deno.stderr.on("data", (d) => (out += d));
  const stop = () => {
    deno.kill();
    siteServer.close();
  };
  try {
    for (let i = 0; i < 120 && !out.includes("READY"); i++)
      await new Promise((r) => setTimeout(r, 500));
    if (!out.includes("READY")) {
      console.log("the service did not start:\n" + out);
      process.exit(2);
    }

    console.log("Seeding: DateSort sends two games' photos through the real service");
    const pub = { "x-review-publisher-key": KEY };
    await api("/review/register", { key_sha256: sha(KEY) });
    async function send(name, sport, count, offset) {
      const hashes = Array.from({ length: count }, (_, i) => sha(`${name}-${i}`));
      const batch = await api(
        "/review/batch",
        {
          label: { name, sport, date: "2026-10-24" },
          folder: name,
          counts: { photos: count, videos: 0 },
          hashes,
        },
        pub,
      );
      await api(
        "/review/uploads",
        {
          batch_id: batch.json.batch_id,
          files: hashes.flatMap((h) => [
            { hash: h, kind: "web" },
            { hash: h, kind: "thumb" },
          ]),
        },
        pub,
      );
      const c = await api(
        "/review/commit",
        {
          batch_id: batch.json.batch_id,
          photos: hashes.map((h, i) => ({
            hash: h,
            filename: `${name.slice(0, 3)}_${100 + i}.JPG`,
            taken_at: `2026-10-24T${String(offset + i).padStart(2, "0")}:00:00`,
            width: 2400,
            height: 1600,
            flags: [],
            web_bytes: 1000 + i,
          })),
        },
        pub,
      );
      return c.json.added;
    }
    check(
      "3 hockey photos and 2 lacrosse photos are waiting",
      (await send("Varsity vs Wheatfield", "Hockey", 3, 10)) === 3 &&
        (await send("JV vs Lockport", "Lacrosse", 2, 15)) === 2,
    );

    const browser = await chromium.launch(
      process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
    );
    const CONFIG = `window.REVIEW_CONFIG={supabaseUrl:'https://x.test',anonKey:'public-key',serviceUrl:'http://127.0.0.1:${API_PORT}/functions/v1/media-review',pageCacheSeconds:0};`;
    const base = `http://127.0.0.1:${SITE_PORT}`;
    async function context() {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await ctx.route(/assets\/js\/review-config\.js/, (r) =>
        r.fulfill({ contentType: "application/javascript", body: CONFIG }),
      );
      await ctx.route(
        /cdn\.jsdelivr\.net|cdnjs\.cloudflare|fonts\.g|supabase\.co/,
        (r) => r.fulfill({ contentType: "application/javascript", body: "" }),
      );
      return ctx;
    }
    const errors = [];
    // The owner (fake sign-in)
    const octx = await context();
    const o = await octx.newPage();
    o.on("pageerror", (e) => errors.push("owner: " + e));
    await o.route(/@supabase\/supabase-js/, (r) =>
      r.fulfill({ contentType: "application/javascript", body: "" }),
    );
    await o.addInitScript(() => {
      window.__listeners = [];
      window.__session = null;
      const auth = {
        getSession: () => Promise.resolve({ data: { session: window.__session } }),
        onAuthStateChange: (cb) => {
          window.__listeners.push(cb);
          return { data: { subscription: {} } };
        },
        signInWithOtp: () => Promise.resolve({ error: null }),
        signOut: () => {
          window.__session = null;
          return Promise.resolve({});
        },
      };
      window.supabase = { createClient: () => ({ auth }) };
      window.__signIn = () => {
        window.__session = { access_token: "owner-token" };
        window.__listeners.forEach((cb) => cb("SIGNED_IN", window.__session));
      };
    });
    await o.goto(base + "/photo-review.html");
    await o.waitForSelector("#email");
    await o.evaluate(() => window.__signIn());
    await o.waitForSelector("text=Varsity vs Wheatfield");

    // The visitor
    const vctx = await context();
    const v = await vctx.newPage();
    v.on("pageerror", (e) => errors.push("visitor: " + e));

    console.log("\nNothing is public until it is approved AND filed under a team");
    await v.goto(base + "/photo-galleries.html");
    await v.waitForTimeout(1200);
    check(
      "the Photos page shows no team card yet",
      (await v.locator("[data-testid=team-card]").count()) === 0,
    );
    await v.goto(base + "/team.html?team=cazenovia-chiefs");
    await v.waitForTimeout(1200);
    const blank = await v.locator("body").innerText();
    check(
      "a team with no public photos has its own blank page, ready for its first album",
      /Cazenovia Chiefs/.test(await v.locator("[data-testid=team-name]").innerText()) &&
        /No photos here yet/.test(blank),
      blank.slice(0, 120),
    );

    console.log(
      "\nThe owner approves the hockey photos and files that folder under Cazenovia Chiefs",
    );
    await o
      .locator(".pr-card", { hasText: "Varsity vs Wheatfield" })
      .locator("button:has-text('Review')")
      .click();
    await o.waitForSelector(".pr-tile");
    await o.click("button:has-text('Approve all 3 waiting')");
    await o.waitForSelector("#toast:has-text('Approved the remaining 3')");
    await o.click("button:has-text('All folders')");
    await o.waitForSelector("text=Varsity vs Wheatfield");
    await v.goto(base + "/team.html?team=cazenovia-chiefs");
    await v.waitForTimeout(1200);
    check(
      "approved photos in a folder with no team are still not public",
      /No photos here yet/.test(await v.locator("body").innerText()) &&
        (await v.locator(".tp-tile").count()) === 0,
    );
    await o
      .locator(".pr-card", { hasText: "Varsity vs Wheatfield" })
      .locator("select")
      .selectOption({ label: "Cazenovia Chiefs" });
    await o.waitForSelector("#toast:has-text('Filed under that team')");

    console.log("\nA visitor");
    await v.goto(base + "/photo-galleries.html");
    await v.waitForSelector("[data-testid=team-card]");
    const card = await v.locator("[data-testid=team-card]").innerText();
    check(
      "the Photos page lists Cazenovia Chiefs with 1 album and 3 photos",
      /Cazenovia Chiefs/.test(card) && /1 album/i.test(card) && /3 photos/i.test(card),
      card,
    );
    check(
      "the lacrosse folder (not filed, not approved) does not appear anywhere",
      !/Lockport/.test(await v.locator("body").innerText()),
    );
    if (SHOTS) {
      fs.mkdirSync(SHOTS, { recursive: true });
      await v.screenshot({
        path: path.join(SHOTS, "photos-page-team-card.png"),
        fullPage: true,
      });
    }
    await v.click("[data-testid=team-card]");
    await v.waitForSelector("[data-testid=team-name]");
    check(
      "the team's own page opens at its address",
      /team\.html\?team=cazenovia-chiefs$/.test(v.url()) &&
        /Cazenovia Chiefs/.test(await v.locator("[data-testid=team-name]").innerText()),
    );
    check(
      "it shows the album, with its sport, date and photo count",
      /Varsity vs Wheatfield/.test(
        await v.locator("[data-testid=album]").innerText(),
      ) &&
        /Hockey/.test(await v.locator("[data-testid=album]").innerText()) &&
        /3 photos/.test(await v.locator("[data-testid=album]").innerText()),
    );
    check(
      "3 pictures load",
      (await v.locator(".tp-tile img").count()) === 3 &&
        (await v
          .locator(".tp-tile img")
          .first()
          .evaluate((i) => i.complete && i.naturalWidth > 0)),
    );
    check(
      "the page title names the team",
      /Cazenovia Chiefs Photos/.test(await v.title()),
    );
    if (SHOTS)
      await v.screenshot({ path: path.join(SHOTS, "team-page.png"), fullPage: true });
    await v.locator(".tp-tile").first().click();
    await v.waitForSelector(".tp-lb:not([hidden])");
    await v.waitForFunction(() => {
      const i = document.querySelector(".tp-big");
      return i && i.complete && i.naturalWidth > 0;
    });
    check(
      "opening a photo shows it large, with its place in the album",
      (await v.locator(".tp-big").evaluate((i) => i.complete && i.naturalWidth > 0)) &&
        /1 of 3/.test(await v.locator(".tp-cap").innerText()),
    );
    await v.keyboard.press("ArrowRight");
    await v.waitForFunction(() =>
      /2 of 3/.test(document.querySelector(".tp-cap").textContent),
    );
    check("the arrow keys move between photos", true);
    await v.keyboard.press("Escape");
    check(
      "Escape closes the viewer",
      await v.locator(".tp-lb").evaluate((e) => e.hidden),
    );
    const raw = await v.content();
    check(
      "no private storage path or the review bucket's address appears on the page",
      !/review-photos/.test(raw),
    );

    console.log("\nThe owner rejects one photo");
    await o
      .locator(".pr-card", { hasText: "Varsity vs Wheatfield" })
      .locator("button:has-text('Open')")
      .click();
    await o.click("button.pr-chip:has-text('Approved')");
    await o.waitForFunction(() => document.querySelectorAll(".pr-tile").length === 3);
    await o.locator(".pr-tile").first().click();
    await o.click("button:has-text('Reject ticked')");
    await o.waitForSelector("#toast:has-text('Rejected 1')");
    await v.goto(base + "/team.html?team=cazenovia-chiefs");
    await v.waitForSelector("[data-testid=album]");
    check(
      "the visitor now sees 2 photos",
      (await v.locator(".tp-tile").count()) === 2 &&
        /2 photos/.test(await v.locator("[data-testid=album]").innerText()),
    );
    const files = await db.query(
      "select count(*)::int n from storage.objects where bucket_id = 'review-public'",
    );
    check(
      "and only 2 photos' files (4) remain in the public bucket",
      files.rows[0].n === 4,
      String(files.rows[0].n),
    );

    console.log("\nThe owner makes the team private");
    await o.click("button.pr-tab:has-text('Teams')");
    await o.waitForSelector("text=Cazenovia Chiefs");
    await o
      .locator(".pr-card", { hasText: "Cazenovia Chiefs" })
      .locator("select")
      .selectOption("private");
    await o.waitForSelector("#toast:has-text('Saved')");
    await v.goto(base + "/team.html?team=cazenovia-chiefs");
    await v.waitForTimeout(1200);
    check(
      "the team's page is gone",
      /not found/i.test(await v.locator("#team-root").innerText()),
    );
    await v.goto(base + "/photo-galleries.html");
    await v.waitForTimeout(1200);
    check(
      "and so is its card on the Photos page",
      (await v.locator("[data-testid=team-card]").count()) === 0,
    );
    const left = await db.query(
      "select count(*)::int n from storage.objects where bucket_id = 'review-public'",
    );
    check(
      "and nothing of it is left in the public bucket",
      left.rows[0].n === 0,
      String(left.rows[0].n),
    );
    await o
      .locator(".pr-card", { hasText: "Cazenovia Chiefs" })
      .locator("select")
      .selectOption("public");
    await o.waitForSelector("#toast:has-text('Saved')");
    await v.goto(base + "/team.html?team=cazenovia-chiefs");
    await v.waitForSelector("[data-testid=album]");
    check(
      "making it public again brings the 2 approved photos back",
      (await v.locator(".tp-tile").count()) === 2,
    );

    console.log("\nIf the service is unreachable");
    const down = await context();
    await down.route(/\/site\//, (r) => r.abort());
    const d = await down.newPage();
    d.on("pageerror", (e) => errors.push("down: " + e));
    await d.goto(base + "/photo-galleries.html");
    await d.waitForTimeout(1500);
    check(
      "the Photos page still stands, without a team section",
      /Team/.test(await d.locator("h1").innerText()) &&
        (await d.locator("#team-pages-section").evaluate((e) => e.hidden)),
    );
    await d.goto(base + "/team.html?team=cazenovia-chiefs");
    await d.waitForTimeout(1500);
    check(
      "a team page says plainly the photos could not be loaded",
      /could not be loaded/i.test(await d.locator("#team-root").innerText()),
    );
    check("no page had errors", errors.length === 0, JSON.stringify(errors));
    await browser.close();
  } finally {
    await db.end().catch(() => undefined);
    stop();
  }
  console.log(`\n${checks - failures}/${checks} checks passed`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
