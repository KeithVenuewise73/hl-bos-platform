/**
 * "Publish online", end to end in a real browser: JerseySort's team gallery
 * page → the team-gallery service (the real handler and database functions,
 * run locally by gallery-service-local.ts against migrations 0053 + 0054).
 *
 *   connect (fingerprint only) · choose a cover · publish (web-size copies,
 *   thumbnails, the one cover) · what the website may list · the team
 *   password opens the photos · switching the gallery off here switches it
 *   off online at once · deleting it here takes it offline
 *
 * Usage:
 *   (local PostgreSQL with all migrations applied, fresh)
 *   deno run -A scripts/local-test/gallery-service-local.ts
 *   JERSEYSORT_GALLERY_SERVICE_URL=http://127.0.0.1:54400/functions/v1/team-gallery \
 *     JERSEYSORT_DATA_DIR=/tmp/js pnpm --filter @hl-bos/jersey-sort-app start
 *   node scripts/local-test/verify-publish-online.cjs http://127.0.0.1:4603 http://127.0.0.1:54400
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const BASE = (process.argv[2] || "http://127.0.0.1:4603").replace(/\/$/, "");
const SVC_ROOT = (process.argv[3] || "http://127.0.0.1:54400").replace(/\/$/, "");
const SVC = `${SVC_ROOT}/functions/v1/team-gallery`;
const SHOTS = process.env.JERSEYSORT_SCREENSHOTS || null;
const sharp = require(
  path.join(__dirname, "../../apps/jersey-sort/node_modules/sharp"),
);

let failures = 0;
let checks = 0;
function check(name, ok, detail) {
  checks += 1;
  if (ok) console.log(`  OK    ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
async function shot(page, name) {
  if (SHOTS === null) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}
async function act(page, fn) {
  const posted = page.waitForResponse((r) => r.request().method() === "POST", {
    timeout: 30000,
  });
  await fn();
  await posted;
  await page.waitForLoadState("load");
  await page.waitForTimeout(400);
}
const json = async (url, init) => {
  const r = await fetch(url, init);
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const listing = async () => (await json(`${SVC}/listing`)).body.games || [];
async function until(fn, ms = 60000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

let seq = 0;
async function photo(dir, name, n) {
  seq += 1;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2400">
    <rect width="3600" height="2400" fill="#0f766e"/>
    <text x="1800" y="1400" text-anchor="middle" font-size="700" fill="#fff">${n}</text>
    <text x="40" y="2360" font-size="60" fill="#fff">frame ${seq}</text></svg>`;
  const file = path.join(dir, name);
  fs.writeFileSync(
    file,
    await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer(),
  );
  return file;
}

function loadPlaywright() {
  try {
    return require("playwright");
  } catch {
    const { execFileSync } = require("node:child_process");
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const root = execFileSync(npm, ["root", "-g"], {
      shell: process.platform === "win32",
    })
      .toString()
      .trim();
    return require(path.join(root, "playwright"));
  }
}

(async () => {
  const { chromium } = loadPlaywright();
  const linux = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  const browser = await chromium.launch(
    fs.existsSync(linux) ? { executablePath: linux } : {},
  );
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "publish-online-"));
  try {
    const page = await (await browser.newContext()).newPage();
    console.log("\n1. Games and a team gallery in JerseySort");
    await page.goto(`${BASE}/signup`);
    await page.fill("#name", "Keith");
    await page.fill("#organization", "5 Star Sports Media");
    await page.fill("#email", `keith+${Date.now()}@example.com`);
    await page.fill("#password", "correct horse battery");
    await page.click("main button[type=submit]");
    await page.waitForURL(`${BASE}/`);
    const events = {};
    for (const [key, name, date] of [
      ["a", "Varsity vs Wheatfield", "2026-10-24"],
      ["b", "Varsity vs Lockport", "2026-10-31"],
    ]) {
      await page.goto(`${BASE}/events/new`);
      await page.fill("#name", name);
      await page.selectOption("#sport", "Hockey");
      await page.fill("#date", date);
      await page.fill("#team", "Varsity");
      await page.click("main button[type=submit]");
      await page.waitForURL(/\/events\/[0-9a-f-]{36}/);
      events[key] = page.url().split("?")[0].split("/").pop();
    }
    await page.goto(`${BASE}/events/${events.a}`);
    await page.setInputFiles("[data-testid=file-input]", [
      await photo(work, "A_0001.JPG", "24"),
      await photo(work, "A_0002.JPG", "7"),
    ]);
    await page.waitForSelector("text=Upload finished.", { timeout: 120000 });
    await page.goto(`${BASE}/events/${events.b}`);
    await page.setInputFiles("[data-testid=file-input]", [
      await photo(work, "B_0001.JPG", "12"),
    ]);
    await page.waitForSelector("text=Upload finished.", { timeout: 120000 });

    await page.goto(`${BASE}/galleries`);
    await page.fill("#g-group", "Cazenovia Hockey");
    await page.fill("#g-name", "Varsity");
    await page.fill("#g-pass", "goblue26");
    await act(page, () => page.click("main form button[type=submit]"));
    const galleryUrl = page.url().split("?")[0];
    for (const box of await page.$$("[data-testid=gallery-event]")) await box.check();
    await act(page, () => page.click("text=Save games"));
    check(
      "before connecting, the page offers Connect and says what publishing does",
      (await page.isVisible("text=Connect to the online galleries")) &&
        (await page.textContent("[data-testid=online]")).includes(
          "cover photo you pick",
        ),
    );

    console.log("\n2. Connect (one time) and choose a cover");
    await act(page, () => page.click("text=Connect to the online galleries"));
    check(
      "connecting says so",
      (await page.textContent("body")).includes("Connected to the online galleries"),
    );
    const before = await listing();
    check("nothing is online yet", before.length === 0);
    await page.click(`[data-testid=choose-cover] >> nth=0`);
    await page.waitForURL(/\/cover\//);
    const options = await page.$$("[data-testid=cover-option]");
    check("the cover page offers the game's photos", options.length >= 1);
    await options[options.length - 1].check();
    await act(page, () => page.click("text=Save cover"));
    check(
      "the cover is saved",
      (await page.textContent("body")).includes("Cover saved"),
    );

    console.log("\n3. Publish online");
    await act(page, () => page.click('button:has-text("Publish online")'));
    const done = await until(async () => {
      await page.goto(galleryUrl);
      return page.isVisible("[data-testid=publish-done]");
    }, 120000);
    check(
      "publishing finishes and says how many photos went online",
      done &&
        (await page.textContent("[data-testid=publish-done]")).includes(
          "3 photos online",
        ),
      done ? await page.textContent("[data-testid=publish-done]") : "never finished",
    );
    check(
      "the page shows the gallery is online, with its website link",
      (await page.textContent("[data-testid=online-status]")).includes(
        "2 games, 3 photos",
      ) &&
        (
          await page.$eval(
            "[data-testid=online] [data-testid=gallery-link]",
            (e) => e.value,
          )
        ).startsWith("https://5starsportsmedia.com/galleries/view/#"),
    );
    await shot(page, "01-published");

    const games = await listing();
    const titles = games.map((g) => g.title).sort();
    check(
      "the website may list both games, branded",
      titles.join() === "Varsity vs Lockport,Varsity vs Wheatfield" &&
        games.every(
          (g) =>
            g.brand === "5 Star Sports Media" && g.group_name === "Cazenovia Hockey",
        ),
      JSON.stringify(titles),
    );
    const withCover = games.filter((g) => g.cover_url);
    check(
      "only the game with a chosen cover has one",
      withCover.length === 1,
      JSON.stringify(games),
    );
    const cover = await fetch(withCover[0].cover_url);
    check("the cover image is public", cover.status === 200);
    check(
      "nothing private in the listing",
      !JSON.stringify(games).includes("password") &&
        !JSON.stringify(games).includes("-web.jpg"),
    );

    const link = games[0].link_token;
    const wrong = await json(`${SVC}/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ link, password: "not-it" }),
    });
    check("a wrong team password is refused", wrong.status === 401);
    const right = await json(`${SVC}/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ link, password: "goblue26" }),
    });
    check("the team password set in JerseySort opens it online", right.status === 200);
    const pass = right.body.pass;
    const game = await json(`${SVC}/game?link=${link}&pass=${pass}&game=${events.a}`);
    const webUrl = game.body.photos?.[0]?.web_url;
    const web = webUrl
      ? Buffer.from(await (await fetch(webUrl)).arrayBuffer())
      : Buffer.alloc(0);
    const meta = web.length > 0 ? await sharp(web).metadata() : {};
    check(
      "photos come at web size (2400 px), not the original",
      game.body.photos?.length === 2 && meta.width === 2400,
      `${game.body.photos?.length} photos, width ${meta.width}`,
    );

    console.log("\n4. Switching it off here switches it off online");
    await page.goto(galleryUrl);
    await act(page, () => page.click("text=Switch the link off"));
    check(
      "the page says the online gallery is being updated",
      (await page.textContent("body")).includes("Updating the online gallery now"),
    );
    check(
      "within seconds it is gone from the website listing",
      await until(async () => (await listing()).length === 0, 30000),
    );
    const off = await json(`${SVC}/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ link, password: "goblue26" }),
    });
    check("and the password opens nothing", off.status === 404);
    await act(page, () => page.click("text=Switch the link back on"));
    check(
      "switched back on, it is listed again",
      await until(async () => (await listing()).length === 2, 30000),
    );

    console.log("\n5. Deleting it here takes it offline");
    await page.goto(galleryUrl);
    await act(page, () => page.click("text=Delete this team gallery"));
    check("deleted", page.url().includes("/galleries?notice="));
    check("nothing of it is left online", (await listing()).length === 0);
  } finally {
    await browser.close();
    fs.rmSync(work, { recursive: true, force: true });
  }
  console.log(
    `\n${failures === 0 ? "ALL" : checks - failures} OF ${checks} CHECK(S) ${failures === 0 ? "PASSED" : `PASSED; ${failures} FAILED`}`,
  );
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
