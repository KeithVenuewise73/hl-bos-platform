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
      if (url.pathname === "/review/status") {
        const per = new Map();
        state.batches.forEach((b, i) => {
          const n = [...state.known.values()].filter(
            (p) => p.batch === `b${i + 1}`,
          ).length;
          per.set(b.label.date, (per.get(b.label.date) ?? 0) + n);
        });
        return json({
          days: [...per].map(([date, photos]) => ({
            date,
            photos,
            waiting: photos,
            approved: 0,
            rejected: 0,
          })),
        });
      }
      if (url.pathname === "/review/games") {
        const per = new Map();
        state.batches.forEach((b, i) => {
          if (b.label.date !== body.date) return;
          const k = `${b.label.name}|${b.label.sport ?? ""}`;
          const n = [...state.known.values()].filter(
            (p) => p.batch === `b${i + 1}`,
          ).length;
          const g = per.get(k) ?? {
            name: b.label.name,
            sport: b.label.sport ?? "",
            team: null,
            photos: 0,
            clips: 0,
            first_at: null,
            last_at: null,
          };
          g.photos += n;
          for (const p of state.known.values()) {
            if (p.batch !== `b${i + 1}` || !p.taken_at) continue;
            const t = String(p.taken_at).slice(11, 16);
            if (!g.first_at || t < g.first_at) g.first_at = t;
            if (!g.last_at || t > g.last_at) g.last_at = t;
          }
          per.set(k, g);
        });
        return json({ games: [...per.values()] });
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
  for (let i = 0; i < 2; i++)
    fs.writeFileSync(
      path.join(card, `IMG_B${i}.JPG`),
      await sharp({
        create: {
          width: 1200,
          height: 800,
          channels: 3,
          background: { r: 0, g: 0, b: 0 },
          noise: { type: "gaussian", mean: 100 + i * 20, sigma: 50 },
        },
      })
        .jpeg({ quality: 88 })
        .withExif({ IFD2: { DateTimeOriginal: `2026:10:25 19:0${i}:00` } })
        .toBuffer(),
    );
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

    console.log("\nWhich dates are on the website");
    await page.reload();
    await page.fill("[data-testid=source-input]", path.join(work, "card"));
    await page.click("[data-testid=scan-button]");
    await page.waitForSelector("[data-testid=scan-report]", { timeout: 300_000 });
    const s1 = page
      .locator("[data-testid=date-card][data-day='2026-10-24']")
      .locator("[data-testid=site-status]");
    await s1.waitFor({ timeout: 30_000 });
    check(
      "before anything is sent, the date card says it is not on 5Star yet",
      /Not on 5Star yet/.test(await s1.innerText()),
      await s1.innerText(),
    );
    check(
      "the Send all panel counts the dates fully on 5Star",
      /0 of 2 dates are fully on 5Star/.test(
        await page.locator("[data-testid=send-all-summary]").innerText(),
      ),
      await page.locator("[data-testid=send-all-summary]").innerText(),
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
      "the service holds 4 photos with a web copy, a thumbnail and a large copy each",
      svc.state.known.size === 4 && svc.state.files.size === 12,
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

    await d3
      .locator("[data-testid=site-status][data-state=all]")
      .waitFor({ timeout: 30_000 });
    check(
      "after sending, the card says all 4 photos are on 5Star",
      /On 5Star: all 4 photos/.test(
        await d3.locator("[data-testid=site-status]").innerText(),
      ),
      await d3.locator("[data-testid=site-status]").innerText(),
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
        svc.state.files.size === 12,
      again,
    );

    console.log("\nSend all");
    await page.reload();
    await page.fill("[data-testid=source-input]", path.join(work, "card"));
    await page.click("[data-testid=scan-button]");
    await page.waitForSelector("[data-testid=scan-report]", { timeout: 300_000 });
    await page.locator("[data-testid=send-all-button]").waitFor({ timeout: 30_000 });
    check(
      "a Send all button names how many dates it will send",
      /Send all 2 dates for review/.test(
        await page.locator("[data-testid=send-all-button]").innerText(),
      ),
    );
    await page.click("[data-testid=send-all-button]");
    await page.locator("[data-testid=send-all-result]").waitFor({ timeout: 120_000 });
    const all1 = await page.locator("[data-testid=send-all-result]").innerText();
    check(
      "a date with no folder yet is passed by and named; the ready date is not sent twice",
      /Finished\. 1 date done: 0 photos newly sent for review, 4 photos already there/.test(
        all1,
      ) &&
        /1 date was passed by because its folder is not ready: 2026-10-25/.test(all1) &&
        svc.state.files.size === 12,
      all1,
    );
    const day2 = page.locator("[data-testid=date-card][data-day='2026-10-25']");
    await day2.locator("[data-testid=event-name]").fill("Hockey - JV vs Lockport");
    await day2.locator("[data-testid=create-folder]").click();
    await day2.locator("[data-testid=card-result]").waitFor({ timeout: 120_000 });
    console.log("\nA date the website already holds under another name");
    // The website already has a game on 2026-10-25 with a different name (typed another day).
    svc.state.batches.push({
      label: { name: "JV vs Lockport Playoff", sport: "Hockey", date: "2026-10-25" },
      folder: "earlier",
      counts: { photos: 0, videos: 0 },
      hashes: [],
    });
    const heldBefore = svc.state.known.size;
    await page.click("[data-testid=send-all-button]");
    await page.locator("[data-testid=send-all-asking]").waitFor({ timeout: 120_000 });
    const asking = await page.locator("[data-testid=send-all-asking]").innerText();
    check(
      "the date is held back with a question naming the game the website has, and nothing is sent for it",
      /1 date was held back/.test(asking) &&
        /JV vs Lockport Playoff/.test(asking) &&
        /different game: start a new one called/.test(asking) &&
        /clock can be set wrong/.test(asking) &&
        svc.state.known.size === heldBefore,
      asking,
    );
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "game-choice.png") });
    check(
      "the question also offers to send only the photos or only the clips",
      /only the photos/.test(
        await page.locator("[data-testid=game-choice-only]").innerText(),
      ) &&
        /only the clips/.test(
          await page.locator("[data-testid=game-choice-only]").innerText(),
        ),
    );
    // Only the clips of a folder that has none: nothing is sent, and it says so in words.
    await page.locator("[data-testid=game-choice-only-clips]").check();
    await page.locator("[data-testid=game-choice-send]").click();
    await page.locator("[data-testid=send-all-answered]").waitFor({ timeout: 120_000 });
    const noClips = await page.locator("[data-testid=send-all-answered]").innerText();
    check(
      "choosing only the clips of a folder without clips sends nothing and says so",
      /no clips in that folder/.test(noClips) && svc.state.known.size === heldBefore,
      noClips,
    );
    // Ask again, and this time send everything (the default).
    await page.click("[data-testid=send-all-button]");
    await page.locator("[data-testid=send-all-asking]").waitFor({ timeout: 120_000 });
    await page.locator("[data-testid=game-choice-send]").click();
    await page.locator("[data-testid=send-all-answered]").waitFor({ timeout: 120_000 });
    const lastBatch = svc.state.batches[svc.state.batches.length - 1];
    check(
      "choosing the existing game sends the 2 photos into that game, not a new one",
      lastBatch.label.name === "JV vs Lockport Playoff" &&
        lastBatch.label.sport === "Hockey" &&
        svc.state.known.size === heldBefore + 2,
      JSON.stringify(lastBatch.label),
    );
    await page.click("[data-testid=send-all-button]");
    await page.waitForFunction(
      () =>
        /Finished\. 2 dates done/.test(
          document.querySelector("[data-testid=send-all-result]")?.textContent ?? "",
        ),
      null,
      { timeout: 120_000 },
    );
    const all2 = await page.locator("[data-testid=send-all-result]").innerText();
    check(
      "Send all again does not ask twice: the choice is remembered, and nothing is sent twice",
      /2 dates done: 0 photos newly sent for review, 6 photos already there/.test(
        all2,
      ) &&
        svc.state.known.size === 6 &&
        svc.state.files.size === 18,
      all2,
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
