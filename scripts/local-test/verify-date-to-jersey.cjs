#!/usr/bin/env node
/**
 * The combined journey, date -> sport -> jersey number, in a real browser:
 *
 *   DateSort scans a card, copies a game into its date folder, has
 *   "Basketball - Zac K" added (the folder is renamed, nothing copied twice),
 *   then "Find jersey numbers" starts JerseySort if it is not running and
 *   gives the import link. That link goes through JerseySort's sign-up and
 *   back to the import page with the date, sport and name filled in; creating
 *   the event brings every photo in. The game folder is fingerprinted before
 *   and after: nothing in it may change.
 *
 *   node scripts/local-test/verify-date-to-jersey.cjs [DateSort URL]
 *
 * DateSort must be running. JerseySort may or may not be: the button starts it.
 * Reading numbers is left to whatever reader JerseySort's organization uses;
 * this checks the hand-off, not the reading.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const BASE = (
  process.argv.find((a) => /^https?:/.test(a)) || "http://127.0.0.1:4604"
).replace(/\/$/, "");
const REPO = path.resolve(__dirname, "../..");
const WINDOWS = process.platform === "win32";
const SHOTS = process.env.DATESORT_SCREENSHOTS || null;
const REPORT = process.env.DATESORT_REPORT || null;
const sharp = require(
  path.join(REPO, "packages", "date-sort", "node_modules", "sharp"),
);

const results = { checks: 0, failures: 0, checklist: {} };
function check(name, ok, detail) {
  results.checks += 1;
  if (!ok) results.failures += 1;
  console.log(
    `  ${ok ? "OK  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : ` — ${detail}`}`,
  );
  return ok;
}
async function shot(page, name) {
  if (SHOTS === null) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}
function fingerprint(dir) {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => {
      const f = path.join(e.parentPath, e.name);
      const st = fs.statSync(f);
      return `${path.relative(dir, f)}|${st.size}|${st.mtimeMs}|${crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex")}`;
    })
    .sort()
    .join("\n");
}

async function jpeg(file, when, color) {
  const buf = await sharp({
    create: { width: 640, height: 480, channels: 3, background: color },
  })
    .jpeg({ quality: 85 })
    .withExif({
      IFD0: { Make: "Canon", Model: "Canon EOS R6" },
      IFD2: { DateTimeOriginal: when.replace(/-/g, ":").replace("T", " ") },
    })
    .toBuffer();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
}

(async () => {
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch {
    const root = execFileSync(WINDOWS ? "npm.cmd" : "npm", ["root", "-g"], {
      shell: WINDOWS,
    })
      .toString()
      .trim();
    ({ chromium } = require(path.join(root, "playwright")));
  }
  const linuxDefault = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  const executablePath =
    process.env.CHROMIUM_PATH ||
    (fs.existsSync(linuxDefault) ? linuxDefault : undefined);
  const browser = await chromium.launch(executablePath ? { executablePath } : {});

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "date-to-jersey-"));
  const card = path.join(work, "card", "DCIM", "100CANON");
  const dest = path.join(work, "5 Star Sports Media");
  fs.mkdirSync(dest, { recursive: true });
  const colors = ["#1d4ed8", "#b91c1c", "#15803d", "#a16207"];
  for (let i = 0; i < 4; i++) {
    await jpeg(
      path.join(card, `IMG_${8000 + i}.JPG`),
      `2026-01-13T18:0${i}:00`,
      colors[i],
    );
  }

  console.log("DateSort: two settings saved at the same moment");
  // Typing an event name and pressing Copy saves the name and the destination
  // together. Each save once read, changed and wrote the whole file, so the
  // second could undo the first: the destination was lost (19 times in 20).
  let lost = 0;
  const save = (body) =>
    fetch(`${BASE}/api/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: BASE },
      body: JSON.stringify(body),
    });
  for (let i = 0; i < 10; i++) {
    await Promise.all([
      save({ eventNames: { "2026-01-13": `Try ${i}` } }),
      save({ destination: path.join(work, `try-${i}`) }),
    ]);
    const s = await (
      await fetch(`${BASE}/api/settings`, {
        headers: { "Content-Type": "application/json" },
      })
    ).json();
    if (
      s.destination !== path.join(work, `try-${i}`) ||
      s.eventNames["2026-01-13"] !== `Try ${i}`
    )
      lost += 1;
  }
  check(
    "a name and a destination saved at the same moment are both kept (10 tries)",
    lost === 0,
    `${lost} lost`,
  );
  await save({ eventNames: {} });

  console.log("\nDateSort: scan, copy, add the sport");
  const page = await browser.newPage();
  page.on("dialog", (d) => void d.accept());
  await page.goto(BASE);
  await page.fill("[data-testid=source-input]", path.join(work, "card"));
  await page.click("[data-testid=scan-button]");
  await page.waitForSelector("[data-testid=scan-report]", { timeout: 300_000 });
  await page.fill("[data-testid=destination-input]", dest);
  const day = page.locator("[data-testid=date-card][data-day='2026-01-13']");
  await day.locator("[data-testid=event-name]").fill("");
  await day.locator("[data-testid=create-folder]").click();
  await day.locator("[data-testid=card-result]").waitFor({ timeout: 120_000 });
  await day.locator("[data-testid=event-name]").fill("Basketball - Zac K");
  await day.locator("[data-testid=create-folder]").click();
  await page.waitForFunction(
    () =>
      !!document.querySelector(
        "[data-testid=date-card][data-day='2026-01-13'] [data-testid=card-renamed]",
      ),
    null,
    { timeout: 120_000 },
  );
  const folder = path.join(dest, "2026-01-13 - Basketball - Zac K");
  check(
    "the game is in one folder, named with the sport, and nothing was copied twice",
    fs.existsSync(folder) &&
      fs.readdirSync(dest).length === 1 &&
      fs.readdirSync(folder).length === 4,
    JSON.stringify(fs.readdirSync(dest)),
  );
  const before = fingerprint(folder);

  console.log("\nFind jersey numbers");
  const t0 = Date.now();
  await day.locator("[data-testid=find-jersey-numbers]").click();
  const link = await day
    .locator("[data-testid=open-jersey-sort]")
    .getAttribute("href", { timeout: 420_000 })
    .catch(
      async () =>
        `ERROR: ${await day
          .locator("[data-testid=jersey-error]")
          .textContent()
          .catch(() => "no link")}`,
    );
  const url = link && !link.startsWith("ERROR") ? new URL(link) : null;
  check(
    `the button starts JerseySort if needed and gives the import link (${Math.round((Date.now() - t0) / 1000)} s)`,
    url !== null &&
      url.pathname === "/import" &&
      url.searchParams.get("folder") === folder &&
      url.searchParams.get("date") === "2026-01-13" &&
      url.searchParams.get("sport") === "Basketball" &&
      url.searchParams.get("name") === "Zac K",
    link,
  );
  await shot(page, "01-datesort-jersey-link");
  if (url === null) return finish(browser, work);

  console.log("\nJerseySort: sign up on the way, then import");
  const js = await browser.newPage();
  await js.goto(url.toString());
  const toLogin = /\/login\?next=/.test(js.url());
  await js.click("a[href^='/signup']");
  await js.fill("#name", "Keith");
  await js.fill("[name=organization]", "5 Star Sports Media");
  await js.fill("[name=email]", `keith+${Date.now()}@example.com`);
  await js.fill("[name=password]", "correct horse battery staple");
  await js.click("button[type=submit]");
  await js.waitForURL(/\/import\?/, { timeout: 30_000 }).catch(() => undefined);
  check(
    "not signed in: through sign-up and straight back to the import page",
    toLogin && /\/import\?/.test(js.url()),
    js.url(),
  );
  const summary = await js
    .locator("[data-testid=import-summary]")
    .textContent()
    .catch(() => "");
  const filled = {
    name: await js.inputValue("#name").catch(() => ""),
    sport: await js.inputValue("#sport").catch(() => ""),
    date: await js.inputValue("#date").catch(() => ""),
  };
  check(
    "the import page says what will come in and has the game filled in",
    /4 photos/.test(summary || "") &&
      /not changed/.test(summary || "") &&
      filled.name === "Zac K" &&
      filled.sport === "Basketball" &&
      filled.date === "2026-01-13",
    JSON.stringify({ summary, filled }),
  );
  await shot(js, "02-jerseysort-import");
  if ((await js.inputValue("#team")) === "") await js.fill("#team", "West Seneca");
  // The import form's own button (the header has a Sign out button too).
  await js.click("form:has(input[name=folder]) button[type=submit]");
  await js.waitForURL(/\/events\//, { timeout: 30_000 }).catch(() => undefined);
  const arrived = await js
    .waitForFunction(
      () =>
        /All 4 photos from the folder are in/.test(
          document.querySelector("[data-testid=import-progress]")?.textContent || "",
        ),
      null,
      { timeout: 120_000 },
    )
    .then(() => true)
    .catch(() => false);
  check(
    "creating the event brings all 4 photos in",
    arrived,
    await js
      .locator("[data-testid=import-progress]")
      .textContent()
      .catch(() => ""),
  );
  await shot(js, "03-jerseysort-event");
  check(
    "the game folder is exactly as it was (every file fingerprinted)",
    fingerprint(folder) === before,
  );
  results.checklist["Date, sport, then jersey numbers"] =
    results.failures === 0 ? "PASS" : "FAIL";
  return finish(browser, work);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

async function finish(browser, work) {
  await browser.close();
  fs.rmSync(work, { recursive: true, force: true });
  console.log("---------------------------------------------------------------");
  console.log(
    results.failures === 0
      ? `ALL ${results.checks} CHECKS PASSED`
      : `${results.failures} OF ${results.checks} CHECK(S) FAILED`,
  );
  if (REPORT) fs.writeFileSync(REPORT, JSON.stringify(results, null, 2));
  process.exit(results.failures === 0 ? 0 : 1);
}
