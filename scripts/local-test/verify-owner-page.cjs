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
  await db.query("update review.teams set visibility = 'public'");
  await db.query(
    "update review.settings set publisher_key_sha256 = null, connect_until = now() + interval '1 hour'",
  );
  await db.end();

  await new Promise((r) => siteServer.listen(SITE_PORT, "127.0.0.1", r));
  // the service runs from a scratch folder so Deno never writes into the repository
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "owner-api-"));
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
        if (m.type() === "error") errors.push(m.text());
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
    const n = await page.locator(".pr-tile").count();
    for (let i = n - 5; i < n; i++) await page.locator(".pr-tile").nth(i).click(); // the five afternoon photos
    await page.click("summary:has-text('Wrong folder')");
    await page.fill("#newName", "JV Lacrosse vs Lockport");
    await page.fill("#newSport", "Lacrosse");
    await page.click("button:has-text('Create folder')");
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
    await shot(page, "owner-teams");

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
