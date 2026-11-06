/**
 * "Instagram", end to end in a real browser (JerseySort, Stage 1: nothing is
 * posted; it makes the pictures and caption for a person to post):
 *
 *   a game with photos (some with a GPS location, uploaded out of order) →
 *   Instagram → start a post (caption suggested from the game) → choose
 *   photos (at most 10) → save → the pictures are the right size, in the order
 *   the photos were TAKEN → a small photo is flagged → square + bars → the
 *   pack ZIP is a valid ZIP of 01.jpg…, caption.txt → no camera data and NO
 *   GPS in the pictures → another account (and no account) cannot get them
 *
 * Usage:
 *   JERSEYSORT_DATA_DIR=/tmp/js pnpm --filter @hl-bos/jersey-sort-app start
 *   node scripts/local-test/verify-instagram.cjs http://127.0.0.1:4603
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const BASE = (process.argv[2] || "http://127.0.0.1:4603").replace(/\/$/, "");
const SHOTS = process.env.JERSEYSORT_SCREENSHOTS || null;
const APP = path.join(__dirname, "../../apps/jersey-sort");
const sharp = require(path.join(APP, "node_modules/sharp"));
const exifr = require(path.join(APP, "node_modules/exifr"));

let failures = 0;
let checks = 0;
function check(name, ok, detail) {
  checks += 1;
  if (ok) console.log(`  OK    ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
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
function loadPlaywright() {
  try {
    return require("playwright");
  } catch {
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const root = execFileSync(npm, ["root", "-g"], {
      shell: process.platform === "win32",
    })
      .toString()
      .trim();
    return require(path.join(root, "playwright"));
  }
}

const GPS = {
  GPSLatitudeRef: "N",
  GPSLatitude: "42/1 59/1 0/1",
  GPSLongitudeRef: "W",
  GPSLongitude: "78/1 51/1 0/1",
};
const COLORS = { red: "#d32f2f", green: "#2e7d32", blue: "#1565c0", yellow: "#f9a825" };

/** A solid-colour photo with camera data, a capture time, and a GPS location. */
async function photo(dir, name, colour, second, w = 3000, h = 2000) {
  const file = path.join(dir, name);
  fs.writeFileSync(
    file,
    await sharp({ create: { width: w, height: h, channels: 3, background: colour } })
      .jpeg({ quality: 88 })
      .withExif({
        IFD0: { Make: "Canon", Model: "EOS R6" },
        IFD2: {
          DateTimeOriginal: `2026:10:24 18:00:${String(second).padStart(2, "0")}`,
        },
        IFD3: GPS,
      })
      .toBuffer(),
  );
  return file;
}
const centre = async (buf) => {
  const raw = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const i =
    (Math.floor(raw.info.height / 2) * raw.info.width +
      Math.floor(raw.info.width / 2)) *
    raw.info.channels;
  return [raw.data[i], raw.data[i + 1], raw.data[i + 2]];
};
const near = (a, hex) => {
  const h = hex.replace("#", "");
  const want = [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16));
  return a.every((v, k) => Math.abs(v - want[k]) < 40);
};
/**
 * Read a ZIP the way any unzip tool does: from the central directory at the
 * end, checking every file's CRC-32. Returns the problem found (or null) and
 * the files. No Python needed, so it runs the same on Windows.
 */
function readZip(file) {
  const zlib = require("node:zlib");
  const buf = fs.readFileSync(file);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return { bad: "no end-of-archive record", files: {} };
  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  const files = {};
  let bad = null;
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(at) !== 0x02014b50)
      return { bad: "bad central directory", files };
    const method = buf.readUInt16LE(at + 10);
    const crc = buf.readUInt32LE(at + 16);
    const size = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.toString("utf8", at + 46, at + 46 + nameLen);
    const dataAt =
      local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(dataAt, dataAt + size);
    const data =
      method === 0 ? Buffer.from(raw) : method === 8 ? zlib.inflateRawSync(raw) : null;
    if (data === null) bad = `${name}: unsupported method ${method}`;
    else if (zlib.crc32(data) !== crc) bad = `${name}: CRC does not match`;
    else files[name] = data;
    at += 46 + nameLen + extraLen + commentLen;
  }
  return { bad, files };
}
/** Python's zipfile as an independent second opinion, where Python exists. */
function pythonSaysValid(file) {
  try {
    const out = execFileSync(
      "python3",
      [
        "-I",
        "-c",
        "import sys, zipfile; print(zipfile.ZipFile(sys.argv[1]).testzip())",
        file,
      ],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    return out.toString().trim() === "None";
  } catch {
    return null; // no Python here: nothing to compare with
  }
}

(async () => {
  const { chromium } = loadPlaywright();
  const linux = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  const browser = await chromium.launch(
    fs.existsSync(linux) ? { executablePath: linux } : {},
  );
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "instagram-"));
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    console.log("\n1. A game with photos (GPS in them, uploaded out of order)");
    await page.goto(`${BASE}/signup`);
    await page.fill("#name", "Keith");
    await page.fill("#organization", "5 Star Sports Media");
    await page.fill("#email", `keith+${Date.now()}@example.com`);
    await page.fill("#password", "correct horse battery");
    await page.click("main button[type=submit]");
    await page.waitForURL(`${BASE}/`);
    await page.goto(`${BASE}/events/new`);
    await page.fill("#name", "Varsity vs Wheatfield");
    await page.selectOption("#sport", "Hockey");
    await page.fill("#date", "2026-10-24");
    await page.fill("#team", "Varsity");
    await page.fill("#opponent", "Wheatfield");
    await page.fill("#location", "Cazenovia Ice Rink");
    await page.click("main button[type=submit]");
    await page.waitForURL(/\/events\/[0-9a-f-]{36}/);
    const eventId = page.url().split("?")[0].split("/").pop();
    // Taken in this order: red(1) green(2) blue(3) yellow(4), then 7 small ones.
    // Uploaded in a different order, so the order must come from the capture time.
    const files = [
      await photo(work, "D_yellow.jpg", COLORS.yellow, 4),
      await photo(work, "A_blue.jpg", COLORS.blue, 3),
      await photo(work, "C_red.jpg", COLORS.red, 1),
      await photo(work, "B_green.jpg", COLORS.green, 2),
      await photo(work, "E_small.jpg", "#6a1b9a", 5, 800, 600),
    ];
    for (let i = 0; i < 7; i++)
      files.push(
        await photo(
          work,
          `F_extra${i}.jpg`,
          `#${(0x303030 + i * 0x101010).toString(16)}`,
          10 + i,
          1200,
          900,
        ),
      );
    await page.setInputFiles("[data-testid=file-input]", files);
    await page.waitForSelector("text=Upload finished.", { timeout: 180000 });
    const source = fs.readFileSync(files[0]);
    const gpsIn = await exifr.gps(source).catch(() => null);
    check(
      "the test photos really carry a GPS location",
      gpsIn && Math.abs(gpsIn.latitude - 42.983) < 0.01,
      JSON.stringify(gpsIn),
    );

    console.log("\n2. Instagram, from the game's page");
    await page.goto(`${BASE}/events/${eventId}`);
    await page.click("[data-testid=instagram-link]");
    await page.waitForURL(/\/instagram$/);
    check(
      "it says plainly that nothing is posted from here",
      ((await page.textContent("[data-testid=ig-status]")) || "").includes(
        "Nothing is posted from here yet.",
      ),
    );
    await act(page, () => page.click('button:has-text("Start a new Instagram post")'));
    await page.waitForURL(/\/instagram\/[0-9a-f-]{36}$/);
    const draftUrl = page.url();
    const draftId = draftUrl.split("/").pop();
    check(
      "the caption starts from the game: teams, date, place, and the brand, with no names",
      (await page.inputValue("[data-testid=ig-caption]")) ===
        "Varsity vs Wheatfield\nOctober 24, 2026 · Cazenovia Ice Rink\n📸 5 Star Sports Media",
      await page.inputValue("[data-testid=ig-caption]"),
    );

    console.log("\n3. Choose photos, at most 10");
    const boxes = await page.$$("[data-testid=ig-photo]");
    check(
      "all 12 photos of the game are offered",
      boxes.length === 12,
      `${boxes.length}`,
    );
    for (let i = 0; i < 10; i++) await boxes[i].check();
    check(
      "after 10, the counter says so and no more can be chosen",
      ((await page.textContent("[data-testid=ig-picked]")) || "").includes(
        "10 of 10",
      ) &&
        (await page.$$("[data-testid=ig-photo]:not(:checked):not(:disabled)"))
          .length === 0,
    );
    for (let i = 4; i < 10; i++) await boxes[i].uncheck();
    check(
      "untick some and others can be chosen again",
      (await page.$$("[data-testid=ig-photo]:not(:checked):not(:disabled)")).length > 0,
    );
    check(
      "the first four ticked are chosen",
      ((await page.textContent("[data-testid=ig-picked]")) || "").includes("4 of 10"),
    );

    console.log("\n4. The caption and the shape");
    await page.fill(
      "[data-testid=ig-caption]",
      "Varsity vs Wheatfield\nOctober 24, 2026\n📸 5 Star Sports Media\n#WNYHockey #Cazenovia",
    );
    check(
      "the counters follow what is typed",
      ((await page.textContent("[data-testid=ig-caption-count]")) || "").includes(
        "2 of 30 hashtags",
      ),
    );
    await page.fill("[data-testid=ig-caption]", "x".repeat(2201));
    await act(page, () => page.click("[data-testid=ig-save]"));
    check(
      "a caption over Instagram's limit is refused, saying how long it is, and nothing is saved",
      ((await page.textContent("[role=alert]")) || "").includes("2,201 characters"),
    );
    await page.goto(draftUrl);
    const boxes2 = await page.$$("[data-testid=ig-photo]");
    for (let i = 0; i < 4; i++) await boxes2[i].check();
    await page.fill(
      "[data-testid=ig-caption]",
      "Varsity vs Wheatfield\nOctober 24, 2026\n📸 5 Star Sports Media\n#WNYHockey #Cazenovia",
    );
    await act(page, () => page.click("[data-testid=ig-save]"));
    check(
      "saving says so",
      ((await page.textContent("body")) || "").includes("Saved."),
    );

    console.log("\n5. The pictures");
    const frames = await page.$$("[data-testid=ig-frame]");
    check("four pictures are shown", frames.length === 4, `${frames.length}`);
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll("[data-testid=ig-frame]")].every(
          (i) => i.complete && i.naturalWidth > 0,
        ),
      null,
      { timeout: 60000 },
    );
    const dims = await page.$$eval("[data-testid=ig-frame]", (els) =>
      els.map((e) => `${e.naturalWidth}x${e.naturalHeight}`),
    );
    check(
      "each is 1080 x 1350 (portrait 4:5)",
      dims.every((d) => d === "1080x1350"),
      dims.join(","),
    );
    await shot(page, "01-composer");

    // The order: by the time the photos were TAKEN (red, green, blue, yellow),
    // though they were uploaded yellow, blue, red, green.
    const imgs = [];
    for (let i = 1; i <= 4; i++) {
      const r = await context.request.get(
        `${BASE}/api/instagram/${draftId}/frame/${i}`,
      );
      imgs.push(await r.body());
    }
    const order = [];
    for (const b of imgs) {
      const c = await centre(b);
      order.push(Object.keys(COLORS).find((k) => near(c, COLORS[k])) || `?${c}`);
    }
    check(
      "the pictures follow the order the photos were taken",
      order.join(",") === "red,green,blue,yellow",
      order.join(","),
    );

    console.log("\n6. Square, keeping the whole photo");
    await page.click("[data-testid=ig-format-square]");
    await page.click("[data-testid=ig-fit-bars]");
    await act(page, () => page.click("[data-testid=ig-save]"));
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll("[data-testid=ig-frame]")].every(
          (i) => i.complete && i.naturalWidth > 0,
        ),
      null,
      { timeout: 60000 },
    );
    const dims2 = await page.$$eval("[data-testid=ig-frame]", (els) =>
      els.map((e) => `${e.naturalWidth}x${e.naturalHeight}`),
    );
    check(
      "now each is 1080 x 1080",
      dims2.every((d) => d === "1080x1080"),
      dims2.join(","),
    );
    check(
      "no photo here is small, so no softness warning",
      (await page.$$("[data-testid=ig-soft]")).length === 0,
    );

    // Add the small photo (800x600): it must be flagged.
    await page.goto(draftUrl);
    const all = await page.$$("[data-testid=ig-photo]");
    const names = await page.$$eval("[data-testid=ig-photo]", (els) =>
      els.map((e) => e.closest("label").textContent.trim()),
    );
    await all[names.indexOf("E_small.jpg")].check();
    await act(page, () => page.click("[data-testid=ig-save]"));
    check(
      "a small photo is flagged as possibly soft",
      (await page.$$("[data-testid=ig-soft]")).length === 1,
    );

    console.log("\n7. The pack");
    await page.goto(draftUrl);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.click("[data-testid=ig-pack]"),
    ]);
    const zipFile = path.join(work, "pack.zip");
    await download.saveAs(zipFile);
    check(
      "it downloads as a ZIP named for the game",
      /^instagram-varsity-vs-wheatfield-2026-10-24\.zip$/.test(
        download.suggestedFilename(),
      ),
      download.suggestedFilename(),
    );
    const zip = readZip(zipFile);
    const py = pythonSaysValid(zipFile);
    check(
      "an independent ZIP reader (Python's) agrees it is valid, where Python is available",
      py === null || py === true,
      String(py),
    );
    const names2 = Object.keys(zip.files).sort();
    check(
      "it is a valid ZIP (every CRC checks) holding 01-05.jpg and caption.txt",
      zip.bad === null &&
        names2.join() === "01.jpg,02.jpg,03.jpg,04.jpg,05.jpg,caption.txt",
      `${zip.bad} ${names2}`,
    );
    check(
      "the caption is exactly what was saved",
      zip.files["caption.txt"].toString("utf8") ===
        "Varsity vs Wheatfield\nOctober 24, 2026\n📸 5 Star Sports Media\n#WNYHockey #Cazenovia\n",
      JSON.stringify(zip.files["caption.txt"].toString("utf8")),
    );
    let allSquare = true;
    let noCamera = true;
    let noGps = true;
    for (const n of names2.filter((x) => x.endsWith(".jpg"))) {
      const m = await sharp(zip.files[n]).metadata();
      if (m.width !== 1080 || m.height !== 1080 || m.format !== "jpeg")
        allSquare = false;
      if (m.exif || m.xmp || m.iptc) noCamera = false;
      const g = await exifr.gps(zip.files[n]).catch(() => null);
      if (g && g.latitude !== undefined) noGps = false;
      if (zip.files[n].toString("latin1").includes("Canon")) noCamera = false;
    }
    check("every picture is a 1080 x 1080 JPEG", allSquare);
    check("none carries camera data", noCamera);
    check("none carries the GPS location the photos had", noGps);
    const fileSizes = names2
      .filter((x) => x.endsWith(".jpg"))
      .map((n) => zip.files[n].length);
    check(
      "each is well under Instagram's 8 MB limit",
      fileSizes.every((s) => s < 2 * 1024 * 1024),
      fileSizes.join(","),
    );
    await shot(page, "02-pack");

    console.log("\n8. Who can get at it");
    const anon = await browser.newContext();
    check(
      "not signed in: the pictures and the pack are refused (401)",
      (await anon.request.get(`${BASE}/api/instagram/${draftId}/pack`)).status() ===
        401 &&
        (
          await anon.request.get(`${BASE}/api/instagram/${draftId}/frame/1`)
        ).status() === 401,
    );
    const other = await browser.newContext();
    const op = await other.newPage();
    await op.goto(`${BASE}/signup`);
    await op.fill("#name", "Someone");
    await op.fill("#organization", "Another Org");
    await op.fill("#email", `other+${Date.now()}@example.com`);
    await op.fill("#password", "correct horse battery");
    await op.click("main button[type=submit]");
    await op.waitForURL(`${BASE}/`);
    check(
      "another organization's account cannot get them (404)",
      (await other.request.get(`${BASE}/api/instagram/${draftId}/pack`)).status() ===
        404 &&
        (
          await other.request.get(`${BASE}/api/instagram/${draftId}/frame/1`)
        ).status() === 404,
    );
    // The app streams a loading screen first, so the status can already be 200
    // before "not found" is known: what matters is what the page shows.
    await op.goto(draftUrl);
    await op.waitForLoadState("networkidle");
    const theirs = (await op.textContent("body")) || "";
    check(
      "nor open the post's page: it shows not found, and nothing of the game or caption",
      /not found/i.test(theirs) &&
        !theirs.includes("Varsity vs Wheatfield") &&
        !theirs.includes("WNYHockey") &&
        (await op.$$("[data-testid=ig-photo]")).length === 0,
      theirs.slice(0, 200),
    );

    console.log("\n9. Deleting the post");
    await page.goto(draftUrl);
    await act(page, () => page.click('button:has-text("Delete this Instagram post")'));
    check(
      "it goes, and the photos stay",
      ((await page.textContent("body")) || "").includes(
        "was deleted. Your photos are untouched.",
      ) && (await page.$$("[data-testid=ig-drafts] li")).length === 0,
    );
    await page.goto(`${BASE}/events/${eventId}`);
    check(
      "the game still has all 12 photos",
      ((await page.textContent("body")) || "").includes("12 photos"),
    );
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
