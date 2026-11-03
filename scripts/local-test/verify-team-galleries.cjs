/**
 * Team galleries, end to end in a real browser against the running JerseySort:
 *
 *   the photographer creates two team galleries (Varsity, JV), each with its
 *   own team password, and ticks which games each one shows; a parent with
 *   only the link and the password opens the branded gallery, sees exactly
 *   the games assigned, views and downloads photos byte for byte;
 *
 * and the refusals that make it safe to hand out a link:
 *   a wrong password, the other team's password, another team's photos and
 *   games (even by id), photos never assigned, a changed password, a link
 *   switched off, an old link after a new one is made, and password guessing.
 *
 * The photos are generated here (no real photos of real children).
 *
 * Usage:
 *   pnpm --filter @hl-bos/jersey-sort-app build
 *   JERSEYSORT_DATA_DIR=/tmp/js-data pnpm --filter @hl-bos/jersey-sort-app start
 *   node scripts/local-test/verify-team-galleries.cjs http://127.0.0.1:4603
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const BASE = (process.argv[2] || "http://127.0.0.1:4603").replace(/\/$/, "");
const EXE =
  process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const SHOTS = process.env.JERSEYSORT_SCREENSHOTS || null;
const sharp = require(
  path.join(__dirname, "../../apps/jersey-sort/node_modules/sharp"),
);

let failures = 0;
let checks = 0;
function check(name, condition, detail) {
  checks += 1;
  if (condition) console.log(`  OK    ${name}`);
  else {
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    failures += 1;
  }
}
async function shot(page, name) {
  if (SHOTS === null) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

let seed = 0;
async function photo(dir, name, number, color) {
  seed += 1;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
    <rect width="1200" height="800" fill="#e8eef5"/>
    <rect x="450" y="200" width="300" height="420" rx="30" fill="${color}"/>
    <text x="600" y="480" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="190" fill="#fff">${number}</text>
    <text x="20" y="780" font-size="22" fill="#123">frame ${seed}</text>
  </svg>`;
  const file = path.join(dir, name);
  fs.writeFileSync(
    file,
    await sharp(Buffer.from(svg))
      .jpeg({ quality: 88 })
      .withExif({
        IFD0: { Make: "Canon", Model: "EOS R6" },
        IFD2: { DateTimeOriginal: "2026:10:24 19:0" + (seed % 10) + ":00" },
      })
      .toBuffer(),
  );
  return file;
}

/** Submit a form (a server action) and wait for the page it leads to. */
async function act(page, fn) {
  const posted = page.waitForResponse((r) => r.request().method() === "POST", {
    timeout: 30000,
  });
  await fn();
  await posted;
  await page.waitForLoadState("load");
  await page.waitForTimeout(400);
}

async function createEvent(page, name, team, date) {
  await page.goto(`${BASE}/events/new`);
  await page.fill("#name", name);
  await page.selectOption("#sport", "Hockey").catch(async () => {
    await page.selectOption("#sport", { index: 1 });
  });
  await page.fill("#date", date);
  await page.fill("#team", team);
  await page.click("main button[type=submit]");
  await page.waitForURL(/\/events\/[0-9a-f-]{36}/);
  return page.url().split("?")[0].split("/").pop();
}

async function upload(page, eventId, files) {
  await page.goto(`${BASE}/events/${eventId}`);
  await page.setInputFiles("[data-testid=file-input]", files);
  await page.waitForSelector("text=Upload finished.", { timeout: 120000 });
}

async function idFor(page, filename) {
  await page.goto(
    `${BASE}/photos?q=${encodeURIComponent(filename.replace(/\.[^.]+$/, ""))}`,
  );
  const href = await page.getAttribute(`ul.grid a[aria-label="${filename}"]`, "href", {
    timeout: 5000,
  });
  return href.split("/").pop();
}

async function createGallery(page, group, name, password, eventIds) {
  await page.goto(`${BASE}/galleries`);
  await page.fill("#g-group", group);
  await page.fill("#g-name", name);
  await page.fill("#g-pass", password);
  await act(page, () => page.click("main form button[type=submit]"));
  await page.waitForURL(/\/galleries\/[0-9a-f-]{36}/);
  const id = page.url().split("?")[0].split("/").pop();
  for (const box of await page.$$("[data-testid=gallery-event]")) {
    const value = await box.getAttribute("value");
    if (eventIds.includes(value)) await box.check();
  }
  await act(page, () => page.click("text=Save games"));
  const link = await page.inputValue("[data-testid=gallery-link]");
  return { id, link };
}

async function unlock(page, link, password) {
  await page.goto(link);
  await page.fill("#v-pass", password);
  await act(page, () => page.click("text=Open gallery"));
}

function loadPlaywright() {
  try {
    return require("playwright");
  } catch {
    // Windows CI installs it globally (as for verify-folder-check.cjs).
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
  const browser = await chromium.launch({
    executablePath: fs.existsSync(EXE) ? EXE : undefined,
  });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "team-galleries-"));
  try {
    const owner = await (await browser.newContext()).newPage();
    const email = `keith+${Date.now()}@example.com`;

    console.log("\n1. The photographer sets up games");
    await owner.goto(`${BASE}/signup`);
    await owner.fill("#name", "Keith");
    await owner.fill("#organization", "5 Star Sports Media");
    await owner.fill("#email", email);
    await owner.fill("#password", "correct horse battery");
    await owner.click("main button[type=submit]");
    await owner.waitForURL(`${BASE}/`);
    const varsityGame = await createEvent(
      owner,
      "Varsity vs Wheatfield",
      "Varsity",
      "2026-10-24",
    );
    const jvGame = await createEvent(owner, "JV vs Lockport", "JV", "2026-10-25");
    const practice = await createEvent(
      owner,
      "Varsity practice",
      "Varsity",
      "2026-10-20",
    );
    const v1 = await photo(work, "VARSITY_0001.JPG", "24", "#1d4ed8");
    const v2 = await photo(work, "VARSITY_0002.JPG", "7", "#1d4ed8");
    const j1 = await photo(work, "JV_0001.JPG", "12", "#b91c1c");
    const p1 = await photo(work, "PRACTICE_0001.JPG", "3", "#15803d");
    await upload(owner, varsityGame, [v1, v2]);
    await upload(owner, jvGame, [j1]);
    await upload(owner, practice, [p1]);
    const jvPhotoId = await idFor(owner, "JV_0001.JPG");
    const practicePhotoId = await idFor(owner, "PRACTICE_0001.JPG");
    check("photos are in three games", Boolean(jvPhotoId && practicePhotoId));

    console.log("\n2. Two team galleries, each with its own games and password");
    const varsity = await createGallery(
      owner,
      "Cazenovia Hockey",
      "Varsity",
      "goblue26",
      [varsityGame],
    );
    check(
      "the page says the team now sees 1 game",
      (await owner.textContent("body")).includes("the team now sees 1 game"),
    );
    check(
      "the link is a /g/ link with an unguessable token",
      /\/g\/[A-Za-z0-9_-]{22}$/.test(varsity.link),
      varsity.link,
    );
    check(
      "the page says plainly the link works on this computer only for now",
      (await owner.textContent("[data-testid=local-only]"))?.includes(
        "this computer only",
      ),
    );
    await shot(owner, "01-owner-gallery");
    const jv = await createGallery(owner, "Cazenovia Hockey", "JV", "gojv2026", [
      jvGame,
    ]);
    await owner.goto(`${BASE}/galleries`);
    const cards = await owner.$$eval("[data-testid=gallery-card]", (els) =>
      els.map((e) => e.textContent),
    );
    check(
      "the list shows both teams under their organization with counts",
      cards.length === 2 &&
        cards.some(
          (c) =>
            c.includes("Varsity") && c.includes("1 game") && c.includes("2 photos"),
        ) &&
        cards.some(
          (c) => c.includes("JV") && c.includes("1 game") && c.includes("1 photo"),
        ) &&
        (await owner.textContent("main")).includes("Cazenovia Hockey"),
      JSON.stringify(cards),
    );
    await shot(owner, "02-owner-list");

    console.log("\n3. A parent with only the link");
    const parentCtx = await browser.newContext();
    const parent = await parentCtx.newPage();
    await parent.goto(varsity.link);
    check(
      "the link asks for the team password, under the photographer's brand",
      (await parent.isVisible("#v-pass")) &&
        (await parent.textContent("[data-testid=gallery-brand]")) ===
          "5 Star Sports Media" &&
        (await parent.textContent("[data-testid=gallery-title]")) ===
          "Cazenovia Hockey · Varsity",
    );
    check(
      "nothing of JerseySort itself is shown (no menu, no sign-in)",
      (await parent.$("nav[aria-label=Primary]")) === null &&
        !parent.url().includes("/login"),
    );
    await shot(parent, "03-parent-password");
    await unlock(parent, varsity.link, "wrong-password");
    check(
      "a wrong password is refused",
      (await parent.textContent("[role=alert]"))?.includes("not right"),
    );
    await unlock(parent, varsity.link, "gojv2026");
    check(
      "the JV password does not open Varsity",
      (await parent.isVisible("#v-pass")) &&
        !(await parent.isVisible("[data-testid=gallery-game]")),
    );
    await unlock(parent, varsity.link, "goblue26");
    const games = await parent.$$eval("[data-testid=gallery-game]", (els) =>
      els.map((e) => e.textContent),
    );
    check(
      "the right password shows exactly the assigned game, not JV's or the practice",
      games.length === 1 &&
        games[0].includes("Varsity vs Wheatfield") &&
        games[0].includes("2 photos"),
      JSON.stringify(games),
    );
    await shot(parent, "04-parent-games");
    await parent.click("[data-testid=gallery-game]");
    await parent.waitForURL(/\/e\//);
    const shown = await parent.$$("[data-testid=gallery-photo]");
    check("the game shows its 2 photos", shown.length === 2);
    const thumbOk = await parent
      .waitForFunction(
        () =>
          [...document.querySelectorAll("[data-testid=gallery-photo] img")].every(
            (i) => i.complete && i.naturalWidth > 0,
          ),
        null,
        { timeout: 15000 },
      )
      .then(() => true)
      .catch(() => false);
    check("their thumbnails load", thumbOk);
    await shot(parent, "05-parent-photos");

    const [dl] = await Promise.all([
      parent.waitForEvent("download"),
      parent.click("[data-testid=download-one] >> nth=0"),
    ]);
    const got = fs.readFileSync(await dl.path());
    const originals = [v1, v2].map((f) => sha(fs.readFileSync(f)));
    check(
      "a downloaded photo is the original, byte for byte",
      originals.includes(sha(got)) && dl.suggestedFilename().startsWith("VARSITY_"),
      dl.suggestedFilename(),
    );
    const zip = await parent.request.get(`${varsity.link}/zip/${varsityGame}`);
    const zipBytes = await zip.body();
    check(
      "Download all gives a ZIP with both photos",
      zip.status() === 200 &&
        zip.headers()["content-type"] === "application/zip" &&
        zipBytes.includes(Buffer.from("VARSITY_0001.JPG")) &&
        zipBytes.includes(Buffer.from("VARSITY_0002.JPG")) &&
        !zipBytes.includes(Buffer.from("JV_0001.JPG")),
    );

    console.log("\n4. What a Varsity parent can NOT reach");
    for (const [what, url] of [
      ["a JV photo, by its id", `${varsity.link}/p/${jvPhotoId}/original`],
      [
        "a photo from a game never assigned",
        `${varsity.link}/p/${practicePhotoId}/preview`,
      ],
      ["the JV game, by its id", `${varsity.link}/zip/${jvGame}`],
    ]) {
      const r = await parent.request.get(url);
      check(`${what} is 404`, r.status() === 404, String(r.status()));
    }
    // The page streams (JerseySort's loading screen), so its status is sent
    // before "not found" is known: what matters is what it shows.
    const jvPage = await (
      await parent.request.get(`${varsity.link}/e/${jvGame}`)
    ).text();
    check(
      "the JV game page shows not found, and nothing of the JV game",
      /not found|could not be found/i.test(jvPage) &&
        !jvPage.includes("JV vs Lockport") &&
        !jvPage.includes("JV_0001"),
    );
    await parent.goto(jv.link);
    check(
      "the JV gallery still asks for its own password",
      await parent.isVisible("#v-pass"),
    );
    const stranger = await (await browser.newContext()).newPage();
    const s1 = await stranger.request.get(`${varsity.link}/p/${jvPhotoId}/thumb`);
    const s2 = await stranger.request.get(`${varsity.link}/zip/${varsityGame}`);
    check(
      "someone with the link but no password gets no photos (404)",
      s1.status() === 404 && s2.status() === 404,
    );
    const app = await stranger.request.get(`${BASE}/api/photos/${jvPhotoId}/original`);
    check(
      "JerseySort's own photo files still refuse visitors (401)",
      app.status() === 401,
    );

    console.log("\n5. The photographer stays in control");
    await owner.goto(`${BASE}/galleries/${varsity.id}`);
    await owner.fill("#g-newpass", "newpass26");
    await act(owner, () => owner.click("text=Change password"));
    await parent.goto(varsity.link);
    check(
      "a new team password signs the parent out",
      await parent.isVisible("#v-pass"),
    );
    await unlock(parent, varsity.link, "goblue26");
    check("the old password no longer works", await parent.isVisible("#v-pass"));
    await unlock(parent, varsity.link, "newpass26");
    check(
      "the new password works",
      (await parent.$$("[data-testid=gallery-game]")).length === 1,
    );

    await owner.goto(`${BASE}/galleries/${varsity.id}`);
    await act(owner, () => owner.click("text=Switch the link off"));
    await parent.goto(varsity.link);
    check(
      "a link switched off opens nothing",
      await parent.isVisible("[data-testid=gallery-closed]"),
    );
    const off = await parent.request.get(`${varsity.link}/zip/${varsityGame}`);
    check("not even a download", off.status() === 404);
    await owner.goto(`${BASE}/galleries/${varsity.id}`);
    await act(owner, () => owner.click("text=Switch the link back on"));
    await act(owner, () => owner.click("text=Make a new link"));
    const fresh = await owner.inputValue("[data-testid=gallery-link]");
    await parent.goto(varsity.link);
    check(
      "after a new link is made, the old one opens nothing",
      fresh !== varsity.link &&
        (await parent.isVisible("[data-testid=gallery-closed]")),
    );
    await unlock(parent, fresh, "newpass26");
    check(
      "the new link works with the team password",
      (await parent.$$("[data-testid=gallery-game]")).length === 1,
    );

    console.log("\n6. Guessing the password");
    const guesser = await (await browser.newContext()).newPage();
    for (let i = 0; i < 10; i += 1) await unlock(guesser, jv.link, `guess-${i}-xx`);
    await unlock(guesser, jv.link, "gojv2026");
    check(
      "after ten wrong guesses even the right password waits 15 minutes",
      (await guesser.textContent("[role=alert]"))?.includes("Too many wrong passwords"),
    );
  } finally {
    await browser.close();
    fs.rmSync(work, { recursive: true, force: true });
  }
  console.log(
    `\n${failures === 0 ? "ALL" : checks - failures} OF ${checks} CHECK(S) ${failures === 0 ? "PASSED" : "PASSED; " + failures + " FAILED"}`,
  );
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
