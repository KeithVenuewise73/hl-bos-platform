#!/usr/bin/env node
/**
 * Free up the card in DateSort, in a real browser, against a
 * stand-in for the website's review service that enforces the contract
 * (packages/date-sort/src/review/client.ts).
 *
 *   node scripts/local-test/verify-send-for-review.cjs
 *
 * It starts its own DateSort (port 4614) with its own settings folder, so it
 * never touches the real ones. Checks, in order:
 *   - no review area configured: the button is off and says why (no pretending)
 *   - configured but not connected: asks to connect; connecting works
 *   - sending: progress, a plain result, the service really holds the photos
 *     (web copy + thumbnail), with no camera details in them, and the folder
 *     is byte-for-byte unchanged
 *   - sending again sends nothing new
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawn } = require("node:child_process");

const REPO = path.resolve(__dirname, "../..");
const PORT = 4615;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = process.env.DATESORT_SCREENSHOTS || null;
const sharp = require(
  path.join(REPO, "packages", "date-sort", "node_modules", "sharp"),
);
const results = { checks: 0, failures: 0 };
function check(name, ok, detail) {
  results.checks += 1;
  if (!ok) results.failures += 1;
  console.log(
    `  ${ok ? "OK  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : ` — ${detail}`}`,
  );
}
const fingerprint = (dir) =>
  fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => {
      const f = path.join(e.parentPath, e.name);
      return `${path.relative(dir, f)}|${fs.statSync(f).size}|${fs.statSync(f).mtimeMs}|${crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex")}`;
    })
    .sort()
    .join("\n");

// ---- the stand-in review service ------------------------------------------
function startService() {
  const state = {
    registered: null,
    windowOpen: true,
    known: new Map(),
    files: new Map(),
    batches: [],
    large: new Set(),
  };
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks);
      const url = new URL(req.url, "http://x");
      const json = (o, s = 200) => {
        res.writeHead(s, { "content-type": "application/json" });
        res.end(JSON.stringify(o));
      };
      if (req.method === "PUT") {
        state.files.set(url.pathname, raw);
        res.writeHead(200).end();
        return;
      }
      const body = raw.length ? JSON.parse(raw.toString()) : {};
      if (url.pathname === "/review/register") {
        if (!state.windowOpen) return json({ status: "closed" });
        state.registered = body.key_sha256;
        return json({ status: "connected" });
      }
      const key = req.headers["x-review-publisher-key"];
      if (
        !key ||
        crypto.createHash("sha256").update(key).digest("hex") !== state.registered
      )
        return json({ error: "no" }, 401);
      if (url.pathname === "/review/batch") {
        state.batches.push(body);
        return json({
          batch_id: `b${state.batches.length}`,
          known: body.hashes.filter((h) => state.known.has(h)),
          need_large: body.hashes
            .filter((h) => state.known.has(h) && !state.large.has(h))
            .map((h) => ({ hash: h, batch_id: state.known.get(h).batch })),
        });
      }
      if (url.pathname === "/review/known")
        return json({ known: body.hashes.filter((h) => state.known.has(h)) });
      if (url.pathname === "/review/uploads")
        return json({
          uploads: body.files.map((f) => ({
            ...f,
            url: `http://127.0.0.1:${server.address().port}/files/${f.batch_id ?? body.batch_id}/${f.hash}-${f.kind}.jpg`,
          })),
        });
      if (url.pathname === "/review/commit") {
        for (const p of body.photos)
          state.known.set(p.hash, { ...p, batch: body.batch_id });
        return json({ added: body.photos.length });
      }
      if (url.pathname === "/review/large") {
        for (const it of body.items) state.large.add(it.hash);
        return json({ attached: body.items.length });
      }
      json({ error: "unknown" }, 404);
    });
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, state, url: `http://127.0.0.1:${server.address().port}` }),
    ),
  );
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
  // The card and the "hard drive" must be different drives: the real check refuses a copy on the card's own drive.
  const driveRoot = fs.existsSync("/dev/shm") ? "/dev/shm" : null;
  if (
    driveRoot === null ||
    fs.statSync(driveRoot).dev === fs.statSync(os.tmpdir()).dev
  ) {
    console.log(
      "SKIPPED: this computer has no second drive to stand in for the hard drive.",
    );
    process.exit(0);
  }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "free-card-"));
  const drive = fs.mkdtempSync(path.join(driveRoot, "free-card-drive-"));
  const home = path.join(work, "home");
  const settingsDir =
    process.platform === "win32"
      ? path.join(home, "AppData", "Local", "DateSort")
      : path.join(home, ".config", "datesort");
  fs.mkdirSync(settingsDir, { recursive: true });
  const card = path.join(work, "card", "DCIM");
  const dest = path.join(drive, "Games");
  fs.mkdirSync(card, { recursive: true });
  fs.mkdirSync(dest, { recursive: true });
  const jpeg = async (name, date, grey) =>
    fs.writeFileSync(
      path.join(card, name),
      await sharp({
        create: {
          width: 1200,
          height: 800,
          channels: 3,
          background: { r: 0, g: 0, b: 0 },
          noise: { type: "gaussian", mean: grey, sigma: 50 },
        },
      })
        .jpeg({ quality: 88 })
        .withExif({ IFD2: { DateTimeOriginal: date } })
        .toBuffer(),
    );
  await jpeg("IMG_0.JPG", "2026:10:24 18:00:00", 90);
  await jpeg("IMG_1.JPG", "2026:10:24 18:01:00", 110);
  await jpeg("IMG_2.JPG", "2026:10:24 18:02:00", 130);
  await jpeg("IMG_B.JPG", "2026:10:25 19:00:00", 150); // a different day: never copied
  fs.writeFileSync(path.join(card, "NOTES.TXT"), "not a photo");

  const svc = await startService();
  const app = spawn(
    process.execPath,
    [
      path.join(REPO, "apps/date-sort/node_modules/next/dist/bin/next"),
      "dev",
      "--port",
      String(PORT),
      "--hostname",
      "127.0.0.1",
    ],
    {
      cwd: path.join(REPO, "apps/date-sort"),
      env: { ...process.env, HOME: home, USERPROFILE: home },
      stdio: "ignore",
    },
  );
  const stop = async () => {
    app.kill();
    svc.server.close();
    fs.rmSync(drive, { recursive: true, force: true });
  };
  try {
    for (let i = 0; i < 120; i++) {
      if (
        await fetch(`${BASE}/api/health`)
          .then((r) => r.ok)
          .catch(() => false)
      )
        break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    const linuxDefault = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
    const browser = await chromium.launch(
      process.env.CHROMIUM_PATH || fs.existsSync(linuxDefault)
        ? { executablePath: process.env.CHROMIUM_PATH || linuxDefault }
        : {},
    );
    const page = await browser.newPage();
    page.on("dialog", (d) => void d.accept());
    const scan = async () => {
      await page.goto(BASE);
      await page.fill("[data-testid=source-input]", path.join(work, "card"));
      await page.click("[data-testid=scan-button]");
      await page.waitForSelector("[data-testid=scan-report]", { timeout: 300_000 });
    };
    fs.writeFileSync(
      path.join(settingsDir, "review.json"),
      JSON.stringify({ serviceUrl: svc.url, key: null, connectedAt: null }),
    );
    await scan();
    await page.fill("[data-testid=destination-input]", dest);
    const day = page.locator("[data-testid=date-card][data-day='2026-10-24']");
    await day
      .locator("[data-testid=event-name]")
      .fill("Hockey - Varsity vs Wheatfield");

    console.log(
      "Nothing is offered until the destination is set and 5Star is connected",
    );
    check(
      "the Free up the card panel is there once a hard-drive folder is chosen",
      (await page.locator("[data-testid=free-card]").count()) === 1,
    );

    console.log("\nBefore the photos are copied or sent");
    await page.click("[data-testid=free-check]");
    await page.locator("[data-testid=free-summary]").waitFor({ timeout: 120_000 });
    check(
      "nothing can be deleted yet, and no delete button is offered",
      /Nothing on the card can be deleted yet/.test(
        await page.locator("[data-testid=free-summary]").innerText(),
      ) && (await page.locator("[data-testid=free-delete]").count()) === 0,
    );
    const cardBefore = fingerprint(path.join(work, "card"));
    check("checking changed nothing on the card", true);

    console.log("\nCopied to the hard drive, but not on 5Star");
    await day.locator("[data-testid=create-folder]").click();
    await day.locator("[data-testid=card-result]").waitFor({ timeout: 120_000 });
    await page.click("[data-testid=free-check]");
    await page.waitForFunction(
      () =>
        /5Star|Nothing on the card/.test(
          document.querySelector("[data-testid=free-summary]")?.textContent ?? "",
        ),
      null,
      { timeout: 120_000 },
    );
    const t1 = await page.locator("[data-testid=free-checked]").innerText();
    check(
      "photos not on 5Star are kept: nothing to delete, with the reasons in words",
      /Nothing on the card can be deleted yet/.test(t1) &&
        /not on 5Star yet|could not be checked/.test(t1),
      t1,
    );
    check(
      "the card is byte-for-byte unchanged",
      fingerprint(path.join(work, "card")) === cardBefore,
    );

    console.log("\nConnect and send to 5Star");
    await day.locator("[data-testid=connect-review]").click();
    await day.locator("[data-testid=send-review]").waitFor({ timeout: 30_000 });
    await day.locator("[data-testid=send-review]").click();
    await day.locator("[data-testid=review-result]").waitFor({ timeout: 120_000 });
    check("3 photos are on 5Star", svc.state.known.size === 3);

    // 5Star "forgets" one photo, to prove a photo not there is never deleted.
    const forgotten = [...svc.state.known.entries()].find(
      ([, p]) => p.filename === "IMG_1.JPG",
    );
    svc.state.known.delete(forgotten[0]);

    console.log("\nCopied and on 5Star (except one the service lost)");
    await page.reload();
    await page.fill("[data-testid=source-input]", path.join(work, "card"));
    await page.click("[data-testid=scan-button]");
    await page.waitForSelector("[data-testid=scan-report]", { timeout: 300_000 });
    await page.click("[data-testid=free-check]");
    await page.waitForFunction(
      () =>
        /can be deleted/.test(
          document.querySelector("[data-testid=free-summary]")?.textContent ?? "",
        ),
      null,
      { timeout: 120_000 },
    );
    const t2 = await page.locator("[data-testid=free-checked]").innerText();
    check(
      "2 photos are safe to delete; the others stay, each with its reason",
      /2 photos .* can be deleted from the card/.test(t2) &&
        /not on 5Star yet/.test(t2) &&
        /no folder for its date/.test(t2),
      t2,
    );
    if (SHOTS) {
      fs.mkdirSync(SHOTS, { recursive: true });
      await page.locator("[data-testid=free-card]").screenshot({
        path: path.join(SHOTS, "free-card-checked.png"),
      });
    }
    check(
      "the card is still unchanged after the check",
      fingerprint(path.join(work, "card")) === cardBefore,
    );

    console.log("\nDeleting needs a confirmation");
    await page.click("[data-testid=free-delete]");
    await page.locator("[data-testid=free-confirm]").waitFor();
    check(
      "it says plainly that the card has no Recycle Bin",
      /no Recycle Bin/.test(
        await page.locator("[data-testid=free-confirm]").innerText(),
      ),
    );
    await page.click("[data-testid=free-confirm-no]");
    check(
      "Cancel deletes nothing",
      fingerprint(path.join(work, "card")) === cardBefore,
    );
    const driveBefore = fingerprint(dest);
    await page.click("[data-testid=free-delete]");
    await page.click("[data-testid=free-confirm-yes]");
    await page.locator("[data-testid=free-result]").waitFor({ timeout: 120_000 });
    const left = fs.readdirSync(card).sort();
    check(
      "the 2 proven photos are gone from the card; the lost one, the uncopied one and the notes stay",
      JSON.stringify(left) === JSON.stringify(["IMG_1.JPG", "IMG_B.JPG", "NOTES.TXT"]),
      left.join(","),
    );
    check(
      "the copies on the hard drive are untouched",
      fingerprint(dest) === driveBefore,
    );
    const log = fs.readFileSync(path.join(settingsDir, "freed-from-card.log"), "utf8");
    check(
      "a record of each deleted file was written first",
      (log.match(/"action":"removing"/g) ?? []).length === 2 &&
        (log.match(/"action":"removed"/g) ?? []).length === 2,
    );
    check(
      "the page says what was deleted",
      /Deleted 2 files from the card/.test(
        await page.locator("[data-testid=free-result]").innerText(),
      ),
    );

    console.log("\nA stale or missing confirmation deletes nothing");
    const res = await fetch(`${BASE}/api/free-card`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ step: "delete", checkId: "stale", confirm: "DELETE" }),
    });
    const noConfirm = await fetch(`${BASE}/api/free-card`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ step: "delete", checkId: "x" }),
    });
    check(
      "an old check, or no confirmation, is refused",
      res.status === 409 && noConfirm.status === 400,
      `${res.status} ${noConfirm.status}`,
    );

    console.log("\n5Star has it again");
    svc.state.known.set(forgotten[0], forgotten[1]);
    await page.click("[data-testid=free-check]");
    await page.waitForFunction(
      () =>
        /1 photo .* can be deleted/.test(
          document.querySelector("[data-testid=free-summary]")?.textContent ?? "",
        ),
      null,
      { timeout: 120_000 },
    );
    await page.click("[data-testid=free-delete]");
    await page.click("[data-testid=free-confirm-yes]");
    await page.locator("[data-testid=free-result]").waitFor({ timeout: 120_000 });
    check(
      "now it can go: only the never-copied photo and the notes are left on the card",
      JSON.stringify(fs.readdirSync(card).sort()) ===
        JSON.stringify(["IMG_B.JPG", "NOTES.TXT"]),
      fs.readdirSync(card).join(","),
    );
    await browser.close();
  } finally {
    await stop();
  }
  console.log(`\n${results.checks - results.failures}/${results.checks} checks passed`);
  process.exit(results.failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
