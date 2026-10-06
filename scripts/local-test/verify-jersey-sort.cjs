/**
 * Drives JerseySort AI end to end in a real browser against the running app,
 * through every step of the MVP brief's required deliverable:
 *
 *   sign in · create an event · upload a batch · see processing status ·
 *   jersey numbers detected · photos grouped by number · review questionable
 *   ones · correct numbers · create a player · connect #24 to them · open
 *   their gallery · search · favorite · download selected photos
 *
 * plus the refusals that make it trustworthy: a duplicate and a fake photo
 * are refused, the scoreboard and yard line are not filed as jerseys, the
 * original file is byte-for-byte untouched, a signed-out visitor and another
 * organization get nothing, a cross-site upload is refused, and a provider
 * that cannot run marks photos FAILED (never invents a result) and Retry
 * recovers them.
 *
 * The photos are GENERATED here (players with numbers on their jerseys, a
 * scoreboard, yard markers, EXIF dates), so the test needs no real photos of
 * real children. Generated photos are cleaner than real action shots; the
 * OCR accuracy printed at the end is a statement about THESE photos only.
 *
 * Usage:
 *   pnpm --filter @hl-bos/jersey-sort-app build
 *   JERSEYSORT_DATA_DIR=/tmp/js-data pnpm --filter @hl-bos/jersey-sort-app start
 *   JERSEYSORT_DATA_DIR=/tmp/js-data node scripts/local-test/verify-jersey-sort.cjs http://127.0.0.1:4603
 *
 * Needs playwright and a chromium. Not part of `pnpm check`: it needs a
 * running server.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const BASE = (process.argv[2] || "http://127.0.0.1:4603").replace(/\/$/, "");
const EXE =
  process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const DATA_DIR = process.env.JERSEYSORT_DATA_DIR || null;
const SHOTS = process.env.JERSEYSORT_SCREENSHOTS || null;
const sharp = require(
  path.join(__dirname, "../../apps/jersey-sort/node_modules/sharp"),
);

let failures = 0;
function check(name, condition, detail) {
  if (condition) console.log(`  OK    ${name}`);
  else {
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    failures += 1;
  }
}
async function shot(page, name) {
  if (SHOTS === null) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
}
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

/**
 * Run something that submits a form (a server action), and wait until its
 * response has arrived and the page has re-rendered. Reading the page any
 * sooner reads the PREVIOUS page.
 */
async function act(page, fn) {
  const posted = page.waitForResponse((r) => r.request().method() === "POST", {
    timeout: 30000,
  });
  await fn();
  await posted;
  await page.waitForLoadState("load");
  await page.waitForTimeout(500);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PALETTE = [
  { jersey: "#c62828", ink: "#ffffff" },
  { jersey: "#ffffff", ink: "#1a237e" },
  { jersey: "#1565c0", ink: "#ffffff" },
];

function player(x, y, number, colors, scale = 1) {
  const w = 230 * scale;
  const h = 330 * scale;
  return `
    <ellipse cx="${x + w / 2}" cy="${y - 55 * scale}" rx="${55 * scale}" ry="${65 * scale}" fill="#8d5524"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${30 * scale}" fill="${colors.jersey}" stroke="#222" stroke-width="3"/>
    <rect x="${x + 20 * scale}" y="${y + h}" width="${80 * scale}" height="${150 * scale}" fill="#eeeeee"/>
    <rect x="${x + w - 100 * scale}" y="${y + h}" width="${80 * scale}" height="${150 * scale}" fill="#eeeeee"/>
    <text x="${x + w / 2}" y="${y + 230 * scale}" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold"
      font-size="${170 * scale}" fill="${colors.ink}">${number}</text>`;
}

/** A 1600x1067 "sideline photo". */
function scene({ players = [], scoreboard = false, yard = null, seed }) {
  const grass = ["#2e7d32", "#33691e", "#2f6f2f"][seed % 3];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1067">
    <rect width="1600" height="1067" fill="${grass}"/>
    <rect y="0" width="1600" height="200" fill="#90a4ae"/>
    ${scoreboard ? `<rect x="1150" y="20" width="420" height="140" fill="#111"/><text x="1180" y="125" font-family="DejaVu Sans" font-weight="bold" font-size="100" fill="#ffcc00">14 21</text>` : ""}
    ${yard ? `<text x="${120 + (seed % 5) * 40}" y="1030" font-family="DejaVu Sans" font-weight="bold" font-size="110" fill="#ffffff">${yard}</text>` : ""}
    ${players.map((p) => player(p.x, p.y, p.n, PALETTE[p.c ?? 0], p.s ?? 1)).join("")}
    <text x="5" y="1062" font-size="9" fill="${grass}">${seed}</text>
  </svg>`;
}

async function render(svg, fmt, exifDate) {
  let img = sharp(Buffer.from(svg));
  if (fmt === "png") return img.png().toBuffer();
  img = img.jpeg({ quality: 88 });
  if (exifDate)
    img = img.withExif({
      IFD0: { Make: "Canon", Model: "EOS R6" },
      IFD2: { DateTimeOriginal: exifDate },
    });
  return img.toBuffer();
}

async function buildFixtures(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const specs = [];
  let seed = 1;
  const at = (day, i) => `2026:10:${day} 19:${String(10 + i).padStart(2, "0")}:00`;
  // #24 alone, ten frames.
  for (let i = 0; i < 10; i++)
    specs.push({
      name: `IMG_44${String(i).padStart(2, "0")}.jpg`,
      truth: ["24"],
      players: [{ x: 600 + (i % 3) * 60, y: 380, n: "24", c: 0 }],
      date: at("03", i),
    });
  // #24 and #7 together.
  for (let i = 0; i < 5; i++)
    specs.push({
      name: `IMG_45${String(i).padStart(2, "0")}.jpg`,
      truth: ["24", "7"],
      players: [
        { x: 250, y: 380, n: "24", c: 0 },
        { x: 950, y: 400, n: "7", c: 2 },
      ],
      date: at("03", 20 + i),
    });
  // #18, dark numbers on a white jersey.
  for (let i = 0; i < 4; i++)
    specs.push({
      name: `IMG_46${String(i).padStart(2, "0")}.jpg`,
      truth: ["18"],
      players: [{ x: 700, y: 390, n: "18", c: 1 }],
      date: at("03", 30 + i),
    });
  // #24 with the scoreboard showing 14-21 behind him.
  for (let i = 0; i < 3; i++)
    specs.push({
      name: `IMG_47${String(i).padStart(2, "0")}.jpg`,
      truth: ["24"],
      players: [{ x: 500, y: 400, n: "24", c: 0 }],
      scoreboard: true,
      date: at("03", 40 + i),
    });
  // Empty field with a yard marker: no jersey at all.
  for (let i = 0; i < 2; i++)
    specs.push({
      name: `IMG_48${String(i).padStart(2, "0")}.jpg`,
      truth: [],
      players: [],
      yard: "30",
      date: at("03", 45 + i),
    });
  // A second game day for the date gallery.
  for (let i = 0; i < 2; i++)
    specs.push({
      name: `IMG_49${String(i).padStart(2, "0")}.jpg`,
      truth: ["24"],
      players: [{ x: 650, y: 380, n: "24", c: 0 }],
      date: `2026:10:10 18:0${i}:00`,
    });
  specs.push({
    name: "team_photo.png",
    truth: ["52"],
    players: [{ x: 700, y: 390, n: "52", c: 2 }],
    fmt: "png",
  });
  specs.push({
    name: "no_date.jpg",
    truth: ["11"],
    players: [{ x: 700, y: 390, n: "11", c: 2 }],
  });

  const files = [];
  // A REAL HEVC-coded HEIC (what an iPhone writes), if one is supplied. sharp
  // can only ENCODE AV1-coded HEIF, which is a different format, so a HEIC
  // cannot be generated here; it has to be a real file.
  const heicSample = process.env.JERSEYSORT_HEIC_SAMPLE;
  if (heicSample && fs.existsSync(heicSample)) {
    const bytes = fs.readFileSync(heicSample);
    const file = path.join(dir, "IMG_5000.HEIC");
    fs.writeFileSync(file, bytes);
    files.push({
      name: "IMG_5000.HEIC",
      truth: [],
      fmt: "heic",
      file,
      sha: sha(bytes),
    });
  }
  for (const s of specs) {
    const bytes = await render(scene({ ...s, seed: seed++ }), s.fmt ?? "jpg", s.date);
    const file = path.join(dir, s.name);
    fs.writeFileSync(file, bytes);
    files.push({ ...s, file, sha: sha(bytes) });
  }
  // A duplicate of the first photo under another name, and a fake photo.
  const dup = path.join(dir, "IMG_4400 copy.jpg");
  fs.copyFileSync(files[0].file, dup);
  const fake = path.join(dir, "definitely_a_photo.jpg");
  fs.writeFileSync(fake, "MZ this is not a photo");
  return { photos: files, dup, fake };
}

// ---------------------------------------------------------------------------

(async () => {
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch {
    ({ chromium } = require(
      path.join(execFileSync("npm", ["root", "-g"]).toString().trim(), "playwright"),
    ));
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jerseysort-e2e-"));
  const { photos, dup, fake } = await buildFixtures(path.join(tmp, "photos"));
  console.log(
    `Generated ${photos.length} photos (+1 duplicate, +1 fake) in ${tmp}/photos`,
  );

  const browser = await chromium.launch({ executablePath: EXE });
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1360, height: 900 },
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(e.message));

  const email = `coach+${Date.now()}@example.com`;
  const password = "correct horse battery";

  console.log("\n1. Sign in");
  const anon = await page.request.get(`${BASE}/`, { maxRedirects: 0 });
  check(
    "a signed-out visitor is sent to sign in (307)",
    anon.status() === 307 && (anon.headers()["location"] || "").endsWith("/login"),
  );
  const anonImg = await page.request.get(
    `${BASE}/api/photos/00000000-0000-0000-0000-000000000000/original`,
  );
  check("photo files refuse a signed-out request (401)", anonImg.status() === 401);
  await page.goto(`${BASE}/signup`);
  await page.fill("#name", "Keith");
  await page.fill("#organization", "West Seneca Football");
  await page.fill("#email", email);
  await page.fill("#password", "short");
  await page.evaluate(() =>
    document.querySelector("#password").removeAttribute("minlength"),
  );
  await page.click("main button[type=submit]");
  await page.waitForURL(/\/signup\?error=/);
  check(
    "a short password is refused with a reason",
    (await page.textContent("[role=alert]"))?.includes("10 characters"),
  );
  await page.fill("#name", "Keith");
  await page.fill("#organization", "West Seneca Football");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("main button[type=submit]");
  await page.waitForURL(`${BASE}/`);
  check(
    "signing up lands on the dashboard",
    (await page.textContent("body")).includes("Find your athlete. Instantly."),
  );
  check(
    "an empty dashboard says how to start, not fake numbers",
    (await page.textContent("body")).includes("Get started"),
  );
  await shot(page, "01-dashboard-empty");
  // Sign out and back in, through the form.
  await page.click("header form button");
  await page.waitForURL(`${BASE}/login`);
  await page.fill("#email", email);
  await page.fill("#password", "wrong password here");
  await page.click("main button[type=submit]");
  await page.waitForURL(/\/login\?error=/);
  check(
    "a wrong password is refused",
    (await page.textContent("[role=alert]"))?.includes("do not match"),
  );
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("main button[type=submit]");
  await page.waitForURL(`${BASE}/`);
  check("signing in works", page.url() === `${BASE}/`);

  console.log("\n2. Create an event");
  await page.goto(`${BASE}/events/new`);
  await page.fill("#name", "West Seneca vs Orchard Park");
  await page.selectOption("#sport", "Football");
  await page.fill("#date", "2026-10-03");
  await page.fill("#team", "West Seneca");
  await page.fill("#opponent", "Orchard Park");
  // Home in dark: the form suggests light for the away team.
  await page.check("input[name=home_jersey][value=dark]");
  check(
    "choosing Dark for the home team suggests Light for the away team",
    await page.isChecked("input[name=away_jersey][value=light]"),
  );
  await page.fill("#location", "West Seneca West HS");
  await page.click("main button[type=submit]");
  await page.waitForURL(/\/events\/[0-9a-f-]{36}/);
  const eventUrl = page.url().split("?")[0];
  const eventId = eventUrl.split("/").pop();
  const header = await page.textContent("header.mb-5");
  check(
    "the event page shows the event",
    header.includes("West Seneca vs Orchard Park") &&
      header.includes("October 3, 2026"),
  );
  check("the season defaulted to the event's year", header.includes("2026 season"));
  check(
    "the event shows both teams and their jerseys",
    ((await page.textContent("[data-testid=event-teams]")) || "").replace(
      /\s+/g,
      " ",
    ) === "West Seneca (home, dark) vs Orchard Park (away, light)",
    await page.textContent("[data-testid=event-teams]").catch(() => "none"),
  );

  console.log("\n3. Upload photos");
  const t0 = Date.now();
  await page.waitForSelector("[data-testid=file-input][data-ready=true]", {
    state: "attached",
  });
  await page.setInputFiles("[data-testid=file-input]", [
    ...photos.map((p) => p.file),
    dup,
    fake,
  ]);
  await page.waitForSelector("text=Upload finished.", { timeout: 120000 });
  const uploadText = await page.textContent("section.card.mb-5");
  check(
    `all ${photos.length} photos were added`,
    uploadText.includes(`${photos.length} added`),
    uploadText,
  );
  check(
    "the duplicate was skipped and named as one",
    uploadText.includes("1 already here"),
  );
  check("the fake photo was refused", uploadText.includes("1 refused"));
  const undated = photos.filter((p) => !p.date).length;
  check(
    "photos with no date are reported as inferred",
    uploadText.includes(`${undated} had no date in the file`),
    `${undated}`,
  );
  console.log(`        upload took ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await shot(page, "02-uploaded");

  console.log("\n4. Processing status");
  const first = await (
    await page.request.get(`${BASE}/api/progress?event=${eventId}`)
  ).json();
  check(
    "progress reports the whole batch",
    first.total === photos.length,
    JSON.stringify(first),
  );
  await page.goto(`${BASE}/`);
  const navText = await page.textContent("header");
  const midway = await (
    await page.request.get(`${BASE}/api/progress?event=${eventId}`)
  ).json();
  check(
    "analysis keeps running while you are elsewhere in the app",
    midway.done >= first.done &&
      (navText.includes("Analyzing") || midway.queued + midway.processing === 0),
  );
  let p = midway;
  const deadline = Date.now() + 10 * 60 * 1000;
  while (p.queued + p.processing > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    p = await (await page.request.get(`${BASE}/api/progress?event=${eventId}`)).json();
  }
  check(
    "every photo finished analysis",
    p.done === photos.length && p.queued + p.processing === 0,
    JSON.stringify(p),
  );
  console.log(
    `        analysis of ${photos.length} photos finished ${((Date.now() - t0) / 1000).toFixed(1)}s after upload began`,
  );

  console.log("\n5. Jersey numbers detected, photos grouped by number");
  await page.goto(`${eventUrl}?tab=numbers`);
  await shot(page, "03-jersey-numbers");
  const cards = await page.$$eval("ul li a span.display", (els) =>
    els.map((e) => e.textContent.trim()),
  );
  const numbersShown = cards.filter((c) => c.startsWith("#")).map((c) => c.slice(1));
  console.log(
    `        jersey galleries: ${numbersShown.map((n) => `#${n}`).join(", ") || "(none)"}`,
  );
  check("#24 has a gallery", numbersShown.includes("24"));
  check(
    "the scoreboard (14, 21, 1421) is not filed as a jersey",
    !numbersShown.some((n) => ["14", "21"].includes(n)),
  );
  check("the yard marker 30 is not filed as a jersey", !numbersShown.includes("30"));
  check("an Unidentified group exists", cards.includes("Unidentified"));

  // Measure local OCR against the known truth, per photo.
  let found = 0;
  let expected = 0;
  let falsePositive = 0;
  const db = DATA_DIR ? path.join(DATA_DIR, "jerseysort.db") : null;
  let detByName = new Map();
  if (db) {
    const { DatabaseSync } = require("node:sqlite");
    const sql = new DatabaseSync(db, { readOnly: true });
    for (const r of sql
      .prepare(
        "select p.original_filename f, d.detected_value v, d.confidence c from photos p join photo_detections d on d.photo_id = p.id where d.status != 'rejected'",
      )
      .all()) {
      if (!detByName.has(r.f)) detByName.set(r.f, []);
      detByName.get(r.f).push({ v: r.v, c: r.c });
    }
    sql.close();
    for (const ph of photos) {
      const got = (detByName.get(ph.name) ?? [])
        .filter((d) => d.c >= 0.6)
        .map((d) => d.v);
      expected += ph.truth.length;
      found += ph.truth.filter((n) => got.includes(n)).length;
      falsePositive += got.filter((n) => !ph.truth.includes(n)).length;
    }
    console.log(
      `        local OCR on these generated photos: ${found}/${expected} jersey numbers filed, ${falsePositive} wrong numbers filed`,
    );
    const max = Math.max(0, ...[...detByName.values()].flat().map((d) => d.c));
    check(
      "local OCR never auto-files: every reading is capped in the review band",
      max <= 0.8,
      `max ${max}`,
    );
  }

  // Open the #24 gallery.
  await page.goto(`${eventUrl}?tab=numbers&number=24`);
  const g24 = await page.$$("ul.grid li");
  check("the #24 gallery shows photos", g24.length > 0, `${g24.length}`);
  const thumbsLazy = await page.$$eval("ul.grid li img", (imgs) =>
    imgs.every((i) => i.getAttribute("loading") === "lazy" && i.src.includes("/thumb")),
  );
  check("galleries use lazy-loaded thumbnails, never originals", thumbsLazy);
  const both = photos.find((x) => x.truth.length === 2);
  const bothId = await idFor(page, both.name);
  await page.goto(`${BASE}/photos/${bothId}`);
  const detText = await page.textContent("aside");
  check(
    "one photo can carry two athletes' numbers (if OCR read both)",
    detText.includes("#24") || detText.includes("#7"),
  );

  console.log("\n6. Review queue");
  await page.goto(`${BASE}/review?event=${eventId}`);
  await shot(page, "04-review");
  const reviewBefore = Number(
    (await page.textContent("h1 + span")).match(/[\d,]+/)?.[0].replace(/,/g, "") ?? "0",
  );
  check("uncertain photos are waiting in review", reviewBefore > 0, `${reviewBefore}`);
  const reviewName = await page.textContent("aside a.font-semibold");
  const confirmBtn = await page.$("button:has-text('Confirm #')");
  if (confirmBtn) {
    await act(page, () => confirmBtn.click());
    check(
      "confirming a number keeps the same photo on screen",
      (await page.textContent("aside a.font-semibold")) === reviewName,
    );
  }
  // Add two numbers by typing (a digit focuses the add field).
  await page.keyboard.press("9");
  await page.keyboard.type("9");
  await act(page, () => page.keyboard.press("Enter"));
  check(
    "typing a digit then Enter adds that number",
    (await page.textContent("aside")).includes("#99"),
  );
  await page.keyboard.press("8");
  await page.keyboard.type("8");
  await act(page, () => page.keyboard.press("Enter"));
  const twoAdded = await page.textContent("aside");
  check(
    "a second number can be added to the same photo",
    twoAdded.includes("#99") && twoAdded.includes("#88"),
  );
  check(
    "the photo stays on screen until you say Done",
    (await page.textContent("aside a.font-semibold")) === reviewName,
  );
  await act(page, () => page.keyboard.press("Enter")); // Done -> next photo
  const nextName = await page.textContent("aside a.font-semibold").catch(() => "");
  check("Enter finishes the photo and shows the next one", nextName !== reviewName);
  await act(page, () => page.click("button[data-review-op=skip]"));
  check(
    "Skip moves on",
    (await page.textContent("aside a.font-semibold").catch(() => "")) !== nextName,
  );
  const emptyField = photos.find((x) => x.yard === "30");
  const emptyId = await idFor(page, emptyField.name);
  await page.goto(`${BASE}/photos/${emptyId}`);
  await act(page, () => page.click("button[data-op=no_jersey]"));
  const emptyStatus = await page.textContent("aside");
  check(
    "'No jersey visible' completes the photo",
    emptyStatus.includes("Sorted") && emptyStatus.includes("No jersey numbers"),
  );
  const reviewAfter = (
    await (await page.request.get(`${BASE}/api/progress?event=${eventId}`)).json()
  ).needsReview;
  check(
    "the review count went down",
    reviewAfter < reviewBefore,
    `${reviewBefore} -> ${reviewAfter}`,
  );

  console.log("\n7. Correct a number");
  const eighteen = photos.find((x) => x.truth[0] === "18");
  const eighteenId = await idFor(page, eighteen.name);
  await page.goto(`${BASE}/photos/${eighteenId}`);
  // Whatever OCR read (or did not), make it right: change or add.
  const changeInput = await page.$("input[aria-label^='Change #']");
  if (changeInput) {
    await changeInput.fill("81");
    await act(page, () => page.click("button:has-text('Change')"));
    check(
      "'Change' replaces the reading",
      (await page.textContent("aside")).includes("#81"),
    );
    await act(page, () =>
      page.click("[data-testid=detection-81] button:has-text('Delete')"),
    );
  }
  await page.fill("#add-number", "#18");
  await act(page, () => page.click("button:has-text('+ Add number')"));
  const corrected = await page.textContent("aside");
  check(
    "the corrected number is confirmed",
    corrected.includes("#18") && corrected.includes("Confirmed"),
  );
  check(
    "an invented three-digit number is refused",
    await (async () => {
      await page.fill("#add-number", "123");
      await act(page, () => page.click("button:has-text('+ Add number')"));
      return (await page.textContent("[role=alert]"))?.includes("one or two digits");
    })(),
  );

  console.log("\n8. Say which team #24 plays for, then create the player");
  // Local OCR reads digits, not jerseys: its #24 has no team until a person
  // says which. One click covers every #24 of the game.
  await page.goto(`${eventUrl}?tab=numbers`);
  check(
    "local OCR's #24 starts as 'team not known', never guessed",
    (await page.locator("[data-testid='gallery-unknown-team-24']").count()) === 1,
  );
  await page.click("[data-testid='gallery-unknown-team-24']");
  await act(page, () => page.click("[data-testid=assign-team-dark]"));
  check(
    "one click files every #24 of the game under West Seneca #24",
    (await page.locator("[data-testid='gallery-West Seneca-24']").count()) === 1 &&
      (await page.locator("[data-testid='gallery-unknown-team-24']").count()) === 0,
  );
  await shot(page, "04b-team-assigned");

  console.log("\n8b. Create a player and connect #24");
  await page.goto(`${BASE}/players/new`);
  check(
    "the player form is pre-filled with the latest event's team and season",
    (await page.inputValue("#team")) === "West Seneca" &&
      (await page.inputValue("#season")) === "2026",
  );
  await page.fill("#first", "Dominic");
  await page.fill("#last", "Herman");
  await page.fill("#number", "24");
  await page.fill("#position", "Defense");
  await page.fill("#sport", "Football");
  await page.fill("#year", "2029");
  await page.click("main button[type=submit]");
  await page.waitForURL(/\/players\/[0-9a-f-]{36}/);
  const playerUrl = page.url().split("?")[0];
  await shot(page, "05-player");
  const ph = await page.textContent("main header");
  check(
    "the player page shows name, number, position, class and season",
    ph.includes("Dominic Herman") &&
      ph.includes("#24") &&
      ph.includes("Defense") &&
      ph.includes("2029") &&
      ph.includes("2026 season"),
  );
  const playerTiles = await page.$$("ul.grid li");
  check(
    "their gallery holds the #24 photos",
    playerTiles.length > 0,
    `${playerTiles.length}`,
  );
  check(
    "their events are listed",
    (await page.textContent("body")).includes("West Seneca vs Orchard Park"),
  );
  await page.goto(`${eventUrl}?tab=numbers`);
  check(
    "the jersey gallery now reads '#24 — Dominic Herman'",
    (await page.textContent("main")).includes("Dominic Herman"),
  );
  await page.goto(`${BASE}/players/new`);
  await page.fill("#first", "Someone");
  await page.fill("#last", "Else");
  await page.fill("#number", "24");
  await page.click("main button[type=submit]");
  await page.waitForURL(/\/players\/new\?error=/);
  check(
    "#24 cannot be given to a second player for the same team and season",
    (await page.textContent("[role=alert]")).includes(
      "already Dominic Herman's number",
    ),
  );

  console.log("\n9. Search");
  const searches = {
    24: true,
    "#24": true,
    "Dominic Herman": true,
    "October 3": true,
    "West Seneca": true,
    Football: true,
    "October 4": false,
  };
  for (const [q, want] of Object.entries(searches)) {
    await page.goto(`${BASE}/photos?q=${encodeURIComponent(q)}`);
    const n = (await page.$$("ul.grid li")).length;
    check(
      `search "${q}" ${want ? "finds photos" : "finds nothing"}`,
      want ? n > 0 : n === 0,
      `${n}`,
    );
  }
  await page.goto(`${BASE}/photos?q=${encodeURIComponent("October 10")}`);
  check('"October 10" finds only that day', (await page.$$("ul.grid li")).length === 2);
  await page.goto(`${BASE}/dates`);
  const dates = await page.textContent("main");
  check(
    "the date gallery groups by day and flags inferred dates",
    dates.includes("October 3, 2026") &&
      dates.includes("October 10, 2026") &&
      dates.includes("dated by upload"),
  );

  console.log("\n10. Favorites");
  const firstJpeg = photos.find((x) => x.name === "IMG_4400.jpg");
  const favId = await idFor(page, firstJpeg.name);
  await page.goto(`${BASE}/photos/${favId}`);
  await act(page, () => page.click("button:has-text('☆ Favorite')"));
  check(
    "the photo shows as favorited",
    (await page.textContent("aside")).includes("★ Favorited"),
  );
  await page.goto(`${eventUrl}?tab=favorites`);
  check(
    "the event's Favorites gallery has it",
    (await page.$$("ul.grid li")).length === 1,
  );
  await page.goto(`${BASE}/photos?favorites=1`);
  check("the Favorites filter has it", (await page.$$("ul.grid li")).length === 1);

  console.log("\n11. Bulk actions and download");
  await page.goto(`${eventUrl}?tab=all`);
  await page.click("button:has-text('Select photos')");
  const tiles = await page.$$("ul.grid li button");
  await tiles[0].click();
  await tiles[1].click();
  await page.fill("#bulk-number", "55");
  await page.click("button:has-text('Add'):near(#bulk-number)");
  await page.waitForSelector("text=Added #55 to 2 photos.");
  check("bulk 'add jersey number' tags both", true);
  await page.goto(`${eventUrl}?tab=numbers&number=55`);
  check(
    "the #55 gallery holds exactly the two",
    (await page.$$("ul.grid li")).length === 2,
  );
  await page.click("button:has-text('Select photos')");
  await page.click("button:has-text('Select all')");
  const playerValue = await page.$eval(
    "#bulk-player",
    (sel) =>
      [...sel.options].find((o) => o.text.includes("Dominic Herman"))?.value ?? "",
  );
  await page.selectOption("#bulk-player", playerValue);
  await page.click("button:has-text('Assign')");
  await page.waitForSelector("text=Tagged 2 photos with that player.");
  check("bulk 'assign player' works", true);
  await page.click("button:has-text('Mark reviewed')");
  await page.waitForSelector("text=Marked 2 photos reviewed.");
  check("bulk 'mark reviewed' works", true);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click("button:has-text('Download 2')"),
  ]);
  const zipPath = path.join(tmp, "download.zip");
  await download.saveAs(zipPath);
  const out = path.join(tmp, "unzipped");
  execFileSync("python3", [
    "-c",
    "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; z.extractall(sys.argv[2])",
    zipPath,
    out,
  ]);
  const extracted = fs.readdirSync(out);
  check(
    "the download is a valid ZIP of the two selected photos",
    extracted.length === 2,
    extracted.join(", "),
  );
  const originalsMatch = extracted.every((f) => {
    const src = photos.find((p) => p.name === f);
    return src && sha(fs.readFileSync(path.join(out, f))) === src.sha;
  });
  check(
    "the downloaded files are the untouched originals, byte for byte",
    originalsMatch,
  );
  const single = await page.request.get(
    `${BASE}/api/photos/${favId}/original?download=1`,
  );
  check(
    "single-photo download returns the untouched original",
    sha(await single.body()) === firstJpeg.sha &&
      (single.headers()["content-disposition"] || "").includes(firstJpeg.name),
  );

  console.log("\n12. Formats and storage");
  const heic = photos.find((p) => p.fmt === "heic");
  if (heic) {
    const heicId = await idFor(page, heic.name);
    const heicPreview = await page.request.get(`${BASE}/api/photos/${heicId}/preview`);
    check(
      "a real HEIC upload gets a viewable JPEG preview",
      heicPreview.status() === 200 &&
        heicPreview.headers()["content-type"] === "image/jpeg",
    );
    const heicOrig = await page.request.get(`${BASE}/api/photos/${heicId}/original`);
    check(
      "the HEIC original is kept as HEIC, untouched",
      sha(await heicOrig.body()) === heic.sha,
    );
  } else {
    console.log(
      "  SKIP  HEIC: set JERSEYSORT_HEIC_SAMPLE to a real .heic file to check it",
    );
  }
  const png = photos.find((p) => p.fmt === "png");
  const pngId = await idFor(page, png.name);
  check(
    "a PNG upload is accepted and previewed",
    (await page.request.get(`${BASE}/api/photos/${pngId}/thumb`)).status() === 200,
  );
  const noDateId = await idFor(page, "no_date.jpg");
  await page.goto(`${BASE}/photos/${noDateId}`);
  check(
    "a photo with no date says its date is inferred",
    (await page.textContent("aside")).includes("inferred from upload"),
  );
  await page.goto(`${BASE}/photos/${favId}`);
  const details = await page.textContent("aside");
  check(
    "EXIF is read: capture time and camera",
    details.includes("7:10 PM") && details.includes("Canon EOS R6"),
  );

  console.log("\n13. Isolation and refusals");
  const cross = await page.request.post(`${BASE}/api/events/${eventId}/photos`, {
    headers: { Origin: "https://evil.example" },
    multipart: {
      file: {
        name: "x.jpg",
        mimeType: "image/jpeg",
        buffer: fs.readFileSync(photos[1].file),
      },
    },
  });
  check("a cross-site upload is refused (403)", cross.status() === 403);
  const crossDl = await page.request.post(`${BASE}/api/download`, {
    headers: { Origin: "https://evil.example" },
    form: { id: favId },
  });
  check("a cross-site download is refused (403)", crossDl.status() === 403);
  const rival = await browser.newContext();
  const rp = await rival.newPage();
  await rp.goto(`${BASE}/signup`);
  await rp.fill("#name", "Rival");
  await rp.fill("#organization", "Orchard Park Football");
  await rp.fill("#email", `rival+${Date.now()}@example.com`);
  await rp.fill("#password", password);
  await rp.click("main button[type=submit]");
  await rp.waitForURL(`${BASE}/`);
  check(
    "another organization's photo is invisible (404)",
    (await rp.request.get(`${BASE}/api/photos/${favId}/original`)).status() === 404,
  );
  await rp.goto(`${BASE}/photos/${favId}`);
  check(
    "another organization's photo page is not found",
    (await rp.textContent("main")).includes("Not found"),
  );
  await rp.goto(`${BASE}/photos?q=24`);
  check(
    "another organization's search finds nothing of ours",
    (await rp.$$("ul.grid li")).length === 0,
  );
  await rp.goto(`${BASE}/`);
  check(
    "another organization's dashboard counts none of ours",
    (await rp.textContent("main")).includes("Get started"),
  );
  await rival.close();

  console.log("\n14. A provider that cannot run fails honestly, and Retry recovers");
  await page.goto(`${BASE}/settings`);
  await page.check("input[value=claude]");
  await act(page, () => page.click("form:has(input[value=none]) button[type=submit]"));
  const extra = path.join(tmp, "late.jpg");
  fs.writeFileSync(
    extra,
    await render(
      scene({ players: [{ x: 700, y: 390, n: "24", c: 0 }], seed: 999 }),
      "jpg",
      "2026:10:03 21:00:00",
    ),
  );
  await page.goto(eventUrl);
  const tUp = Date.now();
  await page.waitForSelector("[data-testid=file-input][data-ready=true]", {
    state: "attached",
  });
  await page.setInputFiles("[data-testid=file-input]", [extra]);
  await page.waitForSelector("text=Upload finished.", { timeout: 120_000 });
  console.log(
    `  ..    one-photo upload finished in ${((Date.now() - tUp) / 1000).toFixed(1)} s`,
  );
  let q = await (
    await page.request.get(`${BASE}/api/progress?event=${eventId}`)
  ).json();
  for (let i = 0; i < 40 && q.failed === 0; i++) {
    await new Promise((r) => setTimeout(r, 500));
    q = await (await page.request.get(`${BASE}/api/progress?event=${eventId}`)).json();
  }
  check(
    "with Claude chosen and no key, the photo is FAILED, not invented",
    q.failed === 1,
  );
  const lateId = await idFor(page, "late.jpg");
  await page.goto(`${BASE}/photos/${lateId}`);
  check(
    "the photo says exactly why",
    (await page.textContent("aside")).includes("no Anthropic API key is set"),
  );
  await page.goto(`${BASE}/settings`);
  await page.check("input[value=local-ocr]");
  await act(page, () => page.click("form:has(input[value=none]) button[type=submit]"));
  await page.goto(eventUrl);
  await act(page, () => page.click("button:has-text('Retry failed')"));
  for (let i = 0; i < 60; i++) {
    q = await (await page.request.get(`${BASE}/api/progress?event=${eventId}`)).json();
    if (q.failed === 0 && q.queued + q.processing === 0) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  check(
    "Retry re-analyzes it with the working provider",
    q.failed === 0 && q.done === q.total,
  );

  console.log("\n15. Thresholds");
  await page.goto(`${BASE}/settings`);
  await page.fill("#high", "70");
  await page.fill("#medium", "40");
  await act(page, () => page.click("button:has-text('Save thresholds')"));
  check(
    "changing thresholds re-sorts every photo",
    (await page.textContent("main")).includes("re-sorted under the new thresholds"),
  );
  await page.fill("#high", "50");
  await page.fill("#medium", "60");
  await act(page, () => page.click("button:has-text('Save thresholds')"));
  check(
    "an impossible threshold pair is refused",
    (await page.textContent("[role=alert]")).includes("lower than the automatic"),
  );
  await page.fill("#high", "85");
  await page.fill("#medium", "60");
  await act(page, () => page.click("button:has-text('Save thresholds')"));

  console.log("\n15b. A team member");
  const memberEmail = `photog+${Date.now()}@example.com`;
  await page.goto(`${BASE}/settings`);
  await page.fill("input[aria-label=Name]", "Sideline Photographer");
  await page.fill("input[aria-label=Email]", memberEmail);
  await page.fill("input[aria-label='Temporary password']", password);
  await act(page, () => page.click("button:has-text('Add person')"));
  check(
    "the owner adds a member from Settings",
    (await page.textContent("main")).includes(memberEmail),
  );
  const memberCtx = await browser.newContext();
  const mp = await memberCtx.newPage();
  await mp.goto(`${BASE}/login`);
  await mp.fill("#email", memberEmail);
  await mp.fill("#password", password);
  await mp.click("main button[type=submit]");
  await mp.waitForURL(`${BASE}/`);
  check(
    "the member sees the organization's photos",
    (await mp.request.get(`${BASE}/api/photos/${favId}/thumb`)).status() === 200,
  );
  await mp.goto(`${BASE}/settings`);
  check(
    "thresholds are switched off for a member, with the reason",
    (await mp.isDisabled("button:has-text('Save thresholds')")) &&
      (await mp.textContent("main")).includes("Only the organization"),
  );
  await mp.evaluate(() =>
    document
      .querySelectorAll("button[disabled]")
      .forEach((b) => b.removeAttribute("disabled")),
  );
  await mp.fill("#high", "50");
  await mp.fill("#medium", "20");
  await act(mp, () => mp.click("button:has-text('Save thresholds')"));
  check(
    "a member forcing the button is refused by the server",
    (await mp.textContent("[role=alert]")).includes("Only the organization's owner"),
  );
  await mp.goto(`${eventUrl}/edit`);
  check(
    "a member is not offered event deletion",
    !(await mp.textContent("main")).includes("Delete event and photos"),
  );
  await memberCtx.close();

  console.log("\n16. Dashboard");
  await page.goto(`${BASE}/`);
  await shot(page, "06-dashboard");
  const dash = await page.textContent("main");
  const statPhotos = Number(
    (await page.textContent("a[href='/photos'] .display")).replace(/,/g, ""),
  );
  check(
    "the dashboard's photo count is the real count",
    statPhotos === photos.length + 1,
    `${statPhotos}`,
  );
  check(
    "the dashboard lists the event and recent uploads",
    dash.includes("West Seneca vs Orchard Park") &&
      (await page.$$("main ul.grid li img")).length > 0,
  );

  if (DATA_DIR) {
    console.log("\n17. Originals on disk");
    const { DatabaseSync } = require("node:sqlite");
    const sql = new DatabaseSync(path.join(DATA_DIR, "jerseysort.db"), {
      readOnly: true,
    });
    const rows = sql
      .prepare("select original_filename f, storage_path s from photos")
      .all();
    sql.close();
    const intact = rows.every((r) => {
      const src = photos.find((p) => p.name === r.f);
      return !src || sha(fs.readFileSync(path.join(DATA_DIR, r.s))) === src.sha;
    });
    check("every stored original is byte-for-byte the uploaded file", intact);
  }

  check(
    "no uncaught errors in the browser",
    consoleErrors.length === 0,
    consoleErrors.join(" | "),
  );
  await browser.close();
  console.log(
    `\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`,
  );
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

/** The id of a photo by its filename, via the app's own search page. */
async function idFor(page, filename) {
  const probe = await page.context().newPage();
  try {
    await probe.goto(
      `${BASE}/photos?q=${encodeURIComponent(filename.replace(/\.[^.]+$/, ""))}`,
    );
    const href = await probe.getAttribute(
      `ul.grid a[aria-label="${filename}"]`,
      "href",
      { timeout: 5000 },
    );
    if (!href) throw new Error(`photo ${filename} not found`);
    return href.split("/").pop();
  } finally {
    await probe.close();
  }
}
