/**
 * Proves DateSort Step 1 (Scan and Report) in a real browser, against the
 * running app, on whatever operating system this runs on (Windows in CI):
 *
 *   1. Optionally starts DateSort the way the CEO can from the console:
 *      open the Development Control Center and press "Start DateSort".
 *      (DateSort.bat is started by the CI workflow itself, before this.)
 *   2. Builds a camera-card-shaped folder OUTSIDE the repo: Canon JPGs over
 *      several game days, REAL Canon CR2/CR3 metadata structures, HEIC, PNG,
 *      edited photos with no camera date, junk files, nested subfolders.
 *   3. Browse: on Windows, presses Browse and drives the real Windows
 *      folder window (pick-folder-in-dialog.ps1) to choose that folder.
 *   4. Scans with "Include subfolders" off, then on, and asserts every
 *      number on the screen: per-format counts, shooting dates, first/last
 *      times, camera vs estimated dates, and the "Estimated date" labels.
 *   5. Scans a CR3-only folder to prove CR3 Date Taken is read from the
 *      camera metadata (DateTimeOriginal, then CreateDate), not estimated.
 *   6. Scans any REAL folders in DATESORT_REAL_FOLDERS (e.g. C:\Windows\Web)
 *      and checks the counts against an independent count made here.
 *   7. For EVERY folder: fingerprints every file (path, size, modified time,
 *      SHA-256) before and after. Any changed, renamed, deleted or added
 *      file fails.
 *   8. Checks that another web page cannot drive DateSort's API.
 *
 * Usage:
 *   node scripts/local-test/verify-date-sort.cjs [http://127.0.0.1:4604]
 *     [--console http://localhost:4000]   press Start DateSort in the console first
 *   env: DATESORT_REAL_FOLDERS  folders to scan too (path-delimiter separated)
 *        DATESORT_SCREENSHOTS   folder to save screenshots in
 *        DATESORT_REPORT        file to write a JSON summary to
 *        CHROMIUM_PATH          browser to use (default: Playwright's own)
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawn } = require("node:child_process");

const args = process.argv.slice(2);
const BASE = (args.find((a) => /^https?:/.test(a)) || "http://127.0.0.1:4604").replace(
  /\/$/,
  "",
);
const consoleAt = args.indexOf("--console");
const CONSOLE =
  consoleAt === -1 ? null : (args[consoleAt + 1] || "").replace(/\/$/, "");
const REPO = path.resolve(__dirname, "../..");
const FIXTURES = path.join(REPO, "packages", "date-sort", "fixtures");
const SHOTS = process.env.DATESORT_SCREENSHOTS || null;
const REAL = (process.env.DATESORT_REAL_FOLDERS || "")
  .split(path.delimiter)
  .map((s) => s.trim())
  .filter((s) => s.length > 0);
const PICKER_TITLE = "DateSort - choose the folder with your photos";
const DESTINATION_TITLE = "DateSort - choose where the date folders go";
const WINDOWS = process.platform === "win32";
const sharp = require(
  path.join(REPO, "packages", "date-sort", "node_modules", "sharp"),
);

let failures = 0;
let checks = 0;
const results = { checklist: {}, folders: [] };
function check(name, condition, detail) {
  checks += 1;
  if (condition) console.log(`  OK    ${name}`);
  else {
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    failures += 1;
  }
  return Boolean(condition);
}
/** Record a line of the CEO's checklist: PASS only if every part held. */
function verdict(key, ...parts) {
  const ok = parts.every(Boolean);
  results.checklist[key] =
    results.checklist[key] === "FAIL" ? "FAIL" : ok ? "PASS" : "FAIL";
}
async function shot(page, name) {
  if (SHOTS === null) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

// ---------------------------------------------------------------------------
// Fingerprinting: the proof that nothing in a folder changed
// ---------------------------------------------------------------------------

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // a folder Windows will not open is not ours to fingerprint
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function fingerprint(dir) {
  const map = new Map();
  for (const file of walk(dir)) {
    try {
      const st = fs.statSync(file);
      const hash = crypto
        .createHash("sha256")
        .update(fs.readFileSync(file))
        .digest("hex");
      map.set(path.relative(dir, file), `${st.size}|${st.mtimeMs}|${hash}`);
    } catch {
      map.set(path.relative(dir, file), "unreadable");
    }
  }
  return map;
}

function differences(before, after) {
  const out = [];
  for (const [file, print] of before) {
    if (!after.has(file)) out.push(`removed or renamed: ${file}`);
    else if (after.get(file) !== print) out.push(`changed: ${file}`);
  }
  for (const file of after.keys()) if (!before.has(file)) out.push(`added: ${file}`);
  return out;
}

// ---------------------------------------------------------------------------
// The camera card
// ---------------------------------------------------------------------------

async function cameraJpeg(file, when, color) {
  const exif = when.replace(/-/g, ":").replace("T", " ");
  const buf = await sharp({
    create: { width: 320, height: 240, channels: 3, background: color },
  })
    .jpeg({ quality: 80 })
    .withExif({
      // DateTime (the EDIT time) deliberately says Christmas: DateSort must ignore it.
      IFD0: { Make: "Canon", Model: "Canon EOS R6", DateTime: "2026:12:25 09:00:00" },
      IFD2: { DateTimeOriginal: exif },
    })
    .toBuffer();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
}

function copyFixture(name, to, modifiedLocal) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(FIXTURES, name), to);
  if (modifiedLocal) {
    const t = new Date(modifiedLocal); // no zone: this computer's local time
    fs.utimesSync(to, t, t);
  }
}

async function buildCard(root) {
  const c100 = path.join(root, "DCIM", "100CANON");
  const shots = [
    ["IMG_0001.JPG", "2026-10-03T18:01:00"],
    ["IMG_0002.JPG", "2026-10-03T19:45:00"],
    ["IMG_0003.JPG", "2026-10-03T20:44:10"],
    ["IMG_0004.JPG", "2026-10-04T13:03:00"],
    ["IMG_0006.JPG", "2026-10-04T14:30:00"],
    ["IMG_0007.jpeg", "2026-10-04T15:47:00"],
    ["IMG_0008.JPG", "2026-10-05T09:15:00"],
    ["IMG_0009.JPG", "2026-10-05T10:40:00"],
  ];
  let i = 0;
  for (const [name, when] of shots) {
    await cameraJpeg(path.join(c100, name), when, i++ % 2 ? "#1e3a8a" : "#7f1d1d");
  }
  await cameraJpeg(path.join(root, "IMG_ROOT.JPG"), "2026-10-06T18:00:00", "#14532d");
  // Real Canon RAW metadata structures (see packages/date-sort/fixtures).
  copyFixture("cr3-all-three-differ.cr3", path.join(c100, "IMG_0004.CR3")); // DTO Oct 4 13:03
  copyFixture("cr3-createdate-only.cr3", path.join(c100, "IMG_0009.CR3")); // CreateDate Oct 5 19:30
  copyFixture("cr2-all-three-differ.cr2", path.join(c100, "IMG_0005.CR2")); // DTO Oct 4 15:47
  copyFixture("canon-eos-m50.cr3", path.join(root, "DCIM", "101CANON", "IMG_0100.CR3")); // 2018-02-21
  copyFixture("heic-all-three-differ.heic", path.join(root, "Phone", "IMG_7000.HEIC")); // Oct 4 14:10
  copyFixture("png-all-three-differ.png", path.join(root, "Edited", "team.png")); // Oct 4 16:20
  // No camera date: these must be shown as ESTIMATED, from their file time.
  copyFixture(
    "heic-no-exif.heic",
    path.join(root, "Phone", "IMG_7001.HEIC"),
    "2026-10-05T12:00:00",
  );
  copyFixture(
    "jpg-modifydate-only.jpg",
    path.join(root, "Edited", "crop.jpg"),
    "2026-10-05T21:30:00",
  );
  copyFixture(
    "cr3-modifydate-only.cr3",
    path.join(root, "Edited", "IMG_0010.CR3"),
    "2026-10-03T19:00:00",
  );
  // Not photos.
  fs.writeFileSync(path.join(root, "Thumbs.db"), "windows thumbnail cache");
  fs.writeFileSync(path.join(c100, "MVI_0011.MP4"), "not a video, either");
  fs.writeFileSync(path.join(root, "Edited", "notes.txt"), "pick the best 20");
  fs.writeFileSync(path.join(root, "Edited", "broken.jpg"), "this is text, not a JPEG");
}

const CARD_EXPECTED = {
  total: 22,
  photos: 18,
  jpeg: 10,
  png: 1,
  heic: 2,
  cr2: 1,
  cr3: 4,
  unsupported: 4,
  camera: 15,
  estimated: 3,
  days: [
    {
      day: "2018-02-21",
      photos: 1,
      camera: 1,
      estimated: 0,
      first: "12:08 PM",
      last: "12:08 PM",
      formats: "1 CR3",
    },
    {
      day: "2026-10-03",
      photos: 4,
      camera: 3,
      estimated: 1,
      first: "6:01 PM",
      last: "8:44 PM",
      formats: "3 JPG · 1 CR3",
    },
    {
      day: "2026-10-04",
      photos: 7,
      camera: 7,
      estimated: 0,
      first: "1:03 PM",
      last: "4:20 PM",
      formats: "3 JPG · 1 PNG · 1 HEIC · 1 CR2 · 1 CR3",
    },
    {
      day: "2026-10-05",
      photos: 5,
      camera: 3,
      estimated: 2,
      first: "9:15 AM",
      last: "9:30 PM",
      formats: "3 JPG · 1 HEIC · 1 CR3",
      lastIsEstimate: true,
    },
    {
      day: "2026-10-06",
      photos: 1,
      camera: 1,
      estimated: 0,
      first: "6:00 PM",
      last: "6:00 PM",
      formats: "1 JPG",
    },
  ],
};

async function buildCr3Only(root) {
  copyFixture("canon-eos-m50.cr3", path.join(root, "M50_0001.CR3")); // real camera file, 2018-02-21 12:08
  copyFixture("cr3-all-three-differ.cr3", path.join(root, "IMG_1001.CR3")); // 2026-10-04 13:03 (DTO)
  copyFixture("cr3-createdate-only.cr3", path.join(root, "IMG_1002.CR3")); // 2026-10-05 19:30 (CreateDate)
  // ExifTool sees ModifyDate 2026-10-06 here, and nothing else: must be estimated.
  copyFixture(
    "cr3-modifydate-only.cr3",
    path.join(root, "IMG_1003.CR3"),
    "2026-10-07T08:00:00",
  );
}

// ---------------------------------------------------------------------------
// Create folders and copy
// ---------------------------------------------------------------------------

function sha(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

async function waitForCopy(page) {
  await page.waitForFunction(
    () =>
      document.querySelector("[data-testid=copy-cancel]") === null &&
      document.querySelector("[data-testid=copy-progress]") === null &&
      (document.querySelector("[data-testid=copy-summary]") !== null ||
        document.querySelector("[data-testid=copy-error]") !== null),
    null,
    { timeout: 900_000 },
  );
  const n = async (id) =>
    Number(
      ((await page.textContent(`[data-testid=${id}]`).catch(() => "")) || "").replace(
        /[^0-9]/g,
        "",
      ),
    );
  return {
    error: await page.textContent("[data-testid=copy-error]").catch(() => null),
    copied: await n("sum-copied"),
    already: await n("sum-already"),
    conflicts: await n("sum-conflicts"),
    failed: await n("sum-failed"),
  };
}

// ---------------------------------------------------------------------------
// Sport suggestions: the Claude key. No real key is used in a test (it would
// spend money), so this proves the parts around it: the panel says what is
// sent, a non-key is refused before anything is sent, and a key Anthropic
// does not accept is refused in plain words and NOT saved. The Claude call
// itself is tested with a fake in packages/date-sort/src/sport/sport.test.ts.
// ---------------------------------------------------------------------------
async function sportChecks(page, browser) {
  const panel = await page
    .waitForSelector("[data-testid=sport-panel]", { timeout: 10_000 })
    .then((e) => e.textContent())
    .catch(() => "");
  const explained = check(
    "the Sports panel says exactly what would be sent to Claude",
    /768 px/.test(panel || "") && /Nothing else leaves this laptop/.test(panel || ""),
    panel,
  );
  const form = await page
    .waitForSelector("[data-testid=claude-key-form]", { timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (!form) {
    check(
      "with no key saved, the panel asks for one",
      false,
      "no key form (is a key saved on this machine?)",
    );
    return verdict("Sport key handling", false);
  }
  const errorAfter = async (key) => {
    await page.fill("[data-testid=claude-key-input]", key);
    await page.click("[data-testid=claude-key-save]");
    return page
      .waitForFunction(
        () =>
          document.querySelector("[data-testid=claude-key-error]")?.textContent || null,
        null,
        { timeout: 60_000 },
      )
      .then((h) => h.jsonValue())
      .catch(() => null);
  };
  const notAKey = await errorAfter("hello");
  const refusedShape = check(
    "something that is not a key is refused before anything is sent",
    /does not look like a Claude API key/.test(notAKey || ""),
    notAKey,
  );
  const fake = await errorAfter(`sk-ant-api03-${"datesortTestNotARealKey".repeat(3)}`);
  const stillAsks = await page
    .$("[data-testid=claude-key-form]")
    .then((e) => e !== null)
    .catch(() => false);
  const refusedByAnthropic = check(
    "a key Anthropic does not accept is refused in plain words, and not saved",
    /did not accept|Could not reach Claude/.test(fake || "") && stillAsks,
    fake,
  );
  await shot(page, "10-sport-key");
  verdict("Sport key handling", explained, refusedShape, refusedByAnthropic);

  // The page's side of suggestions, with Claude's answers played by a stand-in
  // at the page's connection (a real key would spend money). Nothing this page
  // does reaches the real settings: its saves are answered here too.
  const p2 = await browser.newPage();
  await p2.route("**/api/claude-key", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ saved: true }),
    }),
  );
  await p2.route("**/api/settings", (r) =>
    r.request().method() === "POST"
      ? r.fulfill({ contentType: "application/json", body: '{"ok":true}' })
      : r.continue(),
  );
  const lines = [
    {
      type: "guess",
      cached: false,
      guess: {
        day: "2026-10-04",
        sport: "basketball",
        agreeing: 7,
        looked: 8,
        tally: [
          { verdict: "basketball", count: 7 },
          { verdict: "unclear", count: 1 },
        ],
        notes: "",
      },
    },
    {
      type: "guess",
      cached: false,
      guess: {
        day: "2026-10-05",
        sport: null,
        agreeing: 0,
        looked: 4,
        tally: [
          { verdict: "basketball", count: 2 },
          { verdict: "volleyball", count: 2 },
        ],
        notes: "",
      },
    },
    {
      type: "failed",
      day: "2026-10-06",
      message: "Claude is busy for this key right now.",
    },
    { type: "done" },
  ];
  await p2.route("**/api/sport", (r) =>
    r.fulfill({
      contentType: "application/x-ndjson",
      body: lines.map((l) => JSON.stringify(l)).join("\n") + "\n",
    }),
  );
  await p2.goto(BASE);
  await p2.waitForSelector("[data-testid=suggest-sports]", { timeout: 15_000 });
  await p2.click("[data-testid=suggest-sports]");
  const cardOf = (day) => p2.locator(`[data-testid=date-card][data-day='${day}']`);
  await cardOf("2026-10-04")
    .locator("[data-testid=card-sport]")
    .waitFor({ timeout: 10_000 });
  const t4 = await cardOf("2026-10-04")
    .locator("[data-testid=card-sport]")
    .textContent();
  const t5 = await cardOf("2026-10-05")
    .locator("[data-testid=card-sport]")
    .textContent();
  const t6 = await cardOf("2026-10-06")
    .locator("[data-testid=card-sport]")
    .textContent();
  const shown = check(
    "each card shows its answer: a clear sport, a split shown as a split, a failure in plain words",
    /Looks like Basketball \(7 of 8 photos\)/.test(t4 || "") &&
      /not clear/.test(t5 || "") &&
      /Basketball 2, Volleyball 2/.test(t5 || "") &&
      /busy/.test(t6 || ""),
    JSON.stringify([t4, t5, t6]),
  );
  await cardOf("2026-10-04").locator("[data-testid=use-sport]").click();
  const nameNow = await cardOf("2026-10-04")
    .locator("[data-testid=event-name]")
    .inputValue();
  const folderNow = await cardOf("2026-10-04")
    .locator("[data-testid=folder-preview]")
    .textContent();
  const used = check(
    "Use puts the sport in front of the event name, and the folder name follows",
    nameNow === "Basketball - Caz vs Wheatfield" &&
      /2026-10-04 - Basketball - Caz vs Wheatfield/.test(folderNow || ""),
    JSON.stringify({ nameNow, folderNow }),
  );
  const nothingForSplit = check(
    "a split date offers nothing to apply",
    (await cardOf("2026-10-05").locator("[data-testid=use-sport]").count()) === 0,
  );
  await shot(p2, "11-sport-suggestions");
  await p2.close();
  verdict("Sport suggestions on the page", shown, used, nothingForSplit);
}

// ---------------------------------------------------------------------------
// Bring in from iPhone. No CI machine has an iPhone, so the workflow starts
// DateSort with DATESORT_IPHONE_TEST_SOURCE pointing at a folder laid out like
// an iPhone's DCIM, and the copy goes through the same Windows Shell calls it
// makes on a real phone. Finding "Apple iPhone" in This PC is the one part
// only a real phone can prove.
// ---------------------------------------------------------------------------
async function iphoneChecks(page, work) {
  const source = process.env.DATESORT_IPHONE_TEST_SOURCE;
  if (!WINDOWS || !source) {
    console.log("  (skipped: needs Windows and DATESORT_IPHONE_TEST_SOURCE)");
    return;
  }
  for (const [sub, from, to] of [
    ["100APPLE", "iphone-style.mov", "IMG_0042.MOV"],
    ["100APPLE", "header-only.mp4", "IMG_0043.MP4"],
    ["100APPLE", "heic-all-three-differ.heic", "IMG_0044.HEIC"],
    ["101APPLE", "jpg-all-three-differ.jpg", "IMG_0050.JPG"],
  ]) {
    fs.mkdirSync(path.join(source, sub), { recursive: true });
    fs.copyFileSync(path.join(FIXTURES, from), path.join(source, sub, to));
  }
  const phoneBefore = fingerprint(source);
  const kept = path.join(work, "Seagate", "iPhone Photos");
  fs.mkdirSync(kept, { recursive: true });
  await fetch(`${BASE}/api/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ iphoneFolder: kept }),
  });
  await page.reload();
  const run = async () => {
    await page.click("[data-testid=iphone-button]");
    return page
      .waitForFunction(
        () => {
          const t =
            document.querySelector("[data-testid=iphone-progress]")?.textContent || "";
          const p =
            document.querySelector("[data-testid=iphone-problem]")?.textContent || "";
          return /^Done/.test(t) || p !== "" ? t || p : null;
        },
        null,
        { timeout: 300_000 },
      )
      .then((h) => h.jsonValue())
      .catch(() => "no answer");
  };
  const first = await run();
  const keptFiles = walk(kept)
    .map((f) => path.relative(kept, f).replace(/\\/g, "/"))
    .sort();
  const copied = check(
    "every photo and video comes across into the kept folder, in the phone's own folders",
    /4 copied · 0 already there/.test(first) &&
      JSON.stringify(keptFiles) ===
        JSON.stringify([
          "100APPLE/IMG_0042.MOV",
          "100APPLE/IMG_0043.MP4",
          "100APPLE/IMG_0044.HEIC",
          "101APPLE/IMG_0050.JPG",
        ]),
    JSON.stringify({ first, keptFiles }),
  );
  const same = check(
    "each copy is byte for byte the original",
    sha(path.join(kept, "100APPLE", "IMG_0042.MOV")) ===
      sha(path.join(source, "100APPLE", "IMG_0042.MOV")) &&
      sha(path.join(kept, "101APPLE", "IMG_0050.JPG")) ===
        sha(path.join(source, "101APPLE", "IMG_0050.JPG")),
  );
  const scanned = await page
    .waitForFunction(
      () =>
        /2 videos/.test(
          document.querySelector("[data-testid=headline]")?.textContent || "",
        ),
      null,
      {
        timeout: 120_000,
      },
    )
    .then(() => true)
    .catch(() => false);
  const autoScan = check(
    "then it scans the kept folder by itself (the report shows the 2 videos)",
    scanned && (await page.inputValue("[data-testid=source-input]")) === kept,
    await page.textContent("[data-testid=headline]").catch(() => ""),
  );
  await shot(page, "12-iphone");
  const second = await run();
  const again = check(
    "pressing it again brings nothing twice: all 4 already there",
    /0 copied · 4 already there/.test(second),
    second,
  );
  const untouched = check(
    "nothing on the phone side changed (every file fingerprinted)",
    differences(phoneBefore, fingerprint(source)).length === 0,
  );
  verdict(
    "Bring in from iPhone (same Windows calls, iPhone-like folder)",
    copied,
    same,
    autoScan,
    again,
    untouched,
  );
}

async function copyChecks(page, card, work) {
  const sourceBefore = fingerprint(card);
  const dest = path.join(work, "Games");
  fs.mkdirSync(dest);
  // Someone else's file already in a date folder, under a name DateSort wants.
  fs.mkdirSync(path.join(dest, "2026-10-06"));
  fs.writeFileSync(path.join(dest, "2026-10-06", "IMG_ROOT.JPG"), "not the same photo");

  page.on("dialog", (d) => void d.accept());
  const card4 = page.locator("[data-testid=date-card][data-day='2026-10-04']");

  // 0. Nothing chosen: the box must not show anything that looks like a
  //    folder (an example path there was once taken for a chosen folder),
  //    and Copy all must say so instead of copying.
  await page.fill("[data-testid=destination-input]", "");
  const hint = await page.getAttribute(
    "[data-testid=destination-input]",
    "placeholder",
  );
  await page.click("[data-testid=copy-all]");
  const none = await page
    .waitForSelector("[data-testid=copy-error]", { timeout: 10_000 })
    .then((e) => e.textContent())
    .catch(() => null);
  check(
    "with no folder chosen, the box shows no folder path and Copy all says none is chosen",
    !/[a-z]:\\/i.test(hint || "") && /No folder is chosen yet/.test(none || ""),
    `placeholder: ${hint}; message: ${none}`,
  );

  // 1. A destination inside the scanned folder is refused.
  fs.mkdirSync(path.join(card, "Sorted"), { recursive: true });
  await page.fill("[data-testid=destination-input]", path.join(card, "Sorted"));
  await card4.locator("[data-testid=create-folder]").click();
  // Do not read check 0's message as this copy's answer.
  await page.waitForFunction(
    () =>
      !/No folder is chosen yet/.test(
        document.querySelector("[data-testid=copy-error]")?.textContent || "",
      ),
  );
  const inside = await waitForCopy(page);
  fs.rmSync(path.join(card, "Sorted"), { recursive: true });
  check(
    "a destination inside the scanned folder is refused, and nothing is copied",
    /inside the folder you scanned/.test(inside.error || ""),
    inside.error,
  );

  // 2. Choose the destination (the real Windows folder window on Windows).
  let destOk;
  if (WINDOWS) {
    const { code, chosen } = await driveDialog(
      page,
      dest,
      "[data-testid=destination-input]",
      "[data-testid=destination-browse]",
      DESTINATION_TITLE,
    );
    destOk = check(
      `destination chosen with Browse ("${chosen}")`,
      code === 0 && sameFolder(chosen, dest),
    );
  } else {
    await page.fill("[data-testid=destination-input]", dest);
    destOk = true;
  }

  // 3. One date, with an event name.
  await card4.locator("[data-testid=event-name]").fill("Caz vs Wheatfield");
  const preview = await card4.locator("[data-testid=folder-preview]").textContent();
  check(
    'the card shows the folder name "2026-10-04 - Caz vs Wheatfield"',
    /2026-10-04 - Caz vs Wheatfield/.test(preview || ""),
    preview,
  );
  await card4.locator("[data-testid=create-folder]").click();
  const one = await waitForCopy(page);
  await shot(page, "08-copied-one-date");
  const oct4 = path.join(dest, "2026-10-04 - Caz vs Wheatfield");
  const oct4Files = fs.existsSync(oct4) ? fs.readdirSync(oct4).sort() : [];
  const oneOk =
    check(
      'Create folder made "2026-10-04 - Caz vs Wheatfield" and copied its 7 photos',
      one.error === null && one.copied === 7 && oct4Files.length === 7,
      JSON.stringify({ one, oct4Files }),
    ) &
    check(
      "the card says what happened: 7 copied, 0 already there",
      /7 copied · 0 already there/.test(
        (await card4.locator("[data-testid=card-result]").textContent()) || "",
      ),
    );

  // 3b. The page loses DateSort mid-copy (a laptop that went to sleep): it
  //     must say so in plain words and say how to finish, not show jargon.
  await page.route("**/api/copy", (r) => r.abort("connectionreset"));
  await page.click("[data-testid=copy-all]");
  const lost = await waitForCopy(page);
  await page.unroute("**/api/copy");
  check(
    "a copy cut off (e.g. by sleep) says so plainly and to press the button again",
    /lost touch with this page/.test(lost.error || "") &&
      /Press the button again to finish the rest/.test(lost.error || ""),
    lost.error,
  );

  // 4. Copy all dates.
  await page.click("[data-testid=copy-all]");
  // Do not read 3b's message as this copy's answer.
  await page.waitForFunction(
    () =>
      !/lost touch/.test(
        document.querySelector("[data-testid=copy-error]")?.textContent || "",
      ),
  );
  const all = await waitForCopy(page);
  await shot(page, "09-copied-all");
  const folders = fs.readdirSync(dest).sort();
  const want = [
    "2018-02-21",
    "2026-10-03",
    "2026-10-04 - Caz vs Wheatfield",
    "2026-10-05",
    "2026-10-06",
  ];
  const allOk =
    check(
      `Copy all made one folder per date: ${want.join(", ")}`,
      JSON.stringify(folders) === JSON.stringify(want),
      JSON.stringify(folders),
    ) &
    check(
      "Copy all: 10 more copied, the 7 from before already there, 1 different file left alone",
      all.copied === 10 && all.already === 7 && all.conflicts === 1 && all.failed === 0,
      JSON.stringify(all),
    );

  // Every copy is byte-for-byte its original, with the original's modified date.
  let exact = 0;
  const mismatched = [];
  const byDay = {
    "2018-02-21": ["DCIM/101CANON/IMG_0100.CR3"],
    "2026-10-03": [
      "DCIM/100CANON/IMG_0001.JPG",
      "DCIM/100CANON/IMG_0002.JPG",
      "DCIM/100CANON/IMG_0003.JPG",
      "Edited/IMG_0010.CR3",
    ],
    "2026-10-04 - Caz vs Wheatfield": [
      "DCIM/100CANON/IMG_0004.JPG",
      "DCIM/100CANON/IMG_0004.CR3",
      "DCIM/100CANON/IMG_0005.CR2",
      "DCIM/100CANON/IMG_0006.JPG",
      "DCIM/100CANON/IMG_0007.jpeg",
      "Phone/IMG_7000.HEIC",
      "Edited/team.png",
    ],
    "2026-10-05": [
      "DCIM/100CANON/IMG_0008.JPG",
      "DCIM/100CANON/IMG_0009.JPG",
      "DCIM/100CANON/IMG_0009.CR3",
      "Phone/IMG_7001.HEIC",
      "Edited/crop.jpg",
    ],
  };
  for (const [folder, sources] of Object.entries(byDay)) {
    for (const rel of sources) {
      const src = path.join(card, ...rel.split("/"));
      const cp = path.join(dest, folder, path.basename(rel));
      const ok =
        fs.existsSync(cp) &&
        sha(cp) === sha(src) &&
        Math.abs(fs.statSync(cp).mtimeMs - fs.statSync(src).mtimeMs) < 2000;
      if (ok) exact += 1;
      else mismatched.push(`${folder}/${path.basename(rel)}`);
    }
  }
  const exactOk = check(
    `all ${exact} copies checked are identical to their originals, with the originals' dates`,
    mismatched.length === 0 && exact === 17,
    mismatched.join(", "),
  );
  const keptOk = check(
    "the different file already in 2026-10-06 was left exactly as it was",
    fs.readFileSync(path.join(dest, "2026-10-06", "IMG_ROOT.JPG"), "utf8") ===
      "not the same photo",
  );
  const noPartials = check(
    "no half-written files anywhere in the destination",
    !walk(dest).some((f) => f.endsWith(".datesort-partial")),
  );

  // 5. Again: nothing to do, nothing changes.
  const destBefore = fingerprint(dest);
  await page.click("[data-testid=copy-all]");
  const again = await waitForCopy(page);
  const againOk =
    check(
      "copying again copies nothing: all 17 already there",
      again.copied === 0 && again.already === 17,
      JSON.stringify(again),
    ) &
    check(
      "copying again changes nothing in the destination",
      differences(destBefore, fingerprint(dest)).length === 0,
    );

  // 6. The originals.
  const diff = differences(sourceBefore, fingerprint(card));
  results.folders.push({
    label: "Copy: source folder",
    folder: card,
    filesFingerprinted: sourceBefore.size,
    filesAltered: diff.length,
  });
  const untouched = check(
    `copying changed nothing in the source folder (${sourceBefore.size} files fingerprinted)`,
    diff.length === 0,
    diff.slice(0, 5).join("; "),
  );

  // 7. The destination is remembered.
  await page.reload();
  await page.fill("[data-testid=source-input]", card);
  await page.click("[data-testid=scan-button]");
  await page.waitForSelector("[data-testid=scan-report]", { timeout: 900_000 });
  await page
    .waitForFunction(
      () => document.querySelector("[data-testid=destination-input]")?.value !== "",
      null,
      { timeout: 10_000 },
    )
    .catch(() => undefined);
  const remembered = await page.inputValue("[data-testid=destination-input]");
  const rememberedOk = check(
    `the destination is remembered after a restart of the page ("${remembered}")`,
    sameFolder(remembered, dest),
  );

  // 8. A name (or a sport) added to a date that is already copied renames
  //    its folder; it never makes a second folder with a second copy.
  const card3 = page.locator("[data-testid=date-card][data-day='2026-10-03']");
  await card3.locator("[data-testid=event-name]").fill("Basketball");
  await card3.locator("[data-testid=create-folder]").click();
  const named = await waitForCopy(page);
  const renamedNote = await card3
    .locator("[data-testid=card-renamed]")
    .textContent()
    .catch(() => "");
  const renameOk = check(
    'adding "Basketball" to a copied date renames its folder; nothing is copied twice',
    named.error === null &&
      named.copied === 0 &&
      fs.existsSync(path.join(dest, "2026-10-03 - Basketball")) &&
      named.already > 0 &&
      named.already ===
        fs.readdirSync(path.join(dest, "2026-10-03 - Basketball")).length &&
      !fs.existsSync(path.join(dest, "2026-10-03")) &&
      /renamed from .2026-10-03./.test(renamedNote || ""),
    JSON.stringify({ named, renamedNote, folders: fs.readdirSync(dest) }),
  );
  // Leave no remembered name behind for the next run.
  await card3.locator("[data-testid=event-name]").fill("");
  await card3.locator("[data-testid=event-name]").blur();
  await page.waitForTimeout(500);

  verdict("Create folder (one date, with event name)", oneOk, destOk);
  verdict("Name added after copying renames the folder", renameOk);
  verdict("Copy all dates", allOk);
  verdict("Copies identical to originals", exactOk, noPartials);
  verdict("Never overwrites", keptOk, againOk);
  verdict("Originals untouched by copying", untouched);
  verdict("Destination remembered", rememberedOk);
}

// ---------------------------------------------------------------------------
// Driving the page
// ---------------------------------------------------------------------------

async function num(page, id) {
  const t = await page.textContent(`[data-testid=stat-${id}]`);
  return Number((t || "").replace(/[^0-9]/g, ""));
}

async function readReport(page) {
  const out = {};
  for (const id of [
    "total",
    "photos",
    "jpeg",
    "png",
    "heic",
    "cr2",
    "cr3",
    "unsupported",
    "dates",
    "camera",
    "estimated",
    "undated",
  ]) {
    out[id] = await num(page, id);
  }
  out.earliest = (await page.textContent("[data-testid=earliest]")) || "";
  out.latest = (await page.textContent("[data-testid=latest]")) || "";
  out.days = await page.$$eval("[data-testid=date-card]", (cards) =>
    cards.map((c) => {
      const col = (k) => (c.querySelector(`[data-col=${k}]`)?.textContent || "").trim();
      const n = (k) => Number(col(k).replace(/[^0-9]/g, ""));
      return {
        day: c.getAttribute("data-day"),
        title: (c.querySelector("h3")?.textContent || "").trim(),
        photos: n("photos"),
        // Every card shows all five counts; summarised here as "3 JPG · 1 CR3"
        // (non-zero only) to compare, and the five cells are checked present.
        formatCells: [...c.querySelectorAll("[data-format]")].map((e) =>
          e.getAttribute("data-format"),
        ),
        formats: [...c.querySelectorAll("[data-format]")]
          .map((e) => [
            e.getAttribute("data-format"),
            Number(e.querySelector("dd").textContent.replace(/[^0-9]/g, "")),
          ])
          .filter(([, n]) => n > 0)
          .map(([f, n]) => `${n} ${f === "jpeg" ? "JPG" : f.toUpperCase()}`)
          .join(" · "),
        first: col("first")
          .replace(/Estimated date/i, "")
          .trim(),
        last: col("last")
          .replace(/Estimated date/i, "")
          .trim(),
        firstIsEstimate: /Estimated date/i.test(col("first")),
        lastIsEstimate: /Estimated date/i.test(col("last")),
        camera: n("camera"),
        estimated: n("estimated"),
      };
    }),
  );
  return out;
}

async function scan(page, folder, includeSubfolders, { fill = true } = {}) {
  if (fill) await page.fill("[data-testid=source-input]", folder);
  const box = page.locator("[data-testid=include-subfolders]");
  if ((await box.isChecked()) !== includeSubfolders) await box.click();
  await page.click("[data-testid=scan-button]");
  await page.waitForSelector("[data-testid=scan-report], [data-testid=scan-error]", {
    timeout: 900_000,
  });
  const err = await page.$("[data-testid=scan-error]");
  if (err) throw new Error(`scan error: ${await err.textContent()}`);
  return readReport(page);
}

/** Scan a folder with fingerprints taken before and after. */
async function scanWatched(page, folder, includeSubfolders, label, opts) {
  const before = fingerprint(folder);
  const t0 = Date.now();
  const report = await scan(page, folder, includeSubfolders, opts);
  const seconds = (Date.now() - t0) / 1000;
  const after = fingerprint(folder);
  const diff = differences(before, after);
  check(
    `${label}: no file changed, renamed, deleted or added (${before.size} fingerprinted)`,
    diff.length === 0,
    diff.slice(0, 5).join("; "),
  );
  results.folders.push({
    label,
    folder,
    includeSubfolders,
    filesFingerprinted: before.size,
    filesAltered: diff.length,
    seconds,
  });
  return { report, diff, seconds, fingerprinted: before.size };
}

// An independent count of what is in a folder, from the bytes, written
// separately from DateSort's code so the two can disagree.
function independentCount(folder) {
  let total = 0;
  let photos = 0;
  for (const file of walk(folder)) {
    total += 1;
    let head = Buffer.alloc(0);
    try {
      const fd = fs.openSync(file, "r");
      head = Buffer.alloc(12);
      const n = fs.readSync(fd, head, 0, 12, 0);
      head = head.subarray(0, n);
      fs.closeSync(fd);
    } catch {
      continue;
    }
    const s = (a, b) => head.subarray(a, b).toString("latin1");
    const jpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    const png = head
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const tiff = s(0, 4) === "II*\0" || s(0, 4) === "MM\0*";
    const cr2 = tiff && s(8, 10) === "CR";
    const iso = s(4, 8) === "ftyp";
    const cr3 = iso && s(8, 12) === "crx ";
    const heic =
      iso &&
      ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(
        s(8, 12),
      );
    const base = path.basename(file).toLowerCase();
    const system =
      ["thumbs.db", "desktop.ini", ".ds_store", "ehthumbs.db"].includes(base) ||
      base.startsWith("._");
    if (!system && (jpeg || png || cr2 || cr3 || heic)) photos += 1;
  }
  return { total, photos };
}

async function startFromConsole(browser) {
  const page = await browser.newPage();
  await page.goto(CONSOLE, { timeout: 120_000 });
  const button = page.getByRole("button", { name: /^(Start|Restart) DateSort$/ });
  check("the console shows a Start DateSort button", (await button.count()) === 1);
  const t0 = Date.now();
  await button.click();
  await page.waitForFunction(
    () =>
      /Open it at http:\/\/localhost:4604|did not start/.test(document.body.innerText),
    null,
    { timeout: 900_000 },
  );
  const body = await page.textContent("body");
  results.consoleLaunchSeconds = Math.round((Date.now() - t0) / 1000);
  const started = body.includes("Open it at http://localhost:4604");
  check(
    `pressing Start DateSort built and started it (${results.consoleLaunchSeconds} s)`,
    started,
    body.slice(0, 600),
  );
  await shot(page, "00-console-started");
  const health = await fetch(`${BASE}/api/health`)
    .then((r) => r.status)
    .catch((e) => String(e));
  check("DateSort answers on port 4604", health === 200, String(health));
  results.consoleLaunch = started && health === 200;
  verdict("Control Center Start button", started, health === 200);
  await page.close();
}

/** Press Browse; on Windows, choose `folder` in the real Windows folder window. */
function sameFolder(a, b) {
  try {
    return (
      fs.realpathSync.native(a).toLowerCase() ===
      fs.realpathSync.native(b).toLowerCase()
    );
  } catch {
    return false;
  }
}

/** Press a Browse button and choose `folder` in the real Windows folder window. */
async function driveDialog(page, folder, inputSel, buttonSel, title) {
  await page.fill(inputSel, "");
  const driver = spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      path.join(__dirname, "pick-folder-in-dialog.ps1"),
      "-Title",
      title,
      "-Folder",
      folder,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let log = "";
  driver.stdout.on("data", (d) => (log += d));
  driver.stderr.on("data", (d) => (log += d));
  const driven = new Promise((resolve) => driver.on("exit", resolve));
  await page.click(buttonSel);
  const code = await driven;
  for (const line of log.trim().split(/\r?\n/)) console.log(`  ..    ${line}`);
  await page
    .waitForFunction((sel) => document.querySelector(sel)?.value !== "", inputSel, {
      timeout: 30_000,
    })
    .catch(() => undefined);
  return { code, chosen: await page.inputValue(inputSel) };
}

async function browse(page, folder) {
  if (!WINDOWS) {
    await page.click("[data-testid=browse-button]");
    await page.waitForSelector("[data-testid=browse-note]");
    const note = await page.textContent("[data-testid=browse-note]");
    check(
      "Browse: off Windows it says to type the path (the window is a Windows feature)",
      /Windows feature/.test(note || ""),
      note,
    );
    results.browse = "not tested: not Windows";
    return false;
  }
  const { code, chosen } = await driveDialog(
    page,
    folder,
    "[data-testid=source-input]",
    "[data-testid=browse-button]",
    PICKER_TITLE,
  );
  const ok = code === 0 && sameFolder(chosen, folder);
  check(
    `Browse: the Windows folder window opened and its choice filled the folder box ("${chosen}")`,
    ok,
    `driver exit ${code}`,
  );
  results.browse = ok ? "PASS" : "FAIL";
  verdict("Folder Browse", ok);
  return ok;
}

async function refusals() {
  const evil = await fetch(`${BASE}/api/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://evil.example" },
    body: JSON.stringify({ folder: os.tmpdir(), includeSubfolders: false }),
  }).then((r) => r.status);
  check(
    "another website cannot make DateSort scan a folder",
    evil === 403,
    String(evil),
  );
  const form = await fetch(`${BASE}/api/scan`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ folder: os.tmpdir(), includeSubfolders: false }),
  }).then((r) => r.status);
  check("a plain form post is refused (JSON only)", form === 415, String(form));
  const browseEvil = await fetch(`${BASE}/api/browse`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://evil.example" },
    body: "{}",
  }).then((r) => r.status);
  check(
    "another website cannot open DateSort's folder window",
    browseEvil === 403,
    String(browseEvil),
  );
}

(async () => {
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch {
    const npm = WINDOWS ? "npm.cmd" : "npm";
    const root = execFileSync(npm, ["root", "-g"], { shell: WINDOWS })
      .toString()
      .trim();
    ({ chromium } = require(path.join(root, "playwright")));
  }
  const linuxDefault = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  const executablePath =
    process.env.CHROMIUM_PATH ||
    (fs.existsSync(linuxDefault) ? linuxDefault : undefined);
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  results.platform = `${process.platform} ${os.release()} · Node ${process.version}`;
  console.log(`Platform: ${results.platform}`);

  if (CONSOLE !== null) {
    console.log("\nStart DateSort from the Development Control Center");
    await startFromConsole(browser);
  }

  const health = await fetch(`${BASE}/api/health`)
    .then((r) => r.json())
    .catch(() => null);
  check(
    "DateSort is running and healthy",
    health !== null && health.app === "date-sort",
    JSON.stringify(health),
  );
  results.healthy = health !== null && health.app === "date-sort";

  const page = await browser.newPage();
  page.on("pageerror", (e) => check("no error in the page", false, e.message));
  await page.goto(BASE);
  await page.waitForSelector("[data-testid=read-only-note]");
  await shot(page, "01-start");

  // The camera card
  console.log("\nCamera-card folder");
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "datesort-test-"));
  const card = path.join(work, "Canon card");
  fs.mkdirSync(card);
  await buildCard(card);

  const browsed = await browse(page, card);
  await shot(page, "02-browsed");

  const top = await scanWatched(page, card, false, "Camera card, subfolders off", {
    fill: !browsed,
  });
  await shot(page, "03-top-only");
  const topOk =
    check(
      "subfolders off: only the 2 files in the top folder are scanned",
      top.report.total === 2,
      `got ${top.report.total}`,
    ) &
    check(
      "subfolders off: 1 photo, on 1 date (October 6)",
      top.report.photos === 1 &&
        top.report.days.map((d) => d.day).join() === "2026-10-06",
      JSON.stringify(top.report.days),
    );

  const full = await scanWatched(page, card, true, "Camera card, subfolders on", {
    fill: !browsed,
  });
  await shot(page, "04-full");
  const r = full.report;
  const e = CARD_EXPECTED;
  const subOk = check(
    `subfolders on: all ${e.total} files are scanned`,
    r.total === e.total,
    `got ${r.total}`,
  );
  verdict("Include subfolders", topOk, subOk);
  check(`${e.photos} photos`, r.photos === e.photos, `got ${r.photos}`);
  verdict(
    "JPG/JPEG detection",
    check(
      `${e.jpeg} JPG/JPEG (.JPG and .jpeg counted together)`,
      r.jpeg === e.jpeg,
      `got ${r.jpeg}`,
    ),
  );
  check(`${e.png} PNG`, r.png === e.png, `got ${r.png}`);
  verdict(
    "HEIC detection",
    check(`${e.heic} HEIC`, r.heic === e.heic, `got ${r.heic}`),
  );
  verdict("CR2 detection", check(`${e.cr2} CR2`, r.cr2 === e.cr2, `got ${r.cr2}`));
  verdict("CR3 detection", check(`${e.cr3} CR3`, r.cr3 === e.cr3, `got ${r.cr3}`));
  check(
    `${e.unsupported} files that are not photos`,
    r.unsupported === e.unsupported,
    `got ${r.unsupported}`,
  );
  const datesOk =
    check(
      `${e.days.length} shooting dates`,
      r.dates === e.days.length,
      `got ${r.dates}`,
    ) &
    check(
      `date cards: ${e.days.map((d) => d.day).join(", ")}`,
      JSON.stringify(r.days.map((d) => d.day)) ===
        JSON.stringify(e.days.map((d) => d.day)),
      JSON.stringify(r.days.map((d) => d.day)),
    );
  let cardsOk = true;
  for (const want of e.days) {
    const got = r.days.find((d) => d.day === want.day);
    const ok =
      got !== undefined &&
      got.photos === want.photos &&
      got.camera === want.camera &&
      got.estimated === want.estimated &&
      got.first === want.first &&
      got.last === want.last &&
      got.formats === want.formats &&
      got.formatCells.join() === "jpeg,png,heic,cr2,cr3" &&
      got.lastIsEstimate === Boolean(want.lastIsEstimate);
    cardsOk =
      check(
        `${want.day}: ${want.photos} photos (${want.formats}), ${want.first}–${want.last}, ${want.camera} camera / ${want.estimated} estimated`,
        ok,
        JSON.stringify(got),
      ) && cardsOk;
  }
  check(
    'the October 4 card is titled "October 4, 2026"',
    r.days.find((d) => d.day === "2026-10-04")?.title.toLowerCase() ===
      "october 4, 2026",
  );
  verdict("Date grouping", datesOk, cardsOk);
  const estOk =
    check(
      `${e.camera} camera dates and ${e.estimated} estimated dates`,
      r.camera === e.camera && r.estimated === e.estimated,
      `got ${r.camera} / ${r.estimated}`,
    ) &
    check(
      'an estimated last photo on October 5 is labelled "Estimated date"',
      r.days.find((d) => d.day === "2026-10-05")?.lastIsEstimate === true,
    );
  await page.click("text=/Show the .* with an estimated date/");
  const estimatedRows = await page.$$eval("[data-testid=estimated-list] li", (lis) =>
    lis.map((l) => l.textContent),
  );
  const listOk = check(
    "the estimated list names exactly the 3 photos with no camera date, each labelled",
    estimatedRows.length === 3 &&
      ["IMG_7001.HEIC", "crop.jpg", "IMG_0010.CR3"].every((n) =>
        estimatedRows.some((row) => row.includes(n) && /Estimated date/.test(row)),
      ),
    JSON.stringify(estimatedRows),
  );
  verdict("Estimated-date labeling", estOk, listOk);
  check(
    "EXIF DateTime (edit time: Christmas) is never used as Date Taken",
    !r.days.some((d) => d.day === "2026-12-25"),
  );
  check(
    "earliest photo is the real Canon EOS M50 CR3 (February 21, 2018)",
    /February 21, 2018, 12:08 PM/.test(r.earliest),
    r.earliest,
  );
  await shot(page, "05-estimated");

  // Create folders and copy (Step 3)
  console.log("\nCreate folders and copy photos");
  await copyChecks(page, card, work);

  console.log("\nSport suggestions (Claude key)");
  await sportChecks(page, browser);

  // A refreshed page, and a copy whose connection goes silent (as after the
  // CEO's laptop slept: the bar froze with no message, and a refresh then
  // cost a whole new scan).
  console.log("\nRefreshing the page, and a copy that goes silent");
  const fresh = await browser.newPage();
  await fresh.clock.install();
  await fresh.goto(BASE);
  const restored = await fresh
    .waitForSelector("[data-testid=date-card][data-day='2026-10-04']", {
      timeout: 15_000,
    })
    .then(() => true)
    .catch(() => false);
  check("a refreshed page shows the last scan again, without scanning again", restored);
  // The event name typed before the refresh must come back: a forgotten name
  // once made a second, plain date folder holding a second copy of every photo.
  // The names arrive from the settings a moment after the cards: wait for them.
  if (restored) {
    await fresh
      .waitForFunction(
        () =>
          document.querySelector(
            "[data-testid=date-card][data-day='2026-10-04'] [data-testid=event-name]",
          )?.value !== "",
        null,
        { timeout: 5_000 },
      )
      .catch(() => undefined);
  }
  const keptName = restored
    ? await fresh
        .locator(
          "[data-testid=date-card][data-day='2026-10-04'] [data-testid=event-name]",
        )
        .inputValue()
        .catch(() => "")
    : "";
  check(
    "a refreshed page still has the event name typed on the card",
    keptName === "Caz vs Wheatfield",
    keptName,
  );
  if (restored) {
    fresh.on("dialog", (d) => void d.accept());
    // The request is sent and then nothing ever comes back: no error, no data.
    // The clock may only jump once the request is out: the page starts
    // watching just before it sends, and a jump before that proves nothing.
    // Saving settings is made slow, as on a slow machine, so this test cannot
    // pass by luck (it once did on Linux and failed on Windows).
    await fresh.route("**/api/settings", async (r) => {
      await new Promise((res) => setTimeout(res, 2_000));
      await r.continue();
    });
    let sent;
    const requestSent = new Promise((r) => (sent = r));
    await fresh.route("**/api/copy", () => sent());
    await fresh.fill("[data-testid=destination-input]", work);
    await fresh.click("[data-testid=copy-all]");
    await requestSent;
    await fresh.clock.fastForward(40_000);
    const said = await fresh
      .waitForSelector("[data-testid=copy-error]", { timeout: 15_000 })
      .then((e) => e.textContent())
      .catch(() => null);
    check(
      "a copy that goes silent says DateSort lost touch, instead of freezing",
      /lost touch with this page/.test(said || ""),
      said,
    );
    await shot(fresh, "09b-copy-went-silent");
  }
  await fresh.close();

  // CR3 Date Taken
  // An iPhone-style folder: videos (MOV, MP4) and a HEIC photo. Videos are
  // dated by the phone's own clock and can be copied on their own.
  console.log("\niPhone-style folder: videos");
  const phone = path.join(work, "iPhone", "DCIM", "100APPLE");
  fs.mkdirSync(phone, { recursive: true });
  for (const [from, to] of [
    ["iphone-style.mov", "IMG_0042.MOV"],
    ["header-only.mp4", "IMG_0043.MP4"],
    ["heic-all-three-differ.heic", "IMG_0044.HEIC"],
  ]) {
    fs.copyFileSync(path.join(FIXTURES, from), path.join(phone, to));
  }
  const phoneScan = (
    await scanWatched(page, path.join(work, "iPhone"), true, "iPhone-style folder")
  ).report;
  const headline = await page.textContent("[data-testid=headline]");
  const oct24 = phoneScan.days.find((d) => d.day === "2026-10-24");
  const videoDates = check(
    "videos are counted and put on the day the phone filmed them (23:41 on Oct 24, not the next day in UTC)",
    /1 photo · 2 videos/.test(headline || "") &&
      oct24 !== undefined &&
      oct24.first === "11:41 PM",
    JSON.stringify({
      headline,
      days: phoneScan.days.map((d) => `${d.day} ${d.first}`),
    }),
  );
  const hockey = path.join(work, "Seagate", "Hockey Videos");
  fs.mkdirSync(hockey, { recursive: true });
  await page.click("[data-testid=copy-only-videos]");
  await page.fill("[data-testid=destination-input]", hockey);
  await page.click("[data-testid=copy-all]");
  const vc = await waitForCopy(page);
  const copiedVideos = walk(hockey)
    .map((f) => path.relative(hockey, f).replace(/\\/g, "/"))
    .sort();
  const onlyVideos = check(
    "Videos only copies just the videos, each into its date folder in Hockey Videos",
    vc.error === null &&
      copiedVideos.length === 2 &&
      copiedVideos.every((f) => /\.(MOV|MP4)$/.test(f)) &&
      copiedVideos.includes("2026-10-24/IMG_0042.MOV") &&
      !copiedVideos.some((f) => f.endsWith(".HEIC")),
    JSON.stringify({ vc, copiedVideos }),
  );
  verdict("Videos (iPhone MOV, MP4)", videoDates, onlyVideos);

  console.log(
    "\nBring in from iPhone (an iPhone-like folder through the same Windows calls)",
  );
  await iphoneChecks(page, work);

  console.log("\nCR3-only folder");
  const cr3Dir = path.join(work, "CR3 only");
  fs.mkdirSync(cr3Dir);
  await buildCr3Only(cr3Dir);
  const c = (await scanWatched(page, cr3Dir, false, "CR3-only folder")).report;
  await shot(page, "06-cr3");
  const cr3Days = c.days
    .map((d) => `${d.day}:${d.photos}:${d.camera}:${d.estimated}`)
    .join(" ");
  verdict(
    "CR3 Date Taken reading",
    check(
      "4 CR3 files, 3 dated by the camera, 1 estimated",
      c.cr3 === 4 && c.camera === 3 && c.estimated === 1,
      JSON.stringify({ cr3: c.cr3, camera: c.camera, estimated: c.estimated }),
    ),
    check(
      "real Canon EOS M50 CR3 dated February 21, 2018 12:08 PM from its metadata; DateTimeOriginal (Oct 4 1:03 PM) beats CreateDate; CreateDate (Oct 5 7:30 PM) used when it is all there is; ModifyDate alone is estimated",
      cr3Days ===
        "2018-02-21:1:1:0 2026-10-04:1:1:0 2026-10-05:1:1:0 2026-10-07:1:0:1" &&
        c.days[1].first === "1:03 PM" &&
        c.days[2].first === "7:30 PM" &&
        c.days[3].firstIsEstimate === true,
      cr3Days,
    ),
  );

  // Real folders
  for (const folder of REAL) {
    if (!fs.existsSync(folder)) {
      console.log(`\n  SKIP  ${folder} does not exist here`);
      continue;
    }
    console.log(`\nReal folder: ${folder}`);
    const truth = independentCount(folder);
    const real = await scanWatched(page, folder, true, folder);
    check(
      `${folder}: ${real.report.total} files, as counted independently (${truth.total})`,
      real.report.total === truth.total,
    );
    check(
      `${folder}: ${real.report.photos} photos, as counted independently (${truth.photos})`,
      real.report.photos === truth.photos,
    );
    console.log(
      `  ..    ${real.report.dates} shooting dates; ${real.report.camera} camera-dated, ${real.report.estimated} estimated; ${real.seconds.toFixed(1)} s`,
    );
    await shot(page, `07-real-${path.basename(folder)}`);
  }

  console.log("\nSafety");
  await refusals();
  const altered = results.folders.reduce((n, f) => n + f.filesAltered, 0);
  results.sourceFilesAltered = altered;
  results.sourceFilesFingerprinted = results.folders.reduce(
    (n, f) => n + f.filesFingerprinted,
    0,
  );
  check(`source files altered across every scan: ${altered}`, altered === 0);

  await browser.close();
  fs.rmSync(work, { recursive: true, force: true });
  results.failures = failures;
  results.checks = checks;
  if (process.env.DATESORT_REPORT)
    fs.writeFileSync(process.env.DATESORT_REPORT, JSON.stringify(results, null, 2));
  console.log(
    failures === 0
      ? `\nALL ${checks} CHECKS PASSED`
      : `\n${failures} OF ${checks} CHECK(S) FAILED`,
  );
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  results.failures = (results.failures || 0) + 1;
  results.crashed = String(e && e.stack ? e.stack : e);
  if (process.env.DATESORT_REPORT)
    fs.writeFileSync(process.env.DATESORT_REPORT, JSON.stringify(results, null, 2));
  process.exit(1);
});
