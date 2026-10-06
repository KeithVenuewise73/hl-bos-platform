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
        formats: col("formats"),
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
  await page.fill("[data-testid=source-input]", "");
  const driver = spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      path.join(__dirname, "pick-folder-in-dialog.ps1"),
      "-Title",
      PICKER_TITLE,
      "-Folder",
      folder,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let log = "";
  driver.stdout.on("data", (d) => (log += d));
  driver.stderr.on("data", (d) => (log += d));
  const driven = new Promise((resolve) => driver.on("exit", resolve));
  await page.click("[data-testid=browse-button]");
  const code = await driven;
  for (const line of log.trim().split(/\r?\n/)) console.log(`  ..    ${line}`);
  await page
    .waitForFunction(
      () => document.querySelector("[data-testid=source-input]")?.value !== "",
      null,
      { timeout: 30_000 },
    )
    .catch(() => undefined);
  const chosen = await page.inputValue("[data-testid=source-input]");
  const same = (a, b) => {
    try {
      return (
        fs.realpathSync.native(a).toLowerCase() ===
        fs.realpathSync.native(b).toLowerCase()
      );
    } catch {
      return false;
    }
  };
  const ok = code === 0 && same(chosen, folder);
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

  // CR3 Date Taken
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
