#!/usr/bin/env node
/**
 * The website's page switches, in a real browser, against the REAL review service
 * code and a REAL local PostgreSQL with migrations 0055 and 0056. Stand-ins: Supabase
 * Auth (a fake sign-in the test controls) and photo storage (not used here).
 *
 * Plays two people: a VISITOR (no sign-in) and the OWNER (the Pages tab).
 *
 *   WEBSITE_DIR=/path/to/5star-sports-media DENO_BIN=deno node scripts/local-test/verify-page-switches.cjs
 */
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
const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};
const siteServer = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
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
    "delete from site.page_interest; update site.pages set enabled = false, coming_soon = false",
  );
  await new Promise((r) => siteServer.listen(SITE_PORT, "127.0.0.1", r));

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "page-switches-"));
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
    const browser = await chromium.launch(
      process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
    );
    const CONFIG = `window.REVIEW_CONFIG={supabaseUrl:'https://x.test',anonKey:'public-key',serviceUrl:'http://127.0.0.1:${API_PORT}/functions/v1/media-review',pageCacheSeconds:0};`;
    const base = `http://127.0.0.1:${SITE_PORT}`;
    async function newContext(opts = {}) {
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        ...opts,
      });
      await ctx.route(/assets\/js\/review-config\.js/, (r) =>
        r.fulfill({ contentType: "application/javascript", body: CONFIG }),
      );
      await ctx.route(
        /cdn\.jsdelivr\.net|cdnjs\.cloudflare|fonts\.g|supabase\.co/,
        (r) => r.fulfill({ contentType: "application/javascript", body: "" }),
      );
      return ctx;
    }
    const menu = async (page) =>
      (await page.locator(".site-nav a").allInnerTexts()).map((t) =>
        t.trim().toUpperCase(),
      );
    const visit = async (page, p, waitMs = 1500) => {
      await page.goto(base + p);
      await page.waitForTimeout(waitMs);
      return new URL(page.url());
    };

    console.log("A visitor, every page switched off");
    const vctx = await newContext();
    const v = await vctx.newPage();
    const errors = [];
    // The old Athlete Spotlight page has errors of its own when it is switched on (it loads an HTML file as
    // a script and expects the old database's library): they are not the switches' and are reported apart.
    const oldPageErrors = [];
    v.on("pageerror", (e) => {
      const here = new URL(v.url()).pathname;
      (here === "/athlete-spotlight.html" || here === "/admin.html"
        ? oldPageErrors
        : errors
      ).push(here + ": " + String(e));
    });
    let u = await visit(v, "/athlete-spotlight.html");
    check(
      "a page that is off sends the visitor to the home page",
      u.pathname === "/index.html",
      u.href,
    );
    check(
      "and the home page says so in words",
      /not available right now/.test(await v.locator("#soon-note").innerText()),
    );
    u = await visit(v, "/scores/football/");
    check(
      "a sport page ends on the home page too (its redirect lands on the gated Scores page)",
      u.pathname === "/index.html",
      u.href,
    );
    u = await visit(v, "/academy/downloads/Athlete_Interview_Packet.html");
    check(
      "a page deep in a folder is gated by its folder",
      u.pathname === "/index.html",
      u.href,
    );
    u = await visit(v, "/podcast/episode.html");
    check(
      "and so is a page in the Podcast folder",
      u.pathname === "/index.html",
      u.href,
    );
    u = await visit(v, "/about.html");
    check("a page that is always on opens", u.pathname === "/about.html");
    check(
      "the menu is the lean four",
      JSON.stringify(await menu(v)) ===
        JSON.stringify(["HOME", "PHOTOS", "CONTACT", "ABOUT"]),
      JSON.stringify(await menu(v)),
    );
    u = await visit(v, "/admin.html");
    check(
      "a staff tool is never gated (it has its own login)",
      u.pathname === "/admin.html",
      u.href,
    );

    const nojs = await newContext({ javaScriptEnabled: false });
    const n = await nojs.newPage();
    await n.goto(base + "/athlete-spotlight.html");
    await n.waitForTimeout(1500);
    check(
      "with JavaScript off, a page that is off still sends the visitor home",
      new URL(n.url()).pathname === "/index.html",
      n.url(),
    );
    await nojs.close();

    const down = await newContext();
    await down.route(/\/site\/pages/, (r) => r.abort());
    const d = await down.newPage();
    u = await visit(d, "/athlete-spotlight.html", 2500);
    check(
      "if the page list cannot be read, a page that could be off stays hidden (fails closed)",
      u.pathname === "/index.html",
      u.href,
    );
    u = await visit(d, "/about.html", 2500);
    check(
      "and the always-on pages and the lean menu still work",
      u.pathname === "/about.html" &&
        JSON.stringify(await menu(d)) ===
          JSON.stringify(["HOME", "PHOTOS", "CONTACT", "ABOUT"]),
    );
    await down.close();

    console.log("\nThe owner lists Athlete Spotlight as coming soon");
    const octx = await newContext();
    const o = await octx.newPage();
    const oerrors = [];
    o.on("pageerror", (e) => oerrors.push(String(e)));
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
    await o.waitForSelector("button.pr-tab:has-text('Pages')");
    await o.click("button.pr-tab:has-text('Pages')");
    await o.waitForSelector("text=Athlete Spotlight");
    check(
      "the Pages tab lists every switched-off page, all off",
      (await o.locator("input[id^='on-']").count()) === 15 &&
        (await o.locator("input[id^='on-']:checked").count()) === 0,
    );
    await o.locator("#soon-athletes").check();
    await o.waitForSelector("#toast:has-text('listed as coming soon')");
    check(
      "it is now listed as coming soon",
      await o.locator("#soon-athletes").isChecked(),
    );

    console.log("\nA visitor asks for it");
    await v.goto(base + "/index.html");
    await v.waitForSelector("[data-testid=soon-athletes]");
    check(
      "the home page shows Athlete Spotlight under Coming soon, with the fixed cards still there",
      /Athlete Spotlight/.test(
        await v.locator("[data-testid=soon-athletes]").innerText(),
      ) && (await v.locator("[data-testid=soon-photos]").count()) === 1,
    );
    check(
      "the menu is still the lean four (a page that is only coming soon is not in it)",
      JSON.stringify(await menu(v)) ===
        JSON.stringify(["HOME", "PHOTOS", "CONTACT", "ABOUT"]),
    );
    if (SHOTS) {
      fs.mkdirSync(SHOTS, { recursive: true });
      await v
        .locator("#coming-soon")
        .screenshot({ path: path.join(SHOTS, "home-coming-soon.png") });
    }
    await v.click("[data-testid=soon-athletes] button");
    await v.waitForFunction(() =>
      /Thanks, noted/.test(
        document.querySelector("[data-testid=soon-athletes] button").textContent,
      ),
    );
    check(
      "the button thanks the visitor and cannot be pressed again",
      await v.locator("[data-testid=soon-athletes] button").isDisabled(),
    );
    u = await visit(v, "/athlete-spotlight.html");
    check(
      "the page is still off, so the visitor is sent home with a note naming it",
      u.pathname === "/index.html" &&
        /Athlete Spotlight is coming soon\./.test(
          await v.locator("#soon-note").innerText(),
        ),
      await v.locator("#soon-note").innerText(),
    );

    console.log("\nThe owner sees the count");
    await o.click("button.pr-tab:has-text('Folders')");
    await o.click("button.pr-tab:has-text('Pages')");
    await o.waitForSelector("text=1 person asked");
    check("one person asked for Athlete Spotlight", true);
    const stored = await db.query("select voter_hash from site.page_interest");
    check(
      "what is stored is a fingerprint, not an address",
      stored.rows.length === 1 &&
        /^[0-9a-f]{64}$/.test(stored.rows[0].voter_hash) &&
        !/127\.0\.0\.1/.test(stored.rows[0].voter_hash),
    );
    if (SHOTS)
      await o.screenshot({ path: path.join(SHOTS, "owner-pages.png"), fullPage: true });

    console.log("\nThe owner switches it on");
    await o.locator("#on-athletes").check();
    await o.waitForSelector("#toast:has-text('is on')");
    check(
      "listing as coming soon is switched off by turning the page on",
      (await o.locator("#soon-athletes").isDisabled()) &&
        !(await o.locator("#soon-athletes").isChecked()),
    );
    u = await visit(v, "/athlete-spotlight.html");
    check(
      "the page now opens for visitors",
      u.pathname === "/athlete-spotlight.html",
      u.href,
    );
    check(
      "and Athletes is in the menu",
      (await menu(v)).includes("ATHLETES"),
      JSON.stringify(await menu(v)),
    );
    await v.goto(base + "/index.html");
    await v.waitForTimeout(1200);
    check(
      "and it is no longer under Coming soon",
      (await v.locator("[data-testid=soon-athletes]").count()) === 0,
    );

    console.log("\nThe owner switches it off again");
    await o.locator("#on-athletes").uncheck();
    await o.waitForSelector("#toast:has-text('is off')");
    u = await visit(v, "/athlete-spotlight.html");
    check("the page sends visitors home again", u.pathname === "/index.html", u.href);
    u = await visit(v, "/about.html");
    check(
      "and the menu is the lean four again",
      JSON.stringify(await menu(v)) ===
        JSON.stringify(["HOME", "PHOTOS", "CONTACT", "ABOUT"]),
    );
    check(
      "the pages built for the switches, and the owner page, had no errors",
      errors.length === 0 && oerrors.length === 0,
      JSON.stringify([...errors, ...oerrors]),
    );
    console.log(
      `  NOTE  the old Athlete Spotlight and admin pages raised ${oldPageErrors.length} script error(s) when switched on (not caused by the switches)`,
    );
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
