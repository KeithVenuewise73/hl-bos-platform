/**
 * Proves JerseySort's Check Folder in a real browser, on whatever operating
 * system this runs on (it is run on Windows in CI):
 *
 *   1. Optionally starts JerseySort the way the CEO does: open the
 *      Development Control Center and press "Start JerseySort AI".
 *   2. Builds a camera-card-shaped folder (DCIM/100CANON, three game days,
 *      Canon RAW .CR2/.CR3, photos with no camera date, junk files) and
 *      checks it, asserting every number on the report.
 *   3. Checks any REAL folders named in JERSEYSORT_REAL_FOLDERS (e.g. the
 *      wallpapers Windows ships in C:\Windows\Web), asserting the counts
 *      against an independent count made here.
 *   4. For every folder: fingerprints every file (name, size, modified time,
 *      SHA-256) before and after, and fails on ANY difference — a changed,
 *      renamed, deleted or added file. Also fails if the page sent anything
 *      to the server while checking, or if JerseySort stored any photo.
 *
 * The camera-card photos are GENERATED (sharp writes Canon-style EXIF), and
 * the .CR2/.CR3 files carry real Canon RAW signatures but no image: this
 * proves detection and dating logic, not a particular Canon body's files.
 *
 * Usage:
 *   node scripts/local-test/verify-folder-check.cjs http://127.0.0.1:4603
 *     [--console http://localhost:4000]   start JerseySort from the console first
 *   env: JERSEYSORT_REAL_FOLDERS  folders to check too (path-delimiter separated)
 *        JERSEYSORT_DATA_DIR      JerseySort's data folder (default: the app's)
 *        CHROMIUM_PATH            browser to use (default: Playwright's own)
 *        JERSEYSORT_SCREENSHOTS   folder to save screenshots in
 *        JERSEYSORT_REPORT        file to write a JSON summary to
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const args = process.argv.slice(2);
const BASE = (args.find((a) => /^https?:/.test(a)) || "http://127.0.0.1:4603").replace(
  /\/$/,
  "",
);
const consoleAt = args.indexOf("--console");
const CONSOLE =
  consoleAt === -1 ? null : (args[consoleAt + 1] || "").replace(/\/$/, "");
const REPO = path.resolve(__dirname, "../..");
const DATA_DIR =
  process.env.JERSEYSORT_DATA_DIR ||
  path.join(REPO, "apps", "jersey-sort", ".jersey-sort");
const SHOTS = process.env.JERSEYSORT_SCREENSHOTS || null;
const REAL = (process.env.JERSEYSORT_REAL_FOLDERS || "")
  .split(path.delimiter)
  .map((s) => s.trim())
  .filter((s) => s.length > 0);
const sharp = require(path.join(REPO, "apps", "jersey-sort", "node_modules", "sharp"));

let failures = 0;
const results = {};
function check(name, condition, detail) {
  if (condition) console.log(`  OK    ${name}`);
  else {
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    failures += 1;
  }
  return Boolean(condition);
}
async function shot(page, name) {
  if (SHOTS === null) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

// ---------------------------------------------------------------------------
// Fingerprinting: the proof that nothing in a folder changed
// ---------------------------------------------------------------------------

function walk(dir, base = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function fingerprint(dir) {
  const map = new Map();
  for (const file of walk(dir)) {
    const st = fs.statSync(file);
    const hash = crypto
      .createHash("sha256")
      .update(fs.readFileSync(file))
      .digest("hex");
    map.set(path.relative(dir, file), `${st.size}|${st.mtimeMs}|${hash}`);
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

function storedPhotos() {
  let n = 0;
  for (const sub of ["originals", "thumbnails", "previews"]) {
    const dir = path.join(DATA_DIR, sub);
    if (fs.existsSync(dir)) n += walk(dir).length;
  }
  return n;
}

// ---------------------------------------------------------------------------
// The camera card
// ---------------------------------------------------------------------------

async function cameraJpeg(file, when, color) {
  const exifDate = when.replace(/-/g, ":").replace("T", " ");
  const buf = await sharp({
    create: { width: 320, height: 240, channels: 3, background: color },
  })
    .jpeg({ quality: 80 })
    .withExif({
      IFD0: { Make: "Canon", Model: "Canon EOS R6" },
      IFD2: { DateTimeOriginal: exifDate },
    })
    .toBuffer();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
}

function setModified(file, y, mo, d, h, mi) {
  const t = new Date(y, mo - 1, d, h, mi, 0);
  fs.utimesSync(file, t, t);
}

function writeWith(file, bytes, size) {
  const buf = Buffer.alloc(size);
  Buffer.from(bytes).copy(buf);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
}

async function buildCard(root) {
  const dcim = path.join(root, "DCIM");
  const shots = [
    ["100CANON/IMG_0001.JPG", "2026-10-03T18:01:00"],
    ["100CANON/IMG_0002.JPG", "2026-10-03T18:30:00"],
    ["100CANON/IMG_0003.JPG", "2026-10-03T19:45:00"],
    ["100CANON/IMG_0004.JPG", "2026-10-03T20:44:10"],
    ["100CANON/IMG_0005.JPG", "2026-10-04T10:00:00"],
    ["100CANON/IMG_0006.JPG", "2026-10-04T11:15:00"],
    ["100CANON/IMG_0007.JPG", "2026-10-04T12:30:00"],
    ["101CANON/IMG_0008.JPG", "2026-10-05T09:15:00"],
    ["101CANON/IMG_0009.JPG", "2026-10-05T09:40:00"],
    ["101CANON/IMG_0010.jpeg", "2026-10-05T09:20:00"],
  ];
  let i = 0;
  for (const [name, when] of shots) {
    await cameraJpeg(path.join(dcim, name), when, i++ % 2 ? "#1e3a8a" : "#7f1d1d");
  }
  // Canon RAW: real signatures, no image. Dated by their file time.
  const cr3 = [0, 0, 0, 0x18, ...Buffer.from("ftypcrx "), 0, 0, 0, 1];
  writeWith(path.join(dcim, "100CANON/IMG_0001.CR3"), cr3, 200_000);
  setModified(path.join(dcim, "100CANON/IMG_0001.CR3"), 2026, 10, 3, 18, 1);
  writeWith(path.join(dcim, "100CANON/IMG_0002.CR3"), cr3, 200_000);
  setModified(path.join(dcim, "100CANON/IMG_0002.CR3"), 2026, 10, 3, 18, 30);
  const cr2 = [0x49, 0x49, 0x2a, 0x00, 0x10, 0, 0, 0, 0x43, 0x52, 2, 0];
  writeWith(path.join(dcim, "100CANON/IMG_0005.CR2"), cr2, 150_000);
  setModified(path.join(dcim, "100CANON/IMG_0005.CR2"), 2026, 10, 4, 10, 0);

  // Photos with NO camera date: their date must be shown as an estimate.
  const png = await sharp({
    create: { width: 200, height: 120, channels: 3, background: "#14532d" },
  })
    .png()
    .toBuffer();
  fs.mkdirSync(path.join(root, "Edited"), { recursive: true });
  fs.writeFileSync(path.join(root, "Edited", "team-photo.png"), png);
  setModified(path.join(root, "Edited", "team-photo.png"), 2026, 10, 4, 15, 0);
  const bare = await sharp({
    create: { width: 200, height: 120, channels: 3, background: "#713f12" },
  })
    .jpeg()
    .toBuffer(); // sharp writes no EXIF unless asked
  fs.writeFileSync(path.join(root, "Edited", "no-camera-date.jpg"), bare);
  setModified(path.join(root, "Edited", "no-camera-date.jpg"), 2026, 10, 5, 8, 0);

  // Things that are not photos.
  fs.writeFileSync(path.join(root, "Thumbs.db"), "windows thumbnail cache");
  fs.writeFileSync(
    path.join(root, "DCIM", "100CANON", "MVI_0011.MP4"),
    "not a video, either",
  );
  fs.writeFileSync(path.join(root, "Edited", "notes.txt"), "pick the best 20");
  fs.writeFileSync(path.join(root, "Edited", "broken.jpg"), "this is text, not a JPEG");
}

// ---------------------------------------------------------------------------
// Driving the page
// ---------------------------------------------------------------------------

async function stat(page, id) {
  const t = await page.textContent(`[data-testid=stat-${id}]`);
  return Number((t || "").replace(/[^0-9]/g, ""));
}

async function checkFolder(page, folder, label) {
  const sent = [];
  const onRequest = (r) => {
    if (r.method() !== "GET" || r.postData() !== null)
      sent.push(`${r.method()} ${r.url()}`);
  };
  await page.goto(`${BASE}/check`);
  await page.waitForSelector("[data-testid=read-only-note]");
  const storedBefore = storedPhotos();
  const before = fingerprint(folder);
  page.on("request", onRequest);
  const started = Date.now();
  await page.setInputFiles("[data-testid=check-folder-input]", folder);
  await page.waitForSelector("[data-testid=check-report]", { timeout: 600_000 });
  const seconds = (Date.now() - started) / 1000;
  page.off("request", onRequest);
  const after = fingerprint(folder);
  const diff = differences(before, after);
  check(
    `${label}: no file changed, renamed, deleted or added (${before.size} fingerprinted)`,
    diff.length === 0,
    diff.slice(0, 5).join("; "),
  );
  check(
    `${label}: nothing was sent to the server while checking`,
    sent.length === 0,
    sent.slice(0, 3).join("; "),
  );
  check(
    `${label}: JerseySort stored no copy of any photo`,
    storedPhotos() === storedBefore,
    `${storedBefore} -> ${storedPhotos()}`,
  );
  const games = await page.$$eval("[data-testid=game]", (els) =>
    els.map((e) => e.textContent.trim()),
  );
  const days = await page.$$eval("[data-testid=days] tbody tr", (rows) =>
    rows.map((r) => ({
      day: r.getAttribute("data-day"),
      photos: Number(
        r.querySelector("[data-col=photos]").textContent.replace(/[^0-9]/g, ""),
      ),
      estimated: Number(
        r.querySelector("[data-col=estimated]").textContent.replace(/[^0-9]/g, ""),
      ),
      raw: Number(r.querySelector("[data-col=raw]").textContent.replace(/[^0-9]/g, "")),
    })),
  );
  const report = {
    total: await stat(page, "total"),
    supported: await stat(page, "supported"),
    jpeg: await stat(page, "jpeg"),
    pngHeic: await stat(page, "png-heic"),
    cr2: await stat(page, "cr2"),
    cr3: await stat(page, "cr3"),
    unsupported: await stat(page, "unsupported"),
    estimated: await stat(page, "estimated"),
    earliest:
      (await page.textContent("[data-testid=earliest]").catch(() => null)) || null,
    latest: (await page.textContent("[data-testid=latest]").catch(() => null)) || null,
    days,
    games,
    seconds,
    filesFingerprinted: before.size,
    filesAltered: diff.length,
    requestsSent: sent.length,
  };
  console.log(
    `  ..    ${label}: ${report.total} files read in ${seconds.toFixed(1)} s`,
  );
  return report;
}

// An independent count of what is in a folder, from the bytes, written
// separately from the app's code so the two can disagree.
function independentCount(folder) {
  let total = 0;
  let photos = 0;
  for (const file of walk(folder)) {
    total += 1;
    const fd = fs.openSync(file, "r");
    const head = Buffer.alloc(12);
    fs.readSync(fd, head, 0, 12, 0);
    fs.closeSync(fd);
    const size = fs.statSync(file).size;
    const jpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    const png = head
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const heic =
      head.toString("latin1", 4, 8) === "ftyp" &&
      ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(
        head.toString("latin1", 8, 12),
      );
    const name = path.basename(file).toLowerCase();
    if ((jpeg || png || heic) && size <= 60 * 1024 * 1024 && name !== "thumbs.db")
      photos += 1;
  }
  return { total, photos };
}

async function startFromConsole(browser) {
  const page = await browser.newPage();
  await page.goto(CONSOLE, { timeout: 120_000 });
  const button = page.getByRole("button", { name: /^(Start|Restart) JerseySort AI$/ });
  check("the console shows a Start JerseySort AI button", (await button.count()) === 1);
  const t0 = Date.now();
  await button.click();
  await page.waitForFunction(
    () =>
      /Open it at http:\/\/localhost:4603|did not start/.test(document.body.innerText),
    null,
    { timeout: 900_000 },
  );
  const body = await page.textContent("body");
  results.launchSeconds = Math.round((Date.now() - t0) / 1000);
  check(
    `pressing Start JerseySort AI built and started it (${results.launchSeconds} s)`,
    body.includes("Open it at http://localhost:4603"),
    body.slice(0, 600),
  );
  await shot(page, "00-console-started");
  const health = await fetch(`${BASE}/api/health`)
    .then((r) => r.status)
    .catch((e) => String(e));
  check("JerseySort answers on port 4603", health === 200, String(health));
  results.windowsLaunch =
    body.includes("Open it at http://localhost:4603") && health === 200;
  await page.close();
}

(async () => {
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch {
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const root = execFileSync(npm, ["root", "-g"], {
      shell: process.platform === "win32",
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
  results.platform = `${process.platform} ${os.release()} · Node ${process.version}`;
  console.log(`Platform: ${results.platform}`);

  if (CONSOLE !== null) {
    console.log("\nStart from the Development Control Center");
    await startFromConsole(browser);
  }

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  console.log("\nSign up");
  await page.goto(`${BASE}/signup`);
  await page.fill("#name", "Keith");
  await page.fill("#organization", "5-Star Sports Media");
  await page.fill("#email", `check-${Date.now()}@example.test`);
  await page.fill("#password", "a long enough password");
  await page.click("main button[type=submit]");
  await page.waitForURL(`${BASE}/`);
  check("signed in", (await page.textContent("body")).includes("Find your athlete"));
  check(
    "the menu offers Check a folder",
    (await page.getByRole("link", { name: "Check a folder" }).count()) === 1,
  );

  console.log("\nCamera-card folder (generated)");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jerseysort-check-"));
  const card = path.join(tmp, "Canon Card");
  await buildCard(card);
  const r = await checkFolder(page, card, "camera card");
  await shot(page, "01-camera-card-report");
  check("total files: 19", r.total === 19, String(r.total));
  check("supported photos: 12", r.supported === 12, String(r.supported));
  check("JPG/JPEG: 11 (.JPG and .jpeg alike)", r.jpeg === 11, String(r.jpeg));
  check("PNG/HEIC: 1", r.pngHeic === 1, String(r.pngHeic));
  check("Canon RAW .CR2: 1", r.cr2 === 1, String(r.cr2));
  check("Canon RAW .CR3: 2", r.cr3 === 2, String(r.cr3));
  check(
    "not supported: 4 (Thumbs.db, .MP4, .txt, a fake .jpg)",
    r.unsupported === 4,
    String(r.unsupported),
  );
  check("photos with an estimated date: 2", r.estimated === 2, String(r.estimated));
  check(
    "earliest: October 3, 2026 · 6:01 PM",
    r.earliest === "October 3, 2026 · 6:01 PM",
    r.earliest,
  );
  check(
    "the range is not called an estimate when a camera photo sets it",
    !((await page.textContent("[data-testid=check-report]")) || "").includes(
      "is an estimate from the file",
    ),
  );
  check(
    "latest: October 5, 2026 · 9:40 AM",
    r.latest === "October 5, 2026 · 9:40 AM",
    r.latest,
  );
  check(
    "three shooting dates, with photos / estimated / RAW counted per day",
    JSON.stringify(r.days) ===
      JSON.stringify([
        { day: "2026-10-03", photos: 4, estimated: 0, raw: 2 },
        { day: "2026-10-04", photos: 4, estimated: 1, raw: 1 },
        { day: "2026-10-05", photos: 4, estimated: 1, raw: 0 },
      ]),
    JSON.stringify(r.days),
  );
  check(
    "proposes three games, one per date",
    JSON.stringify(r.games) ===
      JSON.stringify([
        "October 3, 2026 — 4 photos",
        "October 4, 2026 — 4 photos",
        "October 5, 2026 — 4 photos",
      ]),
    JSON.stringify(r.games),
  );
  check(
    "says plainly that no games were created",
    ((await page.textContent("[data-testid=games-not-created]")) || "").includes(
      "No games have been created",
    ),
  );
  check(
    "says RAW files cannot be imported yet",
    (await page.locator("[data-testid=raw-note]").count()) === 1,
  );

  // Per-photo date source.
  await page.getByRole("button", { name: /^Estimated or no date/ }).click();
  const flagged = await page.$$eval("[data-testid=files] tbody tr", (rows) =>
    rows.map((row) => [
      row.getAttribute("data-file"),
      row.querySelector("[data-col=source]").textContent,
    ]),
  );
  check(
    "the two photos without a camera date are flagged 'Estimated from file date'",
    flagged.length === 2 &&
      flagged.every(([, s]) => s === "Estimated from file date") &&
      flagged.some(([f]) => f.endsWith("team-photo.png")) &&
      flagged.some(([f]) => f.endsWith("no-camera-date.jpg")),
    JSON.stringify(flagged),
  );
  await page.getByRole("button", { name: /^All \(/ }).click();
  const cameraRow = await page.textContent(
    '[data-file$="IMG_0001.JPG"] [data-col=source]',
  );
  check(
    "a camera photo shows its date came from the camera (EXIF)",
    cameraRow === "Camera (EXIF)",
    cameraRow,
  );
  check(
    "the camera model is read",
    ((await page.textContent('[data-file$="IMG_0001.JPG"]')) || "").includes(
      "Canon EOS R6",
    ),
  );
  await page.getByRole("button", { name: /^Canon RAW/ }).click();
  check(
    "the RAW view lists the three Canon RAW files",
    (await page.locator("[data-testid=files] tbody tr").count()) === 3,
  );
  await page.getByRole("button", { name: /^Not supported/ }).click();
  const reasons = await page.textContent("[data-testid=files] tbody");
  check(
    "every unsupported file says why",
    reasons.includes("System file, not a photo") &&
      reasons.includes("Named .jpg but is not a JPG image") &&
      reasons.includes(".mp4 files are not photos JerseySort reads"),
    reasons,
  );
  await shot(page, "02-camera-card-unsupported");
  results.cameraCard = r;

  results.realFolders = [];
  for (const folder of REAL) {
    console.log(`\nReal folder: ${folder}`);
    if (!check(`${folder} exists`, fs.existsSync(folder))) continue;
    const truth = independentCount(folder);
    const real = await checkFolder(page, folder, path.basename(folder));
    await shot(page, `03-real-${path.basename(folder)}`);
    check(
      `total files match an independent count (${truth.total})`,
      real.total === truth.total,
      `${real.total}`,
    );
    check(
      `supported photos match an independent count (${truth.photos})`,
      real.supported === truth.photos,
      `${real.supported}`,
    );
    check(
      "every photo is dated, by camera or by estimate",
      real.days.reduce((n, d) => n + d.photos, 0) === real.supported,
      JSON.stringify(real.days),
    );
    console.log(
      `  ..    dates: ${real.days.map((d) => `${d.day} (${d.photos}, ${d.estimated} estimated)`).join(", ")}`,
    );
    console.log(`  ..    proposed: ${real.games.join(" | ")}`);
    results.realFolders.push({ folder, truth, ...real });
  }

  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  results.failures = failures;
  if (process.env.JERSEYSORT_REPORT) {
    fs.writeFileSync(process.env.JERSEYSORT_REPORT, JSON.stringify(results, null, 2));
  }
  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
