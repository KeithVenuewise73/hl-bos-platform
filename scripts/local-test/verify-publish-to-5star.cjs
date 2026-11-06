/**
 * "Publish to 5 Star", end to end in a real browser: the page DateSort opens
 * for a date folder (/publish) → JerseySort → the team-gallery service (the
 * real handler and database functions, run locally by
 * gallery-service-local.ts against migrations 0053 + 0054).
 *
 *   the date folder becomes a game in the chosen team gallery · it is
 *   published by itself once its photos are in · the team password opens it
 *   online · the message for the families carries the website link and the
 *   password · pressing it again for the same folder adds nothing twice ·
 *   the folder itself is never changed
 *
 * Usage:
 *   (local PostgreSQL with all migrations applied, fresh)
 *   deno run -A scripts/local-test/gallery-service-local.ts
 *   JERSEYSORT_GALLERY_SERVICE_URL=http://127.0.0.1:54400/functions/v1/team-gallery \
 *     JERSEYSORT_DATA_DIR=/tmp/js pnpm --filter @hl-bos/jersey-sort-app start
 *   node scripts/local-test/verify-publish-to-5star.cjs http://127.0.0.1:4603 http://127.0.0.1:54400
 */
const crypto = require("node:crypto");
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
function fingerprint(dir) {
  return fs
    .readdirSync(dir)
    .map((n) => {
      const f = path.join(dir, n);
      const st = fs.statSync(f);
      const sha = crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
      return `${n}|${st.size}|${st.mtimeMs}|${sha}`;
    })
    .sort()
    .join("\n");
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
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "publish-5star-"));
  // A date folder the way DateSort makes it, on the photographer's drive.
  const folder = path.join(
    work,
    "Games",
    "2026-10-24 - Hockey - Varsity vs Wheatfield",
  );
  fs.mkdirSync(folder, { recursive: true });
  for (const n of ["24", "7", "12"]) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2400">
      <rect width="3600" height="2400" fill="#1d4ed8"/>
      <text x="1800" y="1400" text-anchor="middle" font-size="700" fill="#fff">${n}</text></svg>`;
    fs.writeFileSync(
      path.join(folder, `IMG_00${n.padStart(2, "0")}.JPG`),
      await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer(),
    );
  }
  fs.writeFileSync(path.join(folder, "IMG_0024.CR2"), "raw bytes");
  const folderBefore = fingerprint(folder);
  const publishUrl = `${BASE}/publish?${new URLSearchParams({
    folder,
    date: "2026-10-24",
    sport: "Hockey",
    name: "Varsity vs Wheatfield",
  })}`;

  try {
    const page = await (await browser.newContext()).newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    console.log("\n1. Signed in, with a team gallery (name and team password)");
    await page.goto(`${BASE}/signup`);
    await page.fill("#name", "Keith");
    await page.fill("#organization", "5 Star Sports Media");
    await page.fill("#email", `keith+${Date.now()}@example.com`);
    await page.fill("#password", "correct horse battery");
    await page.click("main button[type=submit]");
    await page.waitForURL(`${BASE}/`);

    await page.goto(publishUrl);
    check(
      "with no team gallery yet, the page says to create one first",
      await page.isVisible("[data-testid=publish-no-gallery]"),
    );
    await page.goto(`${BASE}/galleries`);
    await page.fill("#g-group", "Cazenovia Hockey");
    await page.fill("#g-name", "Varsity");
    await page.fill("#g-pass", "goblue26");
    await act(page, () => page.click("main form button[type=submit]"));
    const galleryUrl = page.url().split("?")[0];

    console.log("\n2. Publish to 5 Star, from the page DateSort opens");
    await page.goto(publishUrl);
    const summary = (await page.textContent("[data-testid=publish-summary]")) || "";
    check(
      "it shows what is in the folder: 3 photos, the RAW file left out",
      summary.includes("3 photos") && summary.includes("1 Canon RAW file"),
      summary,
    );
    check(
      "the game details come filled in from DateSort",
      (await page.inputValue("#name")) === "Varsity vs Wheatfield" &&
        (await page.inputValue("#sport")) === "Hockey",
    );
    check(
      "the team gallery is offered (the only one, chosen)",
      (await page.$$("[data-testid=publish-gallery]")).length === 1 &&
        (await page.isChecked("[data-testid=publish-gallery]")),
    );
    check(
      "a first game's team comes filled in from the team gallery",
      (await page.inputValue("#team")) === "Varsity",
      await page.inputValue("#team"),
    );
    await shot(page, "01-publish-page");
    await act(page, () => page.click('button:has-text("Publish to 5 Star")'));
    check(
      "it lands on the team gallery, saying the game goes online when its photos are in",
      page.url().startsWith(galleryUrl) &&
        ((await page.textContent("body")) || "").includes(
          "goes online on 5starsportsmedia.com as soon as they are all in",
        ),
      page.url(),
    );

    const online = await until(async () => {
      const g = await listing();
      return g.length === 1 && g[0].photo_count === 3;
    }, 120000);
    const games = await listing();
    check(
      "by itself, the game goes online with all 3 photos, under the team",
      online &&
        games[0].title === "Varsity vs Wheatfield" &&
        games[0].group_name === "Cazenovia Hockey" &&
        games[0].gallery_name === "Varsity",
      JSON.stringify(games),
    );
    const link = games[0]?.link_token;
    const right = await json(`${SVC}/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ link, password: "goblue26" }),
    });
    check("the team password opens it online", right.status === 200);

    console.log("\n3. The message for the families");
    await page.goto(galleryUrl);
    await until(async () => {
      await page.goto(galleryUrl);
      return page.isVisible("[data-testid=family-message]");
    }, 30000);
    await page.fill("[data-testid=family-password]", "goblue26");
    const message = await page.inputValue("[data-testid=family-text]");
    check(
      "it carries the website link and the team password, ready to copy",
      message.includes(`https://5starsportsmedia.com/galleries/view/#${link}`) &&
        message.includes("Team password: goblue26") &&
        message.includes("Cazenovia Hockey · Varsity"),
      message,
    );
    await shot(page, "02-family-message");

    console.log("\n4. Pressing it again for the same folder");
    await page.goto(publishUrl);
    check(
      "the page says the game is already in JerseySort and asks only for the gallery",
      (await page.isVisible("[data-testid=publish-existing]")) &&
        !(await page.isVisible("#name")),
    );
    await act(page, () => page.click('button:has-text("Publish to 5 Star")'));
    await until(async () => {
      await page.goto(galleryUrl);
      return page.isVisible("[data-testid=publish-done]");
    }, 60000);
    const again = await listing();
    check(
      "nothing twice: still one game online, with its 3 photos",
      again.length === 1 && again[0].photo_count === 3,
      JSON.stringify(again),
    );
    await page.goto(`${BASE}/events`);
    const named = await page.$$("text=Varsity vs Wheatfield");
    check("and still one game in JerseySort", named.length === 1, `${named.length}`);

    check("the folder itself was not changed", fingerprint(folder) === folderBefore);
    check("no script errors on the pages", errors.length === 0, errors.join(" | "));
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
