/**
 * Proves the "Show dates from" drop-down in a real browser: a card holding old dates (years back)
 * and recent ones. Choosing "Last 90 days" shows only the recent dates and says how many are hidden,
 * Copy all then counts only the shown dates, the choice is remembered, and "All dates" brings
 * everything back. Nothing is hidden by default.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const REPO = path.resolve(__dirname, "../..");
const PORT = 4615;
const BASE = `http://127.0.0.1:${PORT}`;
const sharp = require(
  path.join(REPO, "packages", "date-sort", "node_modules", "sharp"),
);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  const root = require("node:child_process")
    .execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["root", "-g"], {
      shell: process.platform === "win32",
    })
    .toString()
    .trim();
  ({ chromium } = require(path.join(root, "playwright")));
}

let failed = 0;
const check = (name, ok, detail) => {
  console.log(
    `  ${ok ? "OK  " : "FAIL"}  ${name}${ok || !detail ? "" : `  (${detail})`}`,
  );
  if (!ok) failed += 1;
};
const ymd = (d) =>
  `${d.getFullYear()}:${String(d.getMonth() + 1).padStart(2, "0")}:${String(d.getDate()).padStart(2, "0")}`;
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

(async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "since-"));
  const home = path.join(work, "home");
  fs.mkdirSync(home, { recursive: true });
  const card = path.join(work, "card");
  fs.mkdirSync(card);
  const ages = [1200, 400, 120, 45, 5];
  for (const [i, age] of ages.entries())
    fs.writeFileSync(
      path.join(card, `IMG_${i}.JPG`),
      await sharp({
        create: { width: 400, height: 300, channels: 3, background: "#456" },
      })
        .jpeg()
        .withExif({ IFD2: { DateTimeOriginal: `${ymd(daysAgo(age))} 18:00:00` } })
        .toBuffer(),
    );
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
    const scan = async () => {
      await page.goto(BASE);
      await page.fill("[data-testid=source-input]", card);
      await page.click("[data-testid=scan-button]");
      await page.waitForSelector("[data-testid=scan-report]", { timeout: 300_000 });
    };
    const cards = () => page.locator("[data-testid=date-card]").count();
    await scan();
    console.log("\nShow dates from");
    check(
      "by default every date is shown",
      (await cards()) === 5,
      String(await cards()),
    );
    check(
      "the summary says all 5 dates",
      /Showing all 5 dates/.test(await page.textContent("[data-testid=since-summary]")),
    );
    await page.selectOption("[data-testid=since-select]", "90");
    check(
      "Last 90 days shows only the 2 recent dates",
      (await cards()) === 2,
      String(await cards()),
    );
    const summary = await page.textContent("[data-testid=since-summary]");
    check(
      "it says 2 of 5 are shown and the rest are hidden, not removed",
      /Showing 2 of 5 dates/.test(summary) && /hidden, not removed/.test(summary),
      summary,
    );
    await page.selectOption("[data-testid=since-select]", "30");
    check("Last 30 days shows 1 date", (await cards()) === 1);
    await page.selectOption("[data-testid=since-select]", "30");
    await page.selectOption("[data-testid=since-select]", "90");
    await scan();
    check(
      "the choice is remembered after scanning again",
      (await page.inputValue("[data-testid=since-select]")) === "90" &&
        (await cards()) === 2,
    );
    const copyText = await page.textContent("[data-testid=copy-panel]").catch(() => "");
    check(
      "Copy all counts only the 2 shown dates",
      /Copy all 2 dates/.test(copyText ?? ""),
      copyText?.slice(0, 200),
    );
    await page.selectOption("[data-testid=since-select]", "all");
    check("All dates brings everything back", (await cards()) === 5);
    await browser.close();
  } finally {
    app.kill();
  }
  console.log(failed === 0 ? "\nAll checks passed" : `\n${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
