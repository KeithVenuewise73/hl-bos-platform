/**
 * Produce store screenshots from the real application.
 *
 * Not mockups, and not a design file: the app is driven to a realistic state
 * and photographed. That means a screenshot can never show a feature the build
 * does not have, or a number the engine would not produce — which is exactly
 * the failure mode that gets a listing rejected, and worse, the one that
 * misleads someone into installing.
 *
 * The roster below is invented, because a screenshot of real children's names
 * has no business in a public listing. Nothing else is: the minutes, the
 * percentages and the statuses are all computed by the shipped engine from the
 * taps this script makes.
 *
 *   node scripts/serve.mjs out 4700 &
 *   node qa/screenshots.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.PLAYTIME_QA_URL ?? "http://127.0.0.1:4700";
const EXECUTABLE = process.env["PLAYWRIGHT_CHROMIUM_PATH"] ?? null;
const OUT = process.env.PLAYTIME_SHOTS ?? path.resolve("store/screenshots");

/**
 * The sizes each store asks for. Apple accepts a 6.7" iPhone set for every
 * modern device class; Google Play wants a phone set and a 7" tablet set.
 */
const TARGETS = [
  { name: "ios-6.7", width: 1290, height: 2796, scale: 3 },
  { name: "ios-6.5", width: 1242, height: 2688, scale: 3 },
  { name: "android-phone", width: 1080, height: 1920, scale: 3 },
  { name: "android-tablet-7", width: 1200, height: 1920, scale: 2 },
];

const ROSTER = [
  ["Dominic", "Herman", "22", "RB"],
  ["Marcus", "Reed", "18", "WR"],
  ["Eli", "Vance", "7", "QB"],
  ["Noah", "Pike", "44", "LB"],
  ["Owen", "Hale", "12", "WR"],
  ["Liam", "Foss", "56", "OL"],
  ["Caleb", "Nunez", "3", "DB"],
  ["Jonah", "Reyes", "88", "TE"],
  ["Miles", "Darcy", "30", "RB"],
  ["Asher", "Quinn", "5", "DB"],
  ["Levi", "Barnes", "71", "OL"],
  ["Ezra", "Cole", "9", "K"],
];

const browser = await chromium
  .launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {})
  .catch((err) => {
    console.error(
      "Could not start Chromium. Install one with `npx playwright install chromium`,\n" +
        "or point PLAYWRIGHT_CHROMIUM_PATH at an existing binary.\n\n" +
        String(err).split("\n")[0],
    );
    process.exit(2);
  });

mkdirSync(OUT, { recursive: true });
const START = Date.parse("2026-09-12T13:00:00.000Z");
const written = [];

for (const target of TARGETS) {
  const context = await browser.newContext({
    baseURL: BASE,
    viewport: {
      width: Math.round(target.width / target.scale),
      height: Math.round(target.height / target.scale),
    },
    deviceScaleFactor: target.scale,
    isMobile: true,
    hasTouch: true,
    colorScheme: "light",
  });
  const page = await context.newPage();
  // The clock is PAUSED after installation, so only these deliberate jumps
  // advance it and the screenshots show exact, reproducible times rather than
  // whatever the browser happened to take.
  await page.clock.install({ time: new Date(START) });
  await page.clock.pauseAt(new Date(START));
  const advance = async (seconds) => {
    await page.clock.fastForward(seconds * 1000);
    await page.waitForTimeout(60);
  };

  // --- Build a realistic game -------------------------------------------
  await page.goto("/");
  await page.getByRole("link", { name: "Create a team" }).click();
  await page.getByLabel("Team name").fill("Orchard Park U12");
  await page.getByLabel("Sport").selectOption("football");
  await page.getByRole("button", { name: "Create team" }).click();
  await page.waitForSelector("h1:has-text('Orchard Park U12')");

  const form = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Add player" }) });
  for (const [first, last, jersey, position] of ROSTER) {
    await form.getByLabel("First name").fill(first);
    await form.getByLabel("Last name").fill(last);
    await form.getByLabel("Jersey").fill(jersey);
    await form.getByLabel("Position").fill(position);
    await form.getByRole("button", { name: "Add player" }).click();
  }

  const shot = async (name) => {
    const file = path.join(OUT, `${target.name}-${name}.png`);
    await page.screenshot({ path: file });
    written.push(path.relative(process.cwd(), file));
  };

  await page.goto("/");
  await page.waitForSelector("h2:has-text('My teams')");
  await shot("1-teams");

  await page.locator("a.card").first().click();
  await page.getByRole("link", { name: "Start a new game" }).click();
  await page.getByLabel("Opponent").fill("West Seneca");
  await page.getByRole("spinbutton", { name: "Quarters" }).fill("4");
  await page.getByRole("spinbutton", { name: "Minutes each" }).fill("12");
  await page.getByLabel("Target").selectOption("percent");
  await page.getByRole("spinbutton", { name: "Percent" }).fill("25");
  await shot("2-game-setup");
  await page.getByRole("button", { name: "Create game" }).click();
  await page.waitForSelector("text=START GAME");

  for (let i = 0; i < 7; i++)
    await page.locator("button.player:not(.on)").first().click();
  await page.getByRole("button", { name: "START GAME" }).click();
  await advance(300);
  for (let i = 0; i < 2; i++) {
    await page.locator("button.player.on").first().click();
    await page.locator("button.player:not(.on)").first().click();
  }
  await advance(420);
  await page.getByRole("button", { name: "END QUARTER" }).click();
  await page.getByRole("button", { name: "START QUARTER 2" }).click();
  for (let i = 0; i < 3; i++) {
    await page.locator("button.player.on").first().click();
    await page.locator("button.player:not(.on)").first().click();
  }
  await advance(500);

  await page.evaluate(() => window.scrollTo(0, 0));
  await shot("3-live-tracker");

  await page.getByRole("button", { name: "END GAME" }).click();
  await page.getByRole("button", { name: "End the game" }).click();
  await page.waitForURL("**/report/**");
  await page.waitForSelector("h1:has-text('Playtime report')");
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot("4-report");

  await page.goto("/history/");
  await page.waitForSelector("h1:has-text('Game history')");
  await shot("5-history");

  await context.close();
}

await browser.close();
console.log(`wrote ${written.length} screenshots to ${OUT}`);
for (const f of written) console.log(`  ${f}`);
