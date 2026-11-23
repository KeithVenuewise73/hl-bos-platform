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
// A tiny real MP4 for the "clip" requests (the browser test only needs a file that is one).
let CLIP_MP4 = null;
try {
  const out = path.join(os.tmpdir(), `clip-test-${process.pid}.mp4`);
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=320x240:rate=10:duration=2",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      out,
    ],
    { stdio: "ignore" },
  );
  CLIP_MP4 = fs.readFileSync(out);
} catch {
  // no ffmpeg here: the clip checks are skipped, and say so
}
const palette = ["#1f4f8f", "#2c7a4b", "#8f3b1f", "#6a3d8f", "#8f7a1f", "#1f7a8f"];
const siteServer = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (req.method === "PUT") {
    req.resume();
    res.writeHead(200).end();
    return;
  }
  if (u.pathname.startsWith("/img/")) {
    if (/-video\.mp4$/.test(u.pathname) && CLIP_MP4 !== null) {
      res
        .writeHead(200, {
          "content-type": "video/mp4",
          "content-length": CLIP_MP4.length,
          "access-control-allow-origin": "*",
        })
        .end(CLIP_MP4);
      return;
    }
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
    "update review.settings set publisher_key_sha256 = null, connect_until = now() + interval '1 hour', large_downloads = true",
  );
  await new Promise((r) => siteServer.listen(SITE_PORT, "127.0.0.1", r));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "team-pages-"));
  fs.mkdirSync(path.join(work, "review"));
  for (const f of ["core.ts", "pg-store.ts", "social.ts"])
    fs.copyFileSync(
      path.join(REPO, "supabase/functions/_shared/review", f),
      path.join(work, "review", f),
    );
  // the Instagram / Facebook adapters the posting code reuses
  fs.mkdirSync(path.join(work, "social"));
  for (const f of ["provider.ts", "instagram.ts", "facebook.ts", "redact.ts"])
    fs.copyFileSync(
      path.join(REPO, "supabase/functions/_shared/social", f),
      path.join(work, "social", f),
    );
  fs.mkdirSync(path.join(work, "ai"));
  fs.copyFileSync(
    path.join(REPO, "supabase/functions/_shared/ai/redact.ts"),
    path.join(work, "ai", "redact.ts"),
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
    async function send(name, sport, count, offset, largeCount = 0) {
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
          files: hashes.flatMap((h, i) => [
            { hash: h, kind: "web" },
            { hash: h, kind: "thumb" },
            ...(i < largeCount ? [{ hash: h, kind: "large" }] : []),
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
      if (largeCount > 0) {
        const l = await api(
          "/review/large",
          { items: hashes.slice(0, largeCount).map((h) => ({ hash: h, bytes: 5000 })) },
          pub,
        );
        if (l.json.attached !== largeCount)
          throw new Error("large copies not attached");
      }
      return c.json.added;
    }
    check(
      "3 hockey photos and 2 lacrosse photos are waiting",
      (await send("Varsity vs Wheatfield", "Hockey", 3, 10, 2)) === 3 &&
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
      "the team page lists its games as links, and shows no photos until one is opened",
      (await v.locator("[data-testid=game-link]").count()) === 1 &&
        (await v.locator(".tp-tile").count()) === 0 &&
        /Varsity vs Wheatfield/.test(
          await v.locator("[data-testid=game-link]").innerText(),
        ) &&
        /Hockey/.test(await v.locator("[data-testid=game-link]").innerText()) &&
        /3 photos/.test(await v.locator("[data-testid=game-link]").innerText()),
    );
    await v.click("[data-testid=game-link]");
    await v.waitForSelector("[data-testid=album]");
    check(
      "opening a game goes to its own address and shows its photos",
      /team\.html\?team=cazenovia-chiefs&game=[0-9a-f-]{36}$/.test(v.url()) &&
        (await v.locator(".tp-tile").count()) === 3 &&
        (await v.locator("[data-testid=back-to-games]").count()) === 1,
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
    const dlLinks = await v.locator("[data-testid=tile-download]").evaluateAll((as) =>
      as.map((x) => ({
        href: x.getAttribute("href"),
        name: x.getAttribute("download"),
      })),
    );
    check(
      "every photo has its own Download button",
      dlLinks.length === 3 &&
        dlLinks.every((d) => d.href && /[?&]download=/.test(d.href)),
      JSON.stringify(dlLinks),
    );
    check(
      "a download is named for the team, the game and the camera's file, so a parent can find it later",
      dlLinks.every((d) =>
        /^Cazenovia-Chiefs_Varsity-vs-Wheatfield_[A-Za-z0-9._-]+\.jpe?g$/i.test(d.name),
      ),
      JSON.stringify(dlLinks.map((d) => d.name)),
    );
    check(
      "the download address is the same public picture, with no private path",
      dlLinks.every((d) => !/review-photos/.test(d.href) && /public/.test(d.href)),
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
    const firstName = dlLinks[0].name;
    check(
      "the viewer has a Download button for the photo being shown",
      (await v.locator("[data-testid=viewer-download]").getAttribute("download")) ===
        firstName &&
        /[?&]download=/.test(
          await v.locator("[data-testid=viewer-download]").getAttribute("href"),
        ),
    );
    check(
      "the Share button is hidden where the browser has no share menu",
      await v.locator("[data-testid=viewer-share]").evaluate((e) => e.hidden),
    );
    const big = v.locator("[data-testid=viewer-download-large]");
    const bigHref = (await big.getAttribute("href")) ?? "";
    check(
      "a photo with a large copy offers Download large, pointing at the service (not at any storage path)",
      !(await big.evaluate((e) => e.hidden)) &&
        /\/site\/large\?photo=[0-9a-f-]{36}&name=/.test(bigHref) &&
        !/review-photos|-large\.jpg/.test(bigHref),
      bigHref,
    );
    const hop = await v.request.get(bigHref, { maxRedirects: 0 });
    check(
      "pressing it answers with a short-lived download link and is never cached",
      hop.status() === 302 &&
        /\/img\/.+-large\.jpg\?download=.+&exp=300/.test(
          hop.headers()["location"] ?? "",
        ) &&
        hop.headers()["cache-control"] === "no-store",
      `${hop.status()} ${hop.headers()["location"]}`,
    );
    await v.click(".tp-next");
    await v.click(".tp-next");
    check(
      "a photo with no large copy shows no Download large button",
      /3 of 3/.test(await v.locator(".tp-cap").innerText()) &&
        (await big.evaluate((e) => e.hidden)),
    );
    const off = await api(
      "/owner/large-downloads",
      { enabled: false },
      { authorization: "Bearer owner-token" },
    );
    const refused = await v.request.get(bigHref, { maxRedirects: 0 });
    const fresh = await (await context()).newPage();
    const gameAt = new URL(v.url());
    gameAt.searchParams.delete("photo");
    await fresh.goto(gameAt.toString());
    await fresh.locator(".tp-tile").first().click();
    await fresh.waitForSelector(".tp-lb:not([hidden])");
    check(
      "switched off: the button is gone and the link itself refuses (403)",
      off.json.enabled === false &&
        refused.status() === 403 &&
        (await fresh
          .locator("[data-testid=viewer-download-large]")
          .evaluate((e) => e.hidden)),
    );
    await fresh.context().close();
    await api(
      "/owner/large-downloads",
      { enabled: true },
      { authorization: "Bearer owner-token" },
    );
    check(
      "switched back on: the same link works again",
      (await v.request.get(bigHref, { maxRedirects: 0 })).status() === 302,
    );
    await v.click(".tp-prev");
    await v.click(".tp-prev");
    await v.keyboard.press("Escape");
    await v.evaluate(() => {
      Object.defineProperty(navigator, "canShare", {
        value: () => true,
        configurable: true,
      });
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (d) => {
          const f = d.files[0];
          window.__shared = { name: f.name, type: f.type, size: f.size };
        },
      });
    });
    await v.locator(".tp-tile").first().click();
    await v.waitForSelector("[data-testid=viewer-share]:not([hidden])");
    if (SHOTS)
      await v.screenshot({ path: path.join(SHOTS, "team-viewer-download.png") });
    await v.click("[data-testid=viewer-share]");
    await v.waitForFunction(() => window.__shared);
    const shared = await v.evaluate(() => window.__shared);
    check(
      "where the browser can share files, Share hands it the picture itself as a JPEG with the same name (nothing saved first)",
      shared.name === firstName && shared.type === "image/jpeg" && shared.size > 1000,
      JSON.stringify(shared),
    );
    await v.evaluate(() => {
      window.__copied = null;
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (t) => {
            window.__copied = t;
          },
        },
      });
    });
    await v.click("[data-testid=viewer-copy]");
    await v.waitForFunction(() => window.__copied);
    const copied = await v.evaluate(() => window.__copied);
    check(
      "Copy link copies the address of this very photo",
      /^http.*team\.html\?team=cazenovia-chiefs&game=[0-9a-f-]{36}&photo=[0-9a-f-]{36}$/.test(
        copied,
      ),
      copied,
    );
    check(
      "and tells the visitor it was copied",
      /Link copied/.test(await v.locator("[data-testid=viewer-note]").innerText()),
    );
    check(
      "the address bar names the photo while it is open, so it can be copied from there too",
      /&photo=[0-9a-f-]{36}$/.test(v.url()),
    );
    await v.evaluate(() => {
      window.__shared2 = null;
      Object.defineProperty(navigator, "canShare", {
        configurable: true,
        value: () => false,
      });
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (d) => {
          window.__shared2 = d;
        },
      });
    });
    await v.click("[data-testid=viewer-share]");
    await v.waitForFunction(() => window.__shared2);
    const shared2 = await v.evaluate(() => window.__shared2);
    check(
      "a browser that can share a link but not a file shares the link to the photo instead",
      shared2.url === copied && !shared2.files,
      JSON.stringify(shared2),
    );
    await v.keyboard.press("Escape");
    check(
      "closing the viewer takes the photo off the address",
      !/photo=/.test(v.url()),
    );
    await v.goto(copied);
    await v.waitForSelector(".tp-lb:not([hidden])");
    check(
      "opening a shared photo link goes straight to that photo, large",
      /1 of 3/.test(await v.locator(".tp-cap").innerText()) &&
        (await v.locator(".tp-big").getAttribute("src")).length > 10,
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
    await v.waitForSelector("[data-testid=game-link]");
    await v.click("[data-testid=game-link]");
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
    await v.waitForSelector("[data-testid=game-link]");
    await v.click("[data-testid=game-link]");
    await v.waitForSelector("[data-testid=album]");
    check(
      "making it public again brings the 2 approved photos back",
      (await v.locator(".tp-tile").count()) === 2,
    );

    console.log("\nA team with two games: a list of links, one page per game");
    const OWNER = { authorization: "Bearer owner-token" };
    const two = (
      await db.query(
        "select id from review.photos where status = 'approved' order by taken_at, filename limit 2",
      )
    ).rows;
    const split = await api(
      "/owner/new-folder",
      { ids: [two[1].id], name: "Second game", sport: "Hockey" },
      OWNER,
    );
    await api("/owner/decide", { ids: [two[1].id], status: "approved" }, OWNER);
    await db.query(
      "update review.folders set team_id = (select team_id from review.folders where name = 'Varsity vs Wheatfield' limit 1) where id = $1",
      [split.json.folder],
    );
    await api("/owner/sync", {}, OWNER);
    await v.goto(base + "/team.html?team=cazenovia-chiefs");
    await v.waitForSelector("[data-testid=game-link]");
    const links = await v.locator("[data-testid=game-link]").allInnerTexts();
    check(
      "the team page lists both games as links, with no photos shown",
      links.length === 2 &&
        links.some((t) => /Varsity vs Wheatfield/.test(t)) &&
        links.some((t) => /Second game/.test(t)) &&
        (await v.locator(".tp-tile").count()) === 0 &&
        /2 games/.test(await v.locator("#team-albums").innerText()),
      JSON.stringify(links),
    );
    if (SHOTS)
      await v.screenshot({
        path: path.join(SHOTS, "team-games-list.png"),
        fullPage: true,
      });
    await v.locator("[data-testid=game-link]", { hasText: "Second game" }).click();
    await v.waitForSelector("[data-testid=album]");
    check(
      "clicking a game shows only that game's photos",
      (await v.locator(".tp-tile").count()) === 1 &&
        /Second game/.test(await v.locator("[data-testid=album]").innerText()) &&
        !/Varsity vs Wheatfield/.test(
          await v.locator("[data-testid=album]").innerText(),
        ),
    );
    const gameUrl = v.url();
    await v.locator(".tp-tile").first().click();
    await v.waitForSelector(".tp-lb:not([hidden])");
    check(
      "the viewer counts only that game's photos (1 of 1)",
      /1 of 1/.test(await v.locator(".tp-cap").innerText()),
    );
    await v.keyboard.press("Escape");
    await v.click("[data-testid=back-to-games]");
    await v.waitForSelector("[data-testid=game-link]");
    check(
      "the link at the top of a game goes back to the list of games",
      (await v.locator("[data-testid=game-link]").count()) === 2,
    );
    await v.goto(gameUrl);
    await v.waitForSelector("[data-testid=album]");
    check(
      "a game's address can be shared: opening it goes straight to that game",
      (await v.locator(".tp-tile").count()) === 1,
    );
    await v.goto(
      base +
        "/team.html?team=cazenovia-chiefs&game=00000000-0000-0000-0000-000000000000",
    );
    await v.waitForSelector("[data-testid=game-missing]");
    check(
      "an address for a game that does not exist says so, with a link to all games",
      /not found/i.test(await v.locator("[data-testid=game-missing]").innerText()) &&
        (await v.locator("[data-testid=game-missing] a").count()) === 1,
    );

    console.log(
      "\nA busy storage service: the viewer says so, tries again, and falls back",
    );
    const flaky = await (await context()).newPage();
    let webHits = 0;
    let mode = "busy-twice"; // then "always-busy"
    await flaky.route(/-web\.jpg/, async (route) => {
      webHits += 1;
      if (mode === "always-busy" || webHits <= 2)
        return route.fulfill({
          status: 429,
          contentType: "application/json",
          body: '{"error":"Too many requests"}',
        });
      return route.continue();
    });
    await flaky.goto(gameUrl);
    await flaky.waitForSelector("[data-testid=album]");
    await flaky.locator(".tp-tile").first().click();
    await flaky.waitForSelector(".tp-lb:not([hidden])");
    check(
      "while the picture loads, the viewer says it is loading",
      /Loading the picture/.test(
        await flaky.locator("[data-testid=viewer-note]").innerText(),
      ),
    );
    await flaky.waitForFunction(
      () => {
        const i = document.querySelector(".tp-big");
        return i && i.complete && i.naturalWidth > 0;
      },
      null,
      { timeout: 20000 },
    );
    check(
      "after two busy answers it tries again and the picture appears",
      webHits >= 3 &&
        (await flaky.locator("[data-testid=viewer-note]").innerText()) === "",
      `hits ${webHits}`,
    );
    mode = "always-busy";
    await flaky.context().close();
    // A fresh browser, so the picture just loaded is not simply served from its memory.
    const flaky2 = await (await context()).newPage();
    await flaky2.route(/-web\.jpg/, (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: '{"error":"Too many requests"}',
      }),
    );
    await flaky2.goto(gameUrl);
    await flaky2.waitForSelector("[data-testid=album]");
    await flaky2.locator(".tp-tile").first().click();
    try {
      await flaky2.waitForFunction(
        () =>
          /could not load right now/.test(
            document.querySelector("[data-testid=viewer-note]")?.textContent ?? "",
          ),
        null,
        { timeout: 25000 },
      );
    } catch (e) {
      console.log(
        "DEBUG",
        webHits,
        await flaky2.locator("[data-testid=viewer-note]").innerText(),
        await flaky2.locator(".tp-big").evaluate((i) => i.src + " " + i.complete),
        await flaky2.locator(".tp-lb").isVisible(),
      );
      throw e;
    }
    check(
      "if it never loads, it says so in words and shows the small picture, with Download still there",
      (await flaky2.locator(".tp-big").evaluate((i) => i.src.includes("-thumb"))) &&
        (await flaky2.locator("[data-testid=viewer-download]").isVisible()),
    );
    await flaky2.context().close();

    console.log("\nA big game: tiles keep their shape before their pictures arrive");
    const slow = await (await context()).newPage();
    await slow.route(/-thumb\.jpg/, () => {
      /* never answers: the pictures have not arrived */
    });
    await slow.goto(gameUrl);
    await slow.waitForSelector(".tp-tile");
    check(
      "a tile is already full height with no picture yet (so a 900-photo game does not ask for every thumbnail at once)",
      (await slow
        .locator(".tp-tile")
        .first()
        .evaluate((e) => e.getBoundingClientRect().height)) > 60,
    );
    await slow.context().close();

    console.log("\nA game with short clips beside its photos");
    if (CLIP_MP4 === null) {
      console.log("  SKIPPED  no ffmpeg on this computer to make a test clip");
    } else {
      const OWN = { authorization: "Bearer owner-token" };
      const hashesC = ["photoA", "photoB", "clipC"].map((n) => sha(`clip-game-${n}`));
      const batchC = await api(
        "/review/batch",
        {
          label: { name: "Clip game", sport: "Football", date: "2026-11-07" },
          folder: "clips",
          counts: { photos: 2, videos: 1 },
          hashes: hashesC,
        },
        pub,
      );
      await api(
        "/review/uploads",
        {
          batch_id: batchC.json.batch_id,
          files: [
            { hash: hashesC[0], kind: "web" },
            { hash: hashesC[0], kind: "thumb" },
            { hash: hashesC[1], kind: "web" },
            { hash: hashesC[1], kind: "thumb" },
            { hash: hashesC[2], kind: "web" },
            { hash: hashesC[2], kind: "thumb" },
            { hash: hashesC[2], kind: "video" },
          ],
        },
        pub,
      );
      const commitC = await api(
        "/review/commit",
        {
          batch_id: batchC.json.batch_id,
          photos: [
            {
              hash: hashesC[0],
              filename: "IMG_1.JPG",
              taken_at: "2026-11-07T12:00:00",
              width: 2400,
              height: 1600,
              flags: [],
              web_bytes: 1000,
            },
            {
              hash: hashesC[1],
              filename: "IMG_2.JPG",
              taken_at: "2026-11-07T12:02:00",
              width: 2400,
              height: 1600,
              flags: [],
              web_bytes: 1000,
            },
            {
              hash: hashesC[2],
              kind: "video",
              filename: "C0001.MOV",
              taken_at: "2026-11-07T12:01:00",
              width: 1920,
              height: 1080,
              flags: [],
              web_bytes: 1000,
              video_bytes: CLIP_MP4.length,
              duration: 14.2,
            },
          ],
        },
        pub,
      );
      const team = await api("/owner/create-team", { name: "Clip Team" }, OWN);
      const folderC = (
        await db.query("select id from review.folders where name = 'Clip game'")
      ).rows[0].id;
      await api("/owner/set-team", { folder: folderC, team: team.json.team }, OWN);
      const idsC = (
        await db.query("select id from review.photos where folder_id = $1", [folderC])
      ).rows.map((r) => r.id);
      await api("/owner/decide", { ids: idsC, status: "approved" }, OWN);
      await api("/owner/sync", {}, OWN);
      check(
        "two photos and a clip are sent and approved",
        commitC.json.added === 3,
        commitC.json,
      );

      await v.goto(base + "/team.html?team=clip-team");
      await v.waitForSelector("[data-testid=game-link]");
      await v.locator("[data-testid=game-link]").first().click();
      await v.waitForSelector("[data-testid=album]");
      check(
        "the game says how many photos and how many clips it holds",
        /2 photos · 1 clip/.test(await v.locator(".tp-meta").first().innerText()),
        await v.locator(".tp-meta").first().innerText(),
      );
      check(
        "the clip's tile has a play badge with its length",
        (await v.locator("[data-testid=clip-badge]").count()) === 1 &&
          /▶ 0:14/.test(await v.locator("[data-testid=clip-badge]").innerText()),
      );
      check(
        "its Download saves an .mp4 named for the team and game",
        /Clip-Team_Clip-game_C0001\.mp4/.test(
          await v
            .locator(
              ".tp-cell:has([data-testid=clip-badge]) [data-testid=tile-download]",
            )
            .getAttribute("download"),
        ),
        await v
          .locator(".tp-cell:has([data-testid=clip-badge]) [data-testid=tile-download]")
          .getAttribute("download"),
      );
      await v.locator(".tp-tile:has([data-testid=clip-badge])").click();
      await v.waitForSelector(".tp-lb:not([hidden])");
      const vsrc =
        (await v.locator("[data-testid=viewer-video]").getAttribute("src")) ?? "";
      check(
        "opening the clip shows a video player (not the picture) pointed at the public .mp4, with its poster",
        !(await v.locator("[data-testid=viewer-video]").evaluate((e) => e.hidden)) &&
          (await v.locator("img.tp-big").evaluate((e) => e.hidden)) &&
          /-video\.mp4/.test(vsrc) &&
          /-web\.jpg/.test(
            await v.locator("[data-testid=viewer-video]").evaluate((e) => e.poster),
          ) &&
          (await v.locator("[data-testid=viewer-video]").evaluate((e) => e.controls)),
        vsrc,
      );
      check(
        "the caption says it is a clip and how long, and Download Large is not offered for it",
        /Clip 0:14/.test(await v.locator(".tp-cap").innerText()) &&
          (await v
            .locator("[data-testid=viewer-download-large]")
            .evaluate((e) => e.hidden)) &&
          /\.mp4/.test(
            (await v
              .locator("[data-testid=viewer-download]")
              .getAttribute("download")) ?? "",
          ),
        await v.locator(".tp-cap").innerText(),
      );
      await v.keyboard.press("ArrowRight");
      check(
        "moving to a photo swaps the player for the picture",
        (await v.locator("[data-testid=viewer-video]").evaluate((e) => e.hidden)) &&
          !(await v.locator("img.tp-big").evaluate((e) => e.hidden)),
      );
      await v.keyboard.press("ArrowLeft");
      await v.keyboard.press("Escape");
      check(
        "closing the viewer stops the clip (no sound keeps playing)",
        (await v.locator("[data-testid=viewer-video]").getAttribute("src")) === null,
      );
    }

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
