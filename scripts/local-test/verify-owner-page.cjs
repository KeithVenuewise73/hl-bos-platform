#!/usr/bin/env node
/**
 * The owner's Photo Review page (5star-sports-media/photo-review.html) in a real
 * browser, against the REAL review service code and a REAL local PostgreSQL that
 * has migration 0055 applied. Stand-ins: Supabase Auth (a fake sign-in the test
 * controls) and photo storage (generated pictures).
 *
 *   (local PostgreSQL running with all migrations applied: scripts/local-test/apply.cjs)
 *   WEBSITE_DIR=/path/to/5star-sports-media DENO_BIN=deno node scripts/local-test/verify-owner-page.cjs
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

// ---- static site + generated pictures ---------------------------------------
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
  if (u.pathname.startsWith("/img/") || req.method === "PUT") {
    if (req.method === "PUT") {
      req.resume();
      res.writeHead(200).end();
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
  const file = path.join(
    SITE,
    u.pathname === "/" ? "photo-review.html" : decodeURIComponent(u.pathname),
  );
  if (
    !file.startsWith(SITE) ||
    !fs.existsSync(file) ||
    fs.statSync(file).isDirectory()
  ) {
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
  if (!fs.existsSync(path.join(SITE, "photo-review.html"))) {
    console.log("photo-review.html not found in " + SITE);
    process.exit(2);
  }

  // a clean database to start from
  const db = new pg.Client({
    host: "/tmp",
    port: 5433,
    user: "postgres",
    database: "hlbos",
  });
  await db.connect();
  await db.query(
    "delete from review.photos; delete from review.batches; delete from review.folders; delete from storage.objects where bucket_id = 'review-photos'",
  );
  await db.query(
    "delete from review.teams where slug not in ('west-seneca-high-school','west-seneca-club-hockey','cazenovia-chiefs','cheektowaga-warriors')",
  );
  await db.query(
    "update review.teams set visibility = 'public'; update review.settings set large_downloads = true",
  );
  await db.query(
    "update review.settings set publisher_key_sha256 = null, connect_until = now() + interval '1 hour'",
  );
  await db.end();

  await new Promise((r) => siteServer.listen(SITE_PORT, "127.0.0.1", r));
  // the service runs from a scratch folder so Deno never writes into the repository
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "owner-api-"));
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

    // ---- send 14 photos the way DateSort does (through the real service) ----
    console.log(
      "Seeding: connect DateSort and send a day's photos through the real service",
    );
    const pub = { "x-review-publisher-key": KEY };
    check(
      "DateSort connects",
      (await api("/review/register", { key_sha256: sha(KEY) })).json.status ===
        "connected",
    );
    const hashes = Array.from({ length: 14 }, (_, i) => sha("photo-" + i));
    const batch = await api(
      "/review/batch",
      {
        label: { name: "Varsity vs Wheatfield", sport: "Hockey", date: "2026-10-24" },
        folder: "2026-10-24 - Hockey",
        counts: { photos: 14, videos: 0 },
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
    const times = [
      "10:02",
      "10:05",
      "10:11",
      "10:14",
      "10:19",
      "10:26",
      "10:31",
      "10:37",
      "10:40",
      "15:00",
      "15:03",
      "15:05",
      "15:08",
      "15:12",
    ];
    const flags = { 3: ["soft"], 6: ["dark"], 11: ["small"] };
    const commit = await api(
      "/review/commit",
      {
        batch_id: batch.json.batch_id,
        photos: hashes.map((h, i) => ({
          hash: h,
          filename: `IMG_${8100 + i}.JPG`,
          taken_at: `2026-10-24T${times[i]}:00`,
          width: 2400,
          height: 1600,
          sharpness: 100,
          brightness: 100,
          flags: flags[i] || [],
          web_bytes: 1000 + i,
        })),
      },
      pub,
    );
    check(
      "14 photos are waiting for review",
      commit.json.added === 14,
      JSON.stringify(commit.json),
    );

    const browser = await chromium.launch(
      process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
    );
    async function open(token) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => {
        // A refusal the test provokes on purpose (a taken team name) is logged by the browser
        // as a failed request; that is the page working, not an error.
        if (m.type() === "error" && !/status of 400 \(Bad Request\)/.test(m.text()))
          errors.push(m.text());
      });
      // Fake Supabase Auth: the test controls who is signed in.
      await page.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, (r) =>
        r.fulfill({
          contentType: "application/javascript",
          body: "/* stand-in below */",
        }),
      );
      await page.route(/assets\/js\/review-config\.js/, (r) =>
        r.fulfill({
          contentType: "application/javascript",
          body: `window.REVIEW_CONFIG={supabaseUrl:'https://x.test',anonKey:'public-key',serviceUrl:'http://127.0.0.1:${API_PORT}/functions/v1/media-review'};`,
        }),
      );
      await page.addInitScript((tok) => {
        window.__otp = [];
        window.__listeners = [];
        window.__session = null;
        window.__token = tok;
        const auth = {
          getSession: () => Promise.resolve({ data: { session: window.__session } }),
          onAuthStateChange: (cb) => {
            window.__listeners.push(cb);
            return { data: { subscription: {} } };
          },
          signInWithOtp: (o) => {
            window.__otp.push({
              email: o.email,
              create: o.options && o.options.shouldCreateUser,
            });
            // Like Supabase with account creation off: only an existing account is emailed.
            return Promise.resolve(
              o.email === "owner@example.test"
                ? { error: null }
                : { error: { message: "Signups not allowed for otp" } },
            );
          },
          signOut: () => {
            window.__session = null;
            window.__listeners.forEach((cb) => cb("SIGNED_OUT", null));
            return Promise.resolve({});
          },
        };
        window.supabase = { createClient: () => ({ auth }) };
        window.__signIn = () => {
          window.__session = { access_token: window.__token };
          window.__listeners.forEach((cb) => cb("SIGNED_IN", window.__session));
        };
      }, token);
      await page.goto(`http://127.0.0.1:${SITE_PORT}/photo-review.html`);
      return { page, errors, ctx };
    }
    const shot = async (page, name) => {
      if (SHOTS) {
        fs.mkdirSync(SHOTS, { recursive: true });
        await page.screenshot({
          path: path.join(SHOTS, name + ".png"),
          fullPage: true,
        });
      }
    };

    console.log("\nSigned out");
    let { page, errors, ctx } = await open("owner-token");
    await page.waitForSelector("#email");
    check(
      "the page asks for an email and shows nothing else",
      (await page.locator("#app").innerText()).includes("Email me a sign-in link") &&
        !(await page.locator("#app").innerText()).includes("Varsity"),
    );
    await page.fill("#email", "owner@example.test");
    await page.click("button[type=submit]");
    await page.waitForFunction(() =>
      /Check your email/.test(document.getElementById("sign-msg").textContent),
    );
    const asked = await page.evaluate(() => window.__otp);
    check(
      "the sign-in link is requested for that email, and never asks to create an account",
      asked[0].email === "owner@example.test" && asked[0].create === false,
      JSON.stringify(asked),
    );
    await page.reload();
    await page.waitForSelector("#email");
    await page.fill("#email", "stranger@example.test");
    await page.click("button[type=submit]");
    await page.waitForFunction(() =>
      /could not be sent/.test(document.getElementById("sign-msg").textContent),
    );
    const refusal = await page.locator("#sign-msg").innerText();
    check(
      "an address with no account is told plainly, without saying why, and no link is claimed",
      /Only the owner's account can sign in here/.test(refusal) &&
        !/Check your email/.test(refusal) &&
        !/Signups/.test(refusal),
      refusal,
    );

    console.log("\nA signed-in person who is not the owner");
    const stranger = await open("stranger-token");
    await stranger.page.waitForSelector("#email");
    await stranger.page.evaluate(() => window.__signIn());
    await stranger.page.waitForFunction(() =>
      /not the owner/.test(document.getElementById("app").innerText),
    );
    check(
      "is told so, and sees no photos or folders",
      !/Varsity/.test(await stranger.page.locator("#app").innerText()),
    );
    await stranger.ctx.close();

    console.log("\nThe owner signs in");
    await page.evaluate(() => window.__signIn());
    if (process.env.OWNER_DEBUG) {
      await page.waitForTimeout(3000);
      console.log(
        "PAGE SAYS:",
        (await page.locator("#app").innerText()).replace(/\n+/g, " | ").slice(0, 400),
        "| ERRORS:",
        JSON.stringify(errors),
      );
    }
    await page.waitForSelector("text=Varsity vs Wheatfield");
    check(
      "the owner's email is shown and the folder is listed with 14 waiting",
      /owner@example\.test/.test(await page.locator("#app").innerText()) &&
        /14 waiting/.test(await page.locator("#app").innerText()),
    );
    await shot(page, "owner-folders");

    check(
      "folders with photos waiting come first, under a heading that counts them",
      /Needs review \(14 photos waiting in 1 folder\)/.test(
        await page.locator("[data-testid=needs-review-head]").innerText(),
      ),
    );
    console.log("\nReviewing a folder");
    await page.click("button:has-text('Review')");
    await page.waitForSelector(".pr-tile");
    check(
      "14 photos are shown in the order taken",
      (await page.locator(".pr-tile").count()) === 14 &&
        (await page.locator(".pr-tile").first().innerText()).includes("10:02"),
    );
    check(
      "a long pause is marked as a possible different game",
      /Long pause before 15:00/.test(await page.locator("#app").innerText()),
    );
    const txt = await page.locator("#app").innerText();
    check(
      "quality hints are shown in words",
      /Possibly soft/.test(txt) && /Very dark/.test(txt) && /Low resolution/.test(txt),
    );
    check(
      "the pictures really load (they come from expiring links)",
      await page
        .locator(".pr-tile img")
        .first()
        .evaluate((i) => i.complete && i.naturalWidth > 0),
    );
    await shot(page, "owner-review");
    for (let i = 0; i < 3; i++) await page.locator(".pr-tile").nth(i).click();
    await page.click("button:has-text('Approve ticked')");
    await page.waitForFunction(() =>
      /Waiting 11/.test(document.getElementById("app").innerText),
    );
    check(
      "approving 3 photos moves them out of waiting (Waiting 11, Approved 3)",
      /Approved 3/.test(await page.locator("#app").innerText()),
    );
    await page.locator(".pr-tile").nth(0).click();
    await page.fill("#reason", "out of focus");
    await page.click("button:has-text('Reject ticked')");
    await page.waitForFunction(() =>
      /Rejected 1/.test(document.getElementById("app").innerText),
    );
    await page.click("button.pr-chip:has-text('Rejected')");
    await page.waitForFunction(
      () => document.querySelectorAll(".pr-tile").length === 1,
    );
    check(
      "a rejected photo keeps its reason",
      (await page.locator(".pr-tile").count()) === 1 &&
        /out of focus/.test(await page.locator(".pr-tile").innerText()),
    );

    console.log("\nA folder's own team picker");
    check(
      "inside a folder, a warning says photos stay private until a team is picked",
      /No team yet: approved photos stay private/.test(
        await page.locator("#app").innerText(),
      ),
    );
    await page.selectOption("#folderTeam", { label: "Cheektowaga Warriors" });
    await page.waitForFunction(() =>
      /appear on Cheektowaga Warriors/.test(document.getElementById("app").innerText),
    );
    check(
      "picking a team inside the folder files it and says where its photos will appear",
      /appear on Cheektowaga Warriors/.test(await page.locator("#app").innerText()),
    );

    console.log("\nFolders: split out the photos that do not belong, then rename");
    await page.click("button.pr-chip:has-text('Waiting')");
    await page.waitForFunction(
      () => document.querySelectorAll(".pr-tile").length === 10,
    );
    // A refresh (the page rebuilds itself) must not wipe a half-written folder name.
    await page.click("summary:has-text('Wrong folder')");
    await page.fill("#newName", "typed before a refresh");
    await page.click("button.pr-chip:has-text('Approved')");
    await page.waitForFunction(() =>
      /Approved/.test(
        document.querySelector("button.pr-chip[aria-pressed='true']")?.innerText ?? "",
      ),
    );
    await page.click("button.pr-chip:has-text('Waiting')");
    await page.waitForFunction(
      () => document.querySelectorAll(".pr-tile").length === 10,
    );
    check(
      "a refresh keeps what was typed and keeps the Wrong folder panel open",
      (await page.inputValue("#newName")) === "typed before a refresh" &&
        (await page.locator("details").evaluate((d) => d.open)) === true,
    );
    await page.click("summary:has-text('Wrong folder')"); // close it again
    const n = await page.locator(".pr-tile").count();
    for (let i = n - 5; i < n; i++) await page.locator(".pr-tile").nth(i).click(); // the five afternoon photos
    await page.click("summary:has-text('Wrong folder')");
    await page.fill("#newName", "JV Lacrosse vs Lockport");
    await page.fill("#newSport", "Lacrosse");
    // Pressed twice in a row (as a real, impatient click can): it must make ONE folder.
    await page.dblclick("button:has-text('Create folder')");
    await page.waitForFunction(
      () =>
        !document.querySelector(".pr-tile") ||
        document.querySelectorAll(".pr-tile").length < 10,
    );
    await page.click("button:has-text('All folders')");
    await page.waitForSelector("text=JV Lacrosse vs Lockport");
    const folders = await page.locator("#app").innerText();
    check(
      "a new folder exists with the 5 photos, waiting",
      /JV Lacrosse vs Lockport/.test(folders) && /5 waiting/.test(folders),
    );
    const dupDb = new pg.Client({
      host: "/tmp",
      port: 5433,
      user: "postgres",
      database: "hlbos",
    });
    await dupDb.connect();
    const dupes = (
      await dupDb.query(
        "select count(*)::int as n from review.folders where name = 'JV Lacrosse vs Lockport'",
      )
    ).rows[0].n;
    await dupDb.end();
    check(
      "pressing Create folder twice made exactly one folder, not copies",
      dupes === 1,
    );
    check(
      "two folders on one day are flagged",
      /Another folder on this same day/.test(folders),
    );
    await shot(page, "owner-folders-after-split");
    await page
      .locator("button:has-text('Review')")
      .first()
      .click()
      .catch(() => undefined);
    await page.waitForSelector("button:has-text('Rename this folder')");
    await page.click("button:has-text('Rename this folder')");
    await page.fill("#rename", "Varsity vs Wheatfield (Hockey)");
    await page.click("button:has-text('Save name')");
    await page.waitForSelector("h1:has-text('Varsity vs Wheatfield (Hockey)')");
    check("a folder can be renamed", true);

    console.log("\nDeleting an empty duplicate folder");
    const emptyDb = new pg.Client({
      host: "/tmp",
      port: 5433,
      user: "postgres",
      database: "hlbos",
    });
    await emptyDb.connect();
    await emptyDb.query(
      "insert into review.folders (name, event_date) values ('Empty duplicate game', '2026-10-24')",
    );
    await page.click("button.pr-tab:has-text('Folders')");
    await page.waitForSelector("text=Empty duplicate game");
    check(
      "an empty folder is listed as empty, with a Delete button",
      /Empty: no photos/.test(await page.locator("#app").innerText()) &&
        (await page.locator("button:has-text('Delete this empty folder')").count()) ===
          1,
    );
    page.once("dialog", (d) => d.dismiss());
    await page.click("button:has-text('Delete this empty folder')");
    await page.waitForTimeout(600);
    check(
      "saying No at the question deletes nothing",
      (
        await emptyDb.query(
          "select count(*)::int n from review.folders where name = 'Empty duplicate game'",
        )
      ).rows[0].n === 1,
    );
    page.once("dialog", (d) => d.accept());
    await page.click("button:has-text('Delete this empty folder')");
    await page.waitForFunction(
      () => !/Empty duplicate game/.test(document.getElementById("app").innerText),
    );
    check(
      "saying Yes deletes the empty folder, and only it",
      (
        await emptyDb.query(
          "select count(*)::int n from review.folders where name = 'Empty duplicate game'",
        )
      ).rows[0].n === 0 &&
        /JV Lacrosse vs Lockport|Varsity vs Wheatfield/.test(
          await page.locator("#app").innerText(),
        ),
    );
    await emptyDb.end();

    console.log(
      "\nEditing a folder name from the list, and deleting photos that are not approved",
    );
    const cleanDb = new pg.Client({
      host: "/tmp",
      port: 5433,
      user: "postgres",
      database: "hlbos",
    });
    await cleanDb.connect();
    page.once("dialog", (d) => d.accept("Renamed from the list"));
    await page
      .locator('.pr-card:has(h2:text-is("Varsity vs Wheatfield (Hockey)"))')
      .locator("button:has-text('Edit name')")
      .click();
    await page.waitForSelector("text=Renamed from the list");
    check(
      "Edit name on a folder in the list renames it",
      (
        await cleanDb.query(
          "select count(*)::int n from review.folders where name = 'Renamed from the list'",
        )
      ).rows[0].n === 1,
    );
    page.once("dialog", (d) => d.dismiss());
    await page
      .locator('.pr-card:has(h2:text-is("Renamed from the list"))')
      .locator("button:has-text('Edit name')")
      .click();
    await page.waitForTimeout(400);
    check(
      "cancelling the Edit name question changes nothing",
      (
        await cleanDb.query(
          "select count(*)::int n from review.folders where name = 'Renamed from the list'",
        )
      ).rows[0].n === 1,
    );
    const keepFolder = "Varsity vs Wheatfield";
    const approvedBefore = (
      await cleanDb.query(
        "select count(*)::int n from review.photos p join review.folders f on f.id = p.folder_id where f.name = $1 and p.status = 'approved'",
        [keepFolder],
      )
    ).rows[0].n;
    await page
      .locator(`.pr-card:has(h2:text-is("${keepFolder}"))`)
      .locator("button.pr-btn.gold")
      .click();
    await page.waitForSelector("button:has-text('Rename this folder')");
    await page.click("button.pr-chip:has-text('All')");
    await page.waitForFunction(() => document.querySelectorAll(".pr-tile").length > 3);
    await page.click("button:has-text('Tick all on this page')");
    await page.waitForSelector("button:has-text('Untick all on this page')");
    page.once("dialog", (d) => d.dismiss());
    await page.click("button:has-text('Delete ticked (not approved)')");
    await page.waitForTimeout(400);
    check(
      "saying No at the delete question deletes no photo",
      (
        await cleanDb.query(
          "select count(*)::int n from review.photos p join review.folders f on f.id = p.folder_id where f.name = $1",
          [keepFolder],
        )
      ).rows[0].n > approvedBefore,
    );
    page.once("dialog", (d) => d.accept());
    await page.click("button:has-text('Delete ticked (not approved)')");
    await page.waitForSelector("#toast:has-text('kept')");
    const afterDelete = (
      await cleanDb.query(
        "select count(*) filter (where p.status = 'approved')::int a, count(*) filter (where p.status <> 'approved')::int o from review.photos p join review.folders f on f.id = p.folder_id where f.name = $1",
        [keepFolder],
      )
    ).rows[0];
    check(
      "deleting every ticked photo removes the waiting and rejected ones and keeps the approved ones",
      afterDelete.o === 0 && afterDelete.a === approvedBefore && approvedBefore > 0,
      { afterDelete, approvedBefore },
    );
    await cleanDb.end();

    console.log("\nTicking a whole folder (a combined day of 1,100 photos)");
    const bigDb = new pg.Client({
      host: "/tmp",
      port: 5433,
      user: "postgres",
      database: "hlbos",
    });
    await bigDb.connect();
    const bigBatch = (
      await bigDb.query(
        "select batch_id from review.create_batch('Combined day (test)', 'Hockey', '2026-09-01', 'test', 1100, 0, '{}'::text[])",
      )
    ).rows[0].batch_id;
    await bigDb.query(
      `insert into review.photos (batch_id, folder_id, file_hash, filename, taken_at, width, height, web_bytes, web_path, thumb_path)
       select b.id, b.folder_id, h.h, 'IMG_' || lpad(i::text, 5, '0') || '.JPG',
              timestamp '2026-09-01 10:00:00' + (i || ' seconds')::interval, 1200, 800, 1000,
              b.id::text || '/' || h.h || '-web.jpg', b.id::text || '/' || h.h || '-thumb.jpg'
         from review.batches b, generate_series(1, 1100) i,
              lateral (select md5(i::text) || md5((i * 7)::text) as h) h
        where b.id = $1`,
      [bigBatch],
    );
    await bigDb.query(
      "insert into review.folders (name, event_date) values ('Move target (test)', '2026-09-02')",
    );
    await page.click("button.pr-tab:has-text('Folders')");
    await page.waitForSelector("text=Combined day (test)");
    await page
      .locator(`.pr-card:has(h2:text-is("Combined day (test)"))`)
      .locator("button.pr-btn.gold")
      .click();
    await page.waitForSelector("[data-testid=tick-folder]");
    check(
      "a folder of more than one page offers to tick all 1,100 in the folder",
      /Tick all 1,100 waiting in this folder/.test(
        await page.locator("[data-testid=tick-folder]").innerText(),
      ),
    );
    await page.click("[data-testid=tick-folder]");
    await page.waitForFunction(
      () =>
        /^1,100 ticked$/.test(
          document.querySelector("[data-testid=tick-count]")?.textContent || "",
        ),
      null,
      { timeout: 120000 },
    );
    check("ticking the folder ticks all 1,100 (not only the 60 on the page)", true);
    await page.locator("summary:has-text('Wrong folder?')").click();
    await page.selectOption("#moveTo", { label: "2026-09-02 · Move target (test)" });
    await page.click("button.pr-btn:text-is('Move')");
    await page.waitForSelector("#toast:has-text('Moved 1,100 photos')", {
      timeout: 120000,
    });
    const moved = (
      await bigDb.query(
        `select count(*) filter (where f.name = 'Move target (test)')::int as there,
                count(*) filter (where f.name = 'Combined day (test)')::int as left_behind
           from review.photos p join review.folders f on f.id = p.folder_id
          where f.name in ('Move target (test)', 'Combined day (test)')`,
      )
    ).rows[0];
    check(
      "moving 1,100 ticked photos (more than one action allows) moves every one, in pieces",
      moved.there === 1100 && moved.left_behind === 0,
      moved,
    );
    console.log("\nMoving ticked photos by hand, from page 5 of a 300-photo folder");
    const manBatch = (
      await bigDb.query(
        "select batch_id from review.create_batch('Manual move (test)', 'Football', '2026-09-03', 'test', 300, 0, '{}'::text[])",
      )
    ).rows[0].batch_id;
    await bigDb.query(
      `insert into review.photos (batch_id, folder_id, file_hash, filename, taken_at, width, height, web_bytes, web_path, thumb_path)
       select b.id, b.folder_id, h.h, 'IMG_M' || lpad(i::text, 4, '0') || '.JPG',
              timestamp '2026-09-03 10:00:00' + (i || ' seconds')::interval, 1200, 800, 1000,
              b.id::text || '/' || h.h || '-web.jpg', b.id::text || '/' || h.h || '-thumb.jpg'
         from review.batches b, generate_series(1, 300) i,
              lateral (select md5('m' || i::text) || md5('n' || (i * 7)::text) as h) h
        where b.id = $1`,
      [manBatch],
    );
    await page.click("button.pr-tab:has-text('Folders')");
    await page.waitForSelector("text=Manual move (test)");
    await page
      .locator(`.pr-card:has(h2:text-is("Manual move (test)"))`)
      .locator("button.pr-btn.gold")
      .click();
    await page.waitForSelector(".pr-tile");
    for (let i = 0; i < 4; i++) {
      await page.click("button:has-text('Next')");
      await page.waitForFunction(
        (n) =>
          new RegExp("Page " + n + " of 5").test(
            document.getElementById("app").innerText,
          ),
        i + 2,
      );
    }
    const tiles = page.locator(".pr-tile");
    for (let i = 24; i < 60; i++) await tiles.nth(i).click();
    check(
      "36 photos ticked by hand on page 5 show as 36 ticked",
      /^36 ticked$/.test(await page.locator("[data-testid=tick-count]").innerText()),
    );
    await page.locator("summary:has-text('Wrong folder?')").click();
    await page.selectOption("#moveTo", { label: "2026-09-02 · Move target (test)" });
    await page.click("button.pr-btn:text-is('Move')");
    await page.waitForSelector("#toast:has-text('Moved 36 photos')", {
      timeout: 60000,
    });
    const manual = (
      await bigDb.query(
        `select count(*) filter (where f.name = 'Move target (test)' and p.filename like 'IMG_M%')::int as there,
                count(*) filter (where f.name = 'Manual move (test)')::int as left_behind
           from review.photos p join review.folders f on f.id = p.folder_id`,
      )
    ).rows[0];
    check(
      "pressing Move moves exactly the 36 ticked photos",
      manual.there === 36 && manual.left_behind === 264,
      manual,
    );
    await bigDb.query(
      "delete from review.photos where folder_id in (select id from review.folders where name = 'Manual move (test)')",
    );
    await bigDb.query("delete from review.batches where id = $1", [manBatch]);
    await bigDb.query("delete from review.folders where name = 'Manual move (test)'");

    await bigDb.query(
      "delete from review.photos where folder_id in (select id from review.folders where name in ('Move target (test)','Combined day (test)'))",
    );
    await bigDb.query("delete from review.batches where id = $1", [bigBatch]);
    await bigDb.query(
      "delete from review.folders where name in ('Move target (test)','Combined day (test)')",
    );
    await bigDb.end();
    await page.click("button.pr-tab:has-text('Folders')");

    console.log("\nTeams");
    await page.click("button.pr-tab:has-text('Teams')");
    await page.waitForSelector("text=Cazenovia Chiefs");
    const teams = await page.locator("#app").innerText();
    check(
      "your four teams are listed, public",
      [
        "West Seneca High School",
        "West Seneca Club Hockey",
        "Cazenovia Chiefs",
        "Cheektowaga Warriors",
      ].every((t) => teams.includes(t)) &&
        (await page.locator("select option:checked:has-text('Public')").count()) === 4,
    );
    await page.fill("#teamName", "Orchard Park Quakers");
    await page.click("button:has-text('Create team')");
    await page.waitForSelector("text=Orchard Park Quakers");
    check(
      "a new team is created with its own page address",
      /orchard-park-quakers/.test(await page.locator("#app").innerText()),
    );
    await page
      .locator(".pr-card", { hasText: "Orchard Park Quakers" })
      .locator("select")
      .selectOption("private");
    await page.waitForSelector("#toast:has-text('Saved')");
    const t = await api("/owner/teams", {}, { authorization: "Bearer owner-token" });
    check(
      "switching one team private is saved",
      t.json.teams.find((x) => x.slug === "orchard-park-quakers").visibility ===
        "private",
    );
    page.once("dialog", (d) => d.accept("Orchard Park Quakers Varsity"));
    await page
      .locator(".pr-card", { hasText: "Orchard Park Quakers" })
      .locator("button:has-text('Edit name')")
      .click();
    await page.waitForSelector("text=Orchard Park Quakers Varsity");
    check(
      "Edit name on a team renames it, and its page address stays the same",
      /page address: orchard-park-quakers/.test(await page.locator("#app").innerText()),
    );
    page.once("dialog", (d) => d.accept("Cazenovia Chiefs"));
    await page
      .locator(".pr-card", { hasText: "Orchard Park Quakers Varsity" })
      .locator("button:has-text('Edit name')")
      .click();
    await page.waitForSelector(".pr-err:has-text('already a team')");
    check(
      "renaming a team to a name another team has is refused in words",
      /Orchard Park Quakers Varsity/.test(await page.locator("#app").innerText()),
    );
    check(
      "Teams shows the Download large switch, ON, and says how many public photos have a large copy",
      /ON/.test(await page.locator("[data-testid=large-status]").innerText()) &&
        /\d+ of \d+ public photos have a large copy/.test(
          await page.locator("[data-testid=large-status]").innerText(),
        ),
    );
    await page.click("[data-testid=large-switch]");
    await page.waitForSelector("[data-testid=large-status]:has-text('OFF')");
    const lg = await api("/owner/large", {}, { authorization: "Bearer owner-token" });
    check(
      "pressing Switch OFF turns large downloads off in the service",
      lg.json.enabled === false &&
        (await page.locator("[data-testid=large-switch]").innerText()) === "Switch ON",
    );
    await page.click("[data-testid=large-switch]");
    await page.waitForSelector("[data-testid=large-status]:has-text('ON:')");
    check(
      "and Switch ON turns them back on",
      (await api("/owner/large", {}, { authorization: "Bearer owner-token" })).json
        .enabled === true,
    );
    await shot(page, "owner-teams");

    console.log("\nPosting to Instagram and Facebook");
    check(
      "with no account connected, no posting screen shows (no Posts tab, no Post button)",
      (await page.locator("button.pr-tab:has-text('Posts')").count()) === 0 &&
        (await page.locator("[data-testid=open-compose]").count()) === 0,
    );
    const socDb = new pg.Client({
      host: "/tmp",
      port: 5433,
      user: "postgres",
      database: "hlbos",
    });
    await socDb.connect();
    await socDb.query(
      "update review.folders set team_id = (select id from review.teams where slug = 'cazenovia-chiefs') where name = 'Varsity vs Wheatfield'",
    );
    await socDb.query(`insert into review.social_accounts
      (platform, external_account_id, display_name, facebook_page_id, token_secret_name) values
      ('facebook_page', '100000000000001', '5Star Facebook', null, 'META_PAGE_TOKEN'),
      ('instagram', '17841400000000001', '5Star Instagram', '100000000000001', 'META_PAGE_TOKEN')`);
    await api("/owner/sync", {}, { authorization: "Bearer owner-token" });
    const second = await open("owner-token");
    const sp = second.page;
    await sp.evaluate(() => window.__signIn());
    await sp.waitForSelector("button.pr-tab:has-text('Posts')");
    await sp
      .locator('.pr-card:has(h2:text-is("Varsity vs Wheatfield"))')
      .locator("button.pr-btn.gold")
      .click();
    await sp.waitForSelector("button:has-text('Rename this folder')");
    await sp.click("button.pr-chip:has-text('Approved')");
    await sp.waitForFunction(() => document.querySelectorAll(".pr-tile").length === 3);
    await sp.click("[data-testid=open-compose]");
    await sp.waitForSelector("#toast:has-text('Tick some photos first')");
    check(
      "Post ticked to social with nothing ticked says so and opens nothing",
      (await sp.locator("#socialPanel").count()) === 0,
    );
    await sp.click("button:has-text('Tick all on this page')");
    await sp.click("[data-testid=open-compose]");
    await sp.waitForSelector("#socialPanel");
    const draft = await sp.inputValue("#socialCaption");
    check(
      "the post screen opens with a caption drafted from the game, the team and the date, ready to edit",
      /Cazenovia Chiefs/.test(draft) &&
        /Varsity vs Wheatfield/.test(draft) &&
        /October 24, 2026/.test(draft) &&
        /Photos by 5-Star Sports Media/.test(draft),
      draft,
    );
    check(
      "it previews the 3 ticked photos in order, offers both accounts, and Post is ready",
      (await sp.locator("#socialPanel .pr-chipimg").count()) === 3 &&
        (await sp.locator("#socialPanel input[type=checkbox]:checked").count()) === 2 &&
        (await sp.locator("[data-testid=post-now]").isEnabled()),
    );
    await sp.fill("#socialCaption", "");
    check(
      "a blank caption cannot be posted, and the screen says why",
      !(await sp.locator("[data-testid=post-now]").isEnabled()) &&
        /Write a caption/.test(
          await sp.locator("[data-testid=post-problem]").innerText(),
        ),
    );
    await sp.fill(
      "#socialCaption",
      "Great game, Chiefs! Photos by 5-Star Sports Media",
    );
    await sp.click("#socialPanel input[type=checkbox] >> nth=0");
    check(
      "unticking an account changes the button to name only the account left",
      /Post now to 5Star (Instagram|Facebook)$/.test(
        await sp.locator("[data-testid=post-now]").innerText(),
      ),
    );
    await sp.click("#socialPanel input[type=checkbox] >> nth=0");
    await shot(sp, "owner-post-screen");
    await sp.click("[data-testid=post-now]");
    await sp.waitForSelector("[data-testid=post-results] li");
    await sp.waitForFunction(
      () =>
        document.querySelectorAll("[data-testid=post-results] li.st-approved")
          .length === 2,
    );
    const resultsText = await sp.locator("[data-testid=post-results]").innerText();
    check(
      "pressing Post posts to both accounts and shows a tick and a link for each",
      /✓ 5Star Facebook: posted/.test(resultsText) &&
        /✓ 5Star Instagram: posted/.test(resultsText) &&
        (await sp.locator("[data-testid=post-results] a").count()) >= 1,
      resultsText,
    );
    const posted = (
      await socDb.query(
        `select t.status, t.external_post_id, p.caption, p.approved_by
           from review.social_targets t join review.social_posts p on p.id = t.post_id`,
      )
    ).rows;
    check(
      "the record shows both published with the id Meta returned, the owner's caption, and who approved it",
      posted.length === 2 &&
        posted.every(
          (r) => r.status === "published" && r.external_post_id && r.approved_by,
        ) &&
        posted[0].caption === "Great game, Chiefs! Photos by 5-Star Sports Media",
      JSON.stringify(posted),
    );
    await shot(sp, "owner-post-result");
    check(
      "after posting, the screen offers only Done (so it cannot be posted twice by accident)",
      (await sp.locator("[data-testid=post-now]").count()) === 0,
    );
    await sp.click("button:has-text('Done')");
    await sp.click("button:has-text('Tick all on this page')");
    await sp.click("[data-testid=open-compose]");
    await sp.waitForSelector("[data-testid=already-posted]");
    check(
      "posting the same photos again warns they were already posted, before anything is sent",
      /3 of these photos were already posted to 5Star (Instagram|Facebook)/.test(
        await sp.locator("[data-testid=already-posted]").first().innerText(),
      ),
    );
    await sp.click("button.pr-tab:has-text('Posts')");
    await sp.waitForSelector("[data-testid=post-row]");
    check(
      "the Posts tab lists the post with each account's result and its link",
      (await sp.locator("[data-testid=post-row]").count()) === 1 &&
        /Great game, Chiefs!/.test(
          await sp.locator("[data-testid=post-row]").innerText(),
        ) &&
        /✓ 5Star Instagram: posted/.test(
          await sp.locator("[data-testid=post-row]").innerText(),
        ),
    );
    check(
      "the posting screens had no errors",
      second.errors.length === 0,
      JSON.stringify(second.errors),
    );
    await second.ctx.close();
    await socDb.end();

    console.log("\nA short clip in a folder");
    {
      const h = sha("owner-clip");
      const b = await api(
        "/review/batch",
        {
          label: { name: "Clip folder", sport: "Football", date: "2026-11-07" },
          folder: "clips",
          counts: { photos: 0, videos: 1 },
          hashes: [h],
        },
        pub,
      );
      await api(
        "/review/uploads",
        {
          batch_id: b.json.batch_id,
          files: [
            { hash: h, kind: "web" },
            { hash: h, kind: "thumb" },
            { hash: h, kind: "video" },
          ],
        },
        pub,
      );
      await api(
        "/review/commit",
        {
          batch_id: b.json.batch_id,
          photos: [
            {
              hash: h,
              kind: "video",
              filename: "C0001.MOV",
              taken_at: "2026-11-07T12:00:00",
              width: 1920,
              height: 1080,
              flags: [],
              web_bytes: 1000,
              video_bytes: 9000,
              duration: 74,
            },
          ],
        },
        pub,
      );
      await page.click("button.pr-tab:has-text('Folders')");
      await page.waitForSelector("text=Clip folder");
      await page
        .locator(".pr-card", { hasText: "Clip folder" })
        .locator("button:has-text('Review')")
        .click();
      await page.waitForSelector(".pr-tile");
      check(
        "a clip's tile has a play badge with its length (1:14)",
        /▶ 1:14/.test(await page.locator("[data-testid=clip-badge]").innerText()),
      );
      check(
        "it says it is a clip, and offers Play clip, an expiring link to the video (not the picture)",
        /Clip ·/.test(await page.locator(".pr-tile").first().innerText()) &&
          /-video\.mp4/.test(
            (await page.locator("[data-testid=clip-play]").getAttribute("href")) ?? "",
          ),
      );
      check(
        "a folder with only clips has no tabs (nothing to switch between)",
        (await page.locator("[data-testid=kind-tabs]").count()) === 0,
      );
      await page.click("button.pr-tab:has-text('Folders')");
    }

    console.log("\nA folder with videos and photos: Videos tab first, then Photos");
    {
      const photoHashes = Array.from({ length: 5 }, (_, i) => sha("mixed-photo-" + i));
      const clipHashes = Array.from({ length: 3 }, (_, i) => sha("mixed-clip-" + i));
      const b = await api(
        "/review/batch",
        {
          label: { name: "Mixed game", sport: "Volleyball", date: "2026-11-08" },
          folder: "mixed",
          counts: { photos: 5, videos: 3 },
          hashes: [...photoHashes, ...clipHashes],
        },
        pub,
      );
      await api(
        "/review/uploads",
        {
          batch_id: b.json.batch_id,
          files: [
            ...photoHashes.flatMap((h) => [
              { hash: h, kind: "web" },
              { hash: h, kind: "thumb" },
            ]),
            ...clipHashes.flatMap((h) => [
              { hash: h, kind: "web" },
              { hash: h, kind: "thumb" },
              { hash: h, kind: "video" },
            ]),
          ],
        },
        pub,
      );
      await api(
        "/review/commit",
        {
          batch_id: b.json.batch_id,
          photos: [
            ...photoHashes.map((h, i) => ({
              hash: h,
              filename: `P${i}.JPG`,
              taken_at: `2026-11-08T12:0${i}:00`,
              width: 2400,
              height: 1600,
              sharpness: 100,
              brightness: 100,
              flags: [],
              web_bytes: 1000 + i,
            })),
            ...clipHashes.map((h, i) => ({
              hash: h,
              kind: "video",
              filename: `C${i}.MOV`,
              taken_at: `2026-11-08T13:0${i}:00`,
              width: 1920,
              height: 1080,
              flags: [],
              web_bytes: 1000,
              video_bytes: 9000,
              duration: 20 + i,
            })),
          ],
        },
        pub,
      );
      await page.click("button.pr-tab:has-text('Folders')");
      await page.waitForSelector("text=Mixed game");
      await page
        .locator(".pr-card", { hasText: "Mixed game" })
        .locator("button:has-text('Review')")
        .click();
      await page.waitForSelector("[data-testid=kind-tabs]");
      const tab = (k) => page.locator(`[data-testid=tab-${k}]`);
      check(
        "two tabs: Videos 3 and Photos 5, with Videos first",
        (await tab("video").innerText()).trim() === "Videos 3" &&
          (await tab("photo").innerText()).trim() === "Photos 5" &&
          (
            await page.locator("[data-testid=kind-tabs] button").first().innerText()
          ).startsWith("Videos"),
      );
      check(
        "the Videos tab is the one showing, and it lists only the 3 clips",
        (await tab("video").getAttribute("aria-pressed")) === "true" &&
          (await page.locator(".pr-tile").count()) === 3 &&
          (await page.locator("[data-testid=clip-badge]").count()) === 3,
      );
      check(
        "the Waiting count follows the tab (3 clips waiting)",
        /Waiting 3/.test(
          await page.locator(".pr-chip", { hasText: "Waiting" }).innerText(),
        ),
      );
      await tab("photo").click();
      await page.waitForFunction(
        () => document.querySelectorAll(".pr-tile").length === 5,
        null,
        { timeout: 15000 },
      );
      check(
        "the Photos tab lists only the 5 photos, none with a play badge",
        (await tab("photo").getAttribute("aria-pressed")) === "true" &&
          (await page.locator("[data-testid=clip-badge]").count()) === 0,
      );
      check(
        "the Waiting count follows the tab (5 photos waiting)",
        /Waiting 5/.test(
          await page.locator(".pr-chip", { hasText: "Waiting" }).innerText(),
        ),
      );
      // Tick the photos, then switch tabs: the tick belongs to the tab it was made in.
      await page.locator(".pr-tile").first().click();
      await tab("video").click();
      await page.waitForFunction(
        () => document.querySelectorAll("[data-testid=clip-badge]").length === 3,
        null,
        { timeout: 15000 },
      );
      check(
        "switching tab clears what was ticked (nothing is acted on by accident)",
        /^0 ticked/.test(await page.locator("[data-testid=tick-count]").innerText()),
      );
      await page.click("button:has-text('Tick all on this page')");
      check(
        "Tick all on the Videos tab ticks the 3 clips",
        /^3 ticked/.test(await page.locator("[data-testid=tick-count]").innerText()),
      );
      await page.click("button:has-text('Untick all')");
      await page.click("button.pr-tab:has-text('Folders')");
    }

    console.log("\nSigning out");
    await page.click("button:has-text('Sign out')");
    await page.waitForSelector("#email");
    check(
      "signing out returns to the sign-in form and hides everything",
      !/Varsity|Cazenovia/.test(await page.locator("#app").innerText()),
    );
    check("the page had no errors", errors.length === 0, JSON.stringify(errors));
    await browser.close();
  } finally {
    stop();
  }
  console.log(`\n${checks - failures}/${checks} checks passed`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
