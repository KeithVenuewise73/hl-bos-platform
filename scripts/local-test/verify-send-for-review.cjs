#!/usr/bin/env node
/**
 * "Send for review" on a DateSort date card, in a real browser, against a
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
const PORT = 4614;
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
        });
      }
      if (url.pathname === "/review/uploads")
        return json({
          uploads: body.files.map((f) => ({
            ...f,
            url: `http://127.0.0.1:${server.address().port}/files/${body.batch_id}/${f.hash}-${f.kind}.jpg`,
          })),
        });
      if (url.pathname === "/review/commit") {
        for (const p of body.photos) state.known.set(p.hash, p);
        return json({ added: body.photos.length });
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
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "send-review-"));
  const home = path.join(work, "home");
  const settingsDir =
    process.platform === "win32"
      ? path.join(home, "AppData", "Local", "DateSort")
      : path.join(home, ".config", "datesort");
  fs.mkdirSync(settingsDir, { recursive: true });
  const card = path.join(work, "card", "DCIM");
  const dest = path.join(work, "Games");
  fs.mkdirSync(card, { recursive: true });
  fs.mkdirSync(dest, { recursive: true });
  for (let i = 0; i < 4; i++) {
    const noise =
      i === 3
        ? { create: { width: 640, height: 480, channels: 3, background: "#777" } }
        : {
            create: {
              width: 1600,
              height: 1000,
              channels: 3,
              background: { r: 0, g: 0, b: 0 },
              noise: { type: "gaussian", mean: 128, sigma: 55 },
            },
          };
    fs.writeFileSync(
      path.join(card, `IMG_${i}.JPG`),
      await sharp(noise)
        .jpeg({ quality: 88 })
        .withExif({
          IFD0: { Make: "Canon", Copyright: "private-camera-detail" },
          IFD2: { DateTimeOriginal: `2026:10:24 18:0${i}:00` },
        })
        .toBuffer(),
    );
  }
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
    await page.goto(BASE);
    await page.fill("[data-testid=source-input]", path.join(work, "card"));
    await page.click("[data-testid=scan-button]");
    await page.waitForSelector("[data-testid=scan-report]", { timeout: 300_000 });
    await page.fill("[data-testid=destination-input]", dest);
    const day = page.locator("[data-testid=date-card][data-day='2026-10-24']");
    await day
      .locator("[data-testid=event-name]")
      .fill("Hockey - Varsity vs Wheatfield");
    await day.locator("[data-testid=create-folder]").click();
    await day.locator("[data-testid=card-result]").waitFor({ timeout: 120_000 });
    const folder = path.join(dest, fs.readdirSync(dest)[0]);
    check(
      "the game folder was made with its 4 photos",
      fs.readdirSync(folder).length === 4,
      fs.readdirSync(folder).join(","),
    );
    const before = fingerprint(folder);

    console.log("\nNo review area set up yet");
    await page.reload();
    await page.fill("[data-testid=source-input]", path.join(work, "card"));
    await page.click("[data-testid=scan-button]");
    await page.waitForSelector("[data-testid=scan-report]", { timeout: 300_000 });
    const d2 = page.locator("[data-testid=date-card][data-day='2026-10-24']");
    await d2.locator("[data-testid=review-unavailable]").waitFor({ timeout: 30_000 });
    check(
      "the button is switched off and says why",
      (await d2.locator("[data-testid=send-review]").isDisabled()) &&
        /not been switched on/.test(
          await d2.locator("[data-testid=review-unavailable]").textContent(),
        ),
    );

    console.log("\nSet up, not connected");
    fs.writeFileSync(
      path.join(settingsDir, "review.json"),
      JSON.stringify({ serviceUrl: svc.url, key: null, connectedAt: null }),
    );
    await page.reload();
    await page.fill("[data-testid=source-input]", path.join(work, "card"));
    await page.click("[data-testid=scan-button]");
    await page.waitForSelector("[data-testid=scan-report]", { timeout: 300_000 });
    const d3 = page.locator("[data-testid=date-card][data-day='2026-10-24']");
    await d3.locator("[data-testid=connect-review]").waitFor({ timeout: 30_000 });
    check("it asks to connect this computer first", true);
    svc.state.windowOpen = false;
    await d3.locator("[data-testid=connect-review]").click();
    const closed = await d3
      .locator("[data-testid=review-error]")
      .textContent({ timeout: 30_000 });
    check(
      "a closed connect window is explained in words",
      /not accepting new connections/.test(closed),
      closed,
    );
    svc.state.windowOpen = true;
    await d3.locator("[data-testid=connect-review]").click();
    await d3.locator("[data-testid=send-review]").waitFor({ timeout: 30_000 });
    check("connecting works and the send button appears", true);
    const saved = JSON.parse(
      fs.readFileSync(path.join(settingsDir, "review.json"), "utf8"),
    );
    check(
      "the key stays on this computer; the service only knows its fingerprint",
      saved.key &&
        svc.state.registered ===
          crypto.createHash("sha256").update(saved.key).digest("hex"),
    );

    console.log("\nSending");
    await d3.locator("[data-testid=send-review]").click();
    await d3.locator("[data-testid=review-result]").waitFor({ timeout: 120_000 });
    const result = await d3.locator("[data-testid=review-result]").innerText();
    if (SHOTS) {
      fs.mkdirSync(SHOTS, { recursive: true });
      await d3.screenshot({ path: path.join(SHOTS, "card-after-send.png") });
    }
    check(
      "it says 4 photos were sent and are private until approved",
      /Sent 4 photos for review\. They are private until you approve them on the website\./.test(
        result,
      ),
      result,
    );
    check(
      "the service holds 4 photos with a web copy and a thumbnail each",
      svc.state.known.size === 4 && svc.state.files.size === 8,
      `${svc.state.known.size} / ${svc.state.files.size}`,
    );
    const first = [...svc.state.known.values()].find((p) => p.filename === "IMG_0.JPG");
    check(
      "each carries its game and the time it was taken",
      svc.state.batches[0].label.name === "Varsity vs Wheatfield" &&
        svc.state.batches[0].label.sport === "Hockey" &&
        first?.taken_at === "2026-10-24T18:00:00",
      JSON.stringify(svc.state.batches[0].label),
    );
    const flagged = [...svc.state.known.values()].find(
      (p) => p.filename === "IMG_3.JPG",
    );
    check(
      "the small flat photo is flagged for the reviewer",
      flagged && flagged.flags.includes("small"),
      JSON.stringify(flagged?.flags),
    );
    let leaked = false;
    for (const b of svc.state.files.values())
      if (b.includes("private-camera-detail") || b.includes("Canon")) leaked = true;
    check("nothing sent carries the camera's details", !leaked);
    check(
      "the folder on the drive is byte-for-byte unchanged",
      fingerprint(folder) === before,
    );

    console.log("\nSending again");
    await d3.locator("[data-testid=send-review]").click();
    await page.waitForFunction(
      () =>
        /already there/.test(
          document.querySelector("[data-testid=review-result]")?.textContent ?? "",
        ),
      null,
      { timeout: 120_000 },
    );
    const again = await d3.locator("[data-testid=review-result]").innerText();
    check(
      "sending again says everything is already waiting and uploads nothing",
      /Everything in this folder is already waiting for review/.test(again) &&
        svc.state.files.size === 8,
      again,
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
