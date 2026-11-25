/**
 * Proves the one-button phone import in a real browser, with the phone's copy answered by a stand-in
 * (the real copy needs Windows and a phone). It checks what the person sees and what DateSort asks
 * the copy to do:
 *   - a phone must be named first (Windows calls every iPhone "Apple iPhone");
 *   - one press makes three requests, in order: short clips (videos, small), photos, game footage
 *     (videos, large), each into its own folder for that phone;
 *   - the first time it looks back 30 days; after a clean import, only a week (new since last time);
 *   - "Check first" asks for the same three but changes nothing;
 *   - a phone that cannot be found stops with plain words, and does not count as imported;
 *   - unticking game footage leaves it out; the old buttons are still under "More options".
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, execFileSync } = require("node:child_process");

const REPO = path.resolve(__dirname, "../..");
const PORT = 4616;
const BASE = `http://127.0.0.1:${PORT}`;
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  const root = execFileSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["root", "-g"],
    {
      shell: process.platform === "win32",
    },
  )
    .toString()
    .trim();
  ({ chromium } = require(path.join(root, "playwright")));
}

let failed = 0;
const check = (name, ok, detail) => {
  console.log(
    `  ${ok ? "OK  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `  (${typeof detail === "string" ? detail : JSON.stringify(detail)})`}`,
  );
  if (!ok) failed += 1;
};

/** What the stand-in copy answers for one request. */
function answer(body, mode) {
  if (mode === "none") return [{ type: "none" }];
  const per = { clips: 3, photos: 5, games: 2 };
  const id =
    body.kind === "photos" ? "photos" : body.size === "large" ? "games" : "clips";
  const n = per[id];
  const lines = [
    { type: "looking", folder: "202611_a", sofar: 0 },
    {
      type: "found",
      device: "Apple iPhone",
      total: n + 1,
      bytes: n * 1e9,
      todo: n,
      todoBytes: n * 1e9,
    },
  ];
  if (body.preview) return [...lines, { type: "previewed" }];
  for (let i = 0; i < n; i++)
    lines.push({
      type: "file",
      folder: "202611_a",
      name: `IMG_${id}${i}.MOV`,
      result: "copied",
      bytes: 1e9,
    });
  lines.push({ type: "file", folder: "202611_a", name: "OLD.MOV", result: "already" });
  return [...lines, { type: "done" }];
}

(async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "phone-import-"));
  const home = path.join(work, "home");
  fs.mkdirSync(home, { recursive: true });
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
    const linux = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
    const browser = await chromium.launch(
      process.env.CHROMIUM_PATH || fs.existsSync(linux)
        ? { executablePath: process.env.CHROMIUM_PATH || linux }
        : {},
    );
    const page = await browser.newPage();
    const requests = [];
    let mode = "ok";
    await page.route("**/api/iphone", async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      requests.push(body);
      await route.fulfill({
        status: 200,
        contentType: "application/x-ndjson",
        body:
          answer(body, mode)
            .map((l) => JSON.stringify(l))
            .join("\n") + "\n",
      });
    });
    const text = (sel) => page.locator(sel).first().innerText();
    const settings = () => fetch(`${BASE}/api/settings`).then((r) => r.json());

    console.log("\nNaming the phone");
    await page.goto(BASE);
    await page.waitForSelector("[data-testid=phone-name]");
    check(
      "the one button is there, with a box to name the phone",
      (await page.locator("[data-testid=phone-name]").count()) === 1,
    );
    check(
      "the old photo and video buttons are still there, under More options",
      (await page.locator("[data-testid=iphone-more]").count()) === 1 &&
        (await page.locator("[data-testid=iphone-photos-button]").count()) === 1,
    );
    await page.click("[data-testid=phone-import-button]");
    await page.waitForSelector("[data-testid=phone-problem]");
    check(
      "pressing it before naming the phone says to name it",
      /which phone this is/.test(await text("[data-testid=phone-problem]")),
    );
    check("nothing was asked of the phone", requests.length === 0);
    await page.fill("[data-testid=phone-name]", "Game phone 13 Pro");
    await page.click("[data-testid=phone-save]");
    await page.waitForSelector("[data-testid=phone-select]");
    check(
      "the name is saved and chosen",
      (await page.inputValue("[data-testid=phone-select]")) === "Game phone 13 Pro",
    );
    check(
      "it is remembered on this computer",
      (await settings()).iphonePhones?.[0] === "Game phone 13 Pro",
    );

    // Where everything is kept (the Windows folder window is not available here).
    await fetch(`${BASE}/api/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ iphoneBase: "D:\\Phone Imports" }),
    });
    await page.reload();
    await page.waitForSelector("[data-testid=phone-select]");
    check(
      "it says where this phone's files will be kept",
      /D:\\Phone Imports\\Game phone 13 Pro/.test(
        await text("[data-testid=phone-base]"),
      ),
      await text("[data-testid=phone-base]"),
    );

    console.log("\nCheck first");
    await page.click("[data-testid=phone-import-check]");
    await page.waitForSelector("[data-testid=phone-checked]");
    const checked = await text("[data-testid=phone-checked]");
    check(
      "it says what is new, step by step, with the size",
      /3 short clips/.test(checked) &&
        /5 photos/.test(checked) &&
        /2 game recordings/.test(checked) &&
        /9\.3 GB in all/.test(checked),
      checked,
    );
    check(
      "the first time it looks back 30 days",
      /First time for this phone/.test(checked),
    );
    check(
      "it asked for the same three steps, as a check only",
      requests.length === 3 &&
        requests.every((r) => r.preview === true && r.days === 30),
      requests,
    );
    check(
      "a check changes nothing: no last-import time saved",
      Object.keys((await settings()).iphoneLast || {}).length === 0,
    );

    console.log("\nOne press");
    requests.length = 0;
    await page.click("[data-testid=phone-import-button]");
    await page.waitForSelector("[data-testid=phone-done]", { timeout: 60000 });
    check(
      "three requests, in order: short clips, photos, game footage",
      JSON.stringify(requests.map((r) => [r.kind, r.size])) ===
        JSON.stringify([
          ["videos", "small"],
          ["photos", "all"],
          ["videos", "large"],
        ]),
      requests,
    );
    check(
      "each goes into its own folder for this phone",
      JSON.stringify(requests.map((r) => r.folder)) ===
        JSON.stringify([
          "D:\\Phone Imports\\Game phone 13 Pro\\Short Clips",
          "D:\\Phone Imports\\Game phone 13 Pro\\Photos",
          "D:\\Phone Imports\\Game phone 13 Pro\\Game Footage",
        ]),
      requests.map((r) => r.folder),
    );
    check(
      "none was a check",
      requests.every((r) => r.preview === false),
    );
    const done = await text("[data-testid=phone-done]");
    check(
      "it reports each step in words",
      /3 short clips brought in, 1 already there/.test(done) &&
        /5 photos brought in/.test(done) &&
        /2 game recordings brought in/.test(done),
      done,
    );
    check(
      "it reminds that nothing on the phone was changed",
      /Nothing on the phone was changed/.test(done),
    );
    const last = (await settings()).iphoneLast || {};
    check(
      "the time of this import is remembered for this phone",
      typeof last["Game phone 13 Pro"] === "string",
    );
    check(
      "the short clips folder is put in the folder box, ready to scan",
      (await page.inputValue("[data-testid=source-input]")) ===
        "D:\\Phone Imports\\Game phone 13 Pro\\Short Clips",
      await page.inputValue("[data-testid=source-input]"),
    );

    console.log("\nThe next time: only what is new");
    await page.reload();
    await page.waitForSelector("[data-testid=phone-select]");
    requests.length = 0;
    await page.click("[data-testid=phone-import-check]");
    await page.waitForSelector("[data-testid=phone-checked]");
    check(
      "it now looks back only a week, not a month",
      requests.length === 3 && requests.every((r) => r.days === 7),
      requests.map((r) => r.days),
    );
    check(
      "and says it is looking for what is new since last time",
      /since the last time/.test(await text("[data-testid=phone-checked]")),
    );

    console.log("\nLeaving out game footage");
    await page.uncheck("[data-testid=choice-games]");
    requests.length = 0;
    await page.click("[data-testid=phone-import-button]");
    await page.waitForSelector("[data-testid=phone-done]", { timeout: 60000 });
    check(
      "unticked game footage is not asked for",
      requests.length === 2 && requests.every((r) => r.size !== "large"),
      requests,
    );
    await page.check("[data-testid=choice-games]");

    console.log("\nNo phone found");
    mode = "none";
    const before = (await settings()).iphoneLast["Game phone 13 Pro"];
    requests.length = 0;
    await page.click("[data-testid=phone-import-button]");
    await page.waitForSelector("[data-testid=phone-problem]");
    check(
      "it says to plug in, unlock and tap Trust",
      /Plug it in/.test(await text("[data-testid=phone-problem]")),
    );
    check("it stopped at the first step", requests.length === 1);
    check(
      "a failed import does not count as imported",
      (await settings()).iphoneLast["Game phone 13 Pro"] === before,
    );

    await browser.close();
  } finally {
    app.kill();
  }
  console.log(failed === 0 ? "\nAll checks passed" : `\n${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
