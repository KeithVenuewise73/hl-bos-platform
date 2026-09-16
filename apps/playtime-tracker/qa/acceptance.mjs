/**
 * The QA acceptance run, executed against the real production build in a real
 * browser. Every step below is one of the acceptance tests in the brief.
 *
 * Long waits are handled with Playwright's clock control, which replaces the
 * page's own Date and timers. That is exactly the right instrument here: the
 * whole claim under test is "durations come from recorded instants, not from a
 * timer that has to keep running", so moving the clock forward twelve minutes
 * without running any of the app's code is the strongest form of the test --
 * it is indistinguishable from the app having been suspended.
 */
import { chromium, devices } from "playwright";

const BASE = process.env.PLAYTIME_QA_URL ?? "http://127.0.0.1:4700";

/**
 * Where to find a Chromium. Set PLAYWRIGHT_CHROMIUM_PATH when the browser is
 * provisioned outside Playwright's own download cache; otherwise Playwright
 * uses the one it manages (`npx playwright install chromium`).
 */
const EXECUTABLE = process.env["PLAYWRIGHT_CHROMIUM_PATH"] ?? null;
const results = [];
let failures = 0;

function check(name, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures += 1;
  results.push(
    `${pass ? "ok  " : "FAIL"}  ${name}${pass ? "" : `\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`,
  );
  return pass;
}

function checkThat(name, condition, detail = "") {
  if (!condition) failures += 1;
  results.push(
    `${condition ? "ok  " : "FAIL"}  ${name}${condition ? "" : `\n        ${detail}`}`,
  );
  return condition;
}

const START = Date.parse("2026-09-12T13:00:00.000Z");

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
const context = await browser.newContext({
  ...devices["iPhone 13"],
  baseURL: BASE,
});
let page = await context.newPage();
let elapsedMs = 0; // total game time we have deliberately advanced
const installClock = async (p) => {
  await p.clock.install({ time: new Date(START + elapsedMs) });
  await p.clock.pauseAt(new Date(START + elapsedMs));
};
const advance = async (seconds) => {
  elapsedMs += seconds * 1000;
  await page.clock.fastForward(seconds * 1000);
  await page.waitForTimeout(60);
};
await installClock(page);

const errors = []; // anything the browser complained about
const pageErrors = []; // uncaught JavaScript only
const watch = (p) => {
  p.on("pageerror", (e) => {
    errors.push(String(e));
    pageErrors.push(String(e));
  });
  p.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
};
watch(page);
// --- 1. Reach the app ------------------------------------------------------
await page.goto("/");
await page.waitForSelector("h2:has-text('My teams')");
checkThat(
  "app loads and shows the empty state",
  (await page.locator(".empty h3").innerText()) === "No teams yet",
);

// --- 2. Create a football team --------------------------------------------
await page.getByRole("link", { name: "Create a team" }).click();
await page.getByLabel("Team name").fill("Orchard Park U12");
await page.getByLabel("Sport").selectOption("football");
await page.getByRole("button", { name: "Create team" }).click();
await page.waitForSelector("h1:has-text('Orchard Park U12')");
checkThat("team created and its page opens", true);

// --- 3. Add 20 players -----------------------------------------------------
const NAMES = [
  "Dominic Herman",
  "Marcus Reed",
  "Eli Vance",
  "Noah Pike",
  "Owen Hale",
  "Liam Foss",
  "Caleb Nunez",
  "Jonah Reyes",
  "Miles Darcy",
  "Asher Quinn",
  "Levi Barnes",
  "Ezra Cole",
  "Silas Ward",
  "Rowan Tate",
  "Felix Marsh",
  "Jasper Kane",
  "Hugo Lane",
  "Otis Pryor",
  "Rhys Calder",
  "Emmett Shaw",
];
for (let i = 0; i < NAMES.length; i++) {
  const [first, last] = NAMES[i].split(" ");
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Add player" }) });
  await form.getByLabel("First name").fill(first);
  await form.getByLabel("Last name").fill(last);
  await form.getByLabel("Jersey").fill(String(i + 1));
  await form.getByRole("button", { name: "Add player" }).click();
}
const rosterCount = await page.locator(".card.row.tight").count();
check("20 players on the roster", rosterCount, 20);

// --- 4. Create a game ------------------------------------------------------
await page.getByRole("link", { name: "Start a new game" }).click();
await page.waitForSelector("h1:has-text('New game')");
await page.getByLabel("Opponent").fill("West Seneca");
await page.getByLabel("Quarters").fill("4");
await page.getByLabel("Minutes each").fill("12");
await page.getByLabel("Target").selectOption("percent");
await page.getByRole("spinbutton", { name: "Percent" }).fill("25");
checkThat(
  "game setup shows regulation time",
  (await page.locator("text=48 minutes of regulation time.").count()) === 1,
);
await page.getByRole("button", { name: "Create game" }).click();
await page.waitForSelector("text=START GAME");

const gameUrl = page.url();

// --- 5. Starting lineup, then start the clock ------------------------------
// Always take the first BENCHED athlete: a tile moves into the "On the field"
// section the moment it is tapped, so indexing the whole list would just
// toggle the same player on and off.
for (let i = 0; i < 11; i++)
  await page.locator("button.player:not(.on)").first().click();
const onFieldBefore = await page.locator("button.player.on").count();
check("eleven athletes on the field before kickoff", onFieldBefore, 11);
check("clock has not started", await page.locator(".clock .time").innerText(), "0:00");

await page.getByRole("button", { name: "START GAME" }).click();
await page.waitForSelector("text=PAUSE");

// --- 6. Two minutes of play ------------------------------------------------
await advance(120);
check(
  "clock reads two minutes",
  await page.locator(".clock .time").innerText(),
  "2:00",
);

// --- 7. Substitute repeatedly ---------------------------------------------
for (let round = 0; round < 4; round++) {
  for (let i = 0; i < 3; i++) {
    await page.locator("button.player.on").first().click();
    await page.locator("button.player:not(.on)").first().click();
  }
  await advance(120);
}
check(
  "clock reads ten minutes after four substitution rounds",
  await page.locator(".clock .time").innerText(),
  "10:00",
);
check("still eleven on the field", await page.locator("button.player.on").count(), 11);

// --- 8. Background the app and lock the phone ------------------------------
// No app code runs during this. The clock advances; nothing ticks.
await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
await advance(720);
await page.evaluate(() => {
  document.dispatchEvent(new Event("visibilitychange"));
  window.dispatchEvent(new Event("focus"));
});
await page.waitForTimeout(100);
check(
  "twelve backgrounded minutes are still counted",
  await page.locator(".clock .time").innerText(),
  "22:00",
);

// --- 9. Lose connectivity, keep tracking -----------------------------------
// Everything so far ran with a network. Assert cleanliness here, before the
// plug is pulled: an offline test is SUPPOSED to produce failed requests, and
// counting those would make the check meaningless.
checkThat(
  "no errors while connected",
  errors.length === 0,
  errors.slice(0, 5).join(" | "),
);

await context.setOffline(true);
await page.locator("button.player.on").first().click();
await page.locator("button.player:not(.on)").first().click();
await advance(120);
check(
  "substitutions still register with no network",
  await page.locator(".clock .time").innerText(),
  "24:00",
);
check(
  "eleven on the field after an offline substitution",
  await page.locator("button.player.on").count(),
  11,
);
await context.setOffline(false);

// --- 10. Kill the app entirely and relaunch --------------------------------
const clockBeforeKill = await page.locator(".clock .time").innerText();
await page.close();
page = await context.newPage();
await installClock(page);
watch(page);
await page.goto(gameUrl);
await page.waitForSelector(".clock .time");
await page.waitForTimeout(100);
check(
  "relaunching the app shows the identical clock",
  await page.locator(".clock .time").innerText(),
  clockBeforeKill,
);
check(
  "the field is intact after a relaunch",
  await page.locator("button.player.on").count(),
  11,
);

// --- 11. Halftime: a stoppage must not count -------------------------------
await page.getByRole("button", { name: "END QUARTER" }).click();
await page.waitForSelector("text=START QUARTER 2");
// Fifteen minutes of halftime. None of it may count.
await page.clock.fastForward(15 * 60 * 1000);
await page.waitForTimeout(60);
check(
  "halftime does not advance the game clock",
  await page.locator(".clock .time").innerText(),
  "24:00",
);
await page.getByRole("button", { name: "START QUARTER 2" }).click();
await advance(240);
check(
  "the clock resumes for the second quarter",
  await page.locator(".clock .time").innerText(),
  "28:00",
);

// --- 12. Pause and resume --------------------------------------------------
await page.getByRole("button", { name: "PAUSE" }).click();
await page.clock.fastForward(3 * 60 * 1000);
await page.waitForTimeout(60);
check(
  "a paused clock does not advance",
  await page.locator(".clock .time").innerText(),
  "28:00",
);
checkThat(
  "the app says the clock is stopped",
  (await page.locator("text=The clock is stopped").count()) === 1,
);
await page.getByRole("button", { name: "RESUME" }).click();
await advance(120);
check(
  "resuming restarts the clock",
  await page.locator(".clock .time").innerText(),
  "30:00",
);

// --- 13. Confirmation before ending the game -------------------------------
await page.getByRole("button", { name: "END GAME" }).click();
checkThat(
  "ending the game asks first",
  (await page.locator("text=End this game?").count()) === 1,
);
await page.getByRole("button", { name: "End the game" }).click();
await page.waitForURL("**/report/**");

// --- 14. The report --------------------------------------------------------
await page.waitForSelector("h1:has-text('Playtime report')");
const reportText = await page.locator("pre").innerText();
const rows = await page.locator(".report-row").count();
check("the report lists all twenty athletes", rows, 20);

const totals = await page.locator(".report-row .figures .big").allInnerTexts();
const toSeconds = (t) => {
  const parts = t.split(":").map(Number);
  return parts.length === 3
    ? parts[0] * 3600 + parts[1] * 60 + parts[2]
    : parts[0] * 60 + parts[1];
};
const summed = totals.reduce((a, t) => a + toSeconds(t), 0);
// Eleven athletes on the field for every second of 30:00 of tracked clock.
check("individual minutes sum to eleven full games", summed, 11 * 30 * 60);
checkThat(
  "the game clock in the report matches the tracker",
  reportText.includes("Game time tracked: 30:00"),
  reportText.split("\n").slice(0, 8).join(" | "),
);
checkThat(
  "the report carries the participation percentages",
  /Game participation: \d+%/.test(reportText),
);
checkThat(
  "the report states the target is the user's own",
  reportText.includes("not a league ruling"),
);
checkThat(
  "minimum status is shown per athlete",
  /Status: (Minimum met|Below minimum)/.test(reportText),
);

const below = (reportText.match(/Status: Below minimum/g) ?? []).length;
const met = (reportText.match(/Status: Minimum met/g) ?? []).length;
checkThat(
  "every athlete is classified against the 25% target",
  below + met === 20,
  `met=${met} below=${below}`,
);

// --- 15. Close and reopen; the game is in history --------------------------
await page.close();
page = await context.newPage();
await installClock(page);
watch(page);
await page.goto("/history/");
await page.waitForSelector("h1:has-text('Game history')");
checkThat(
  "the finished game appears in history",
  (await page.locator("text=vs West Seneca").count()) >= 1,
);
const historyLine = await page.locator(".card .muted").last().innerText();
checkThat(
  "history summarises the minimum outcome",
  /minimum/i.test(historyLine),
  historyLine,
);

// --- 16. Empty / offline / honesty states ----------------------------------
await page.goto("/account/");
await page.waitForSelector("h1:has-text('Account')");
checkThat(
  "the account screen states this build has no account service",
  (await page.locator("text=Not available in this build").count()) === 1,
);
checkThat(
  "erasing this device is reachable in-app",
  await page
    .getByRole("button", { name: "Erase everything on this device" })
    .isVisible(),
);
await page.goto("/legal/privacy/");
checkThat(
  "the privacy policy renders",
  (await page.locator("h1:has-text('Privacy Policy')").count()) === 1,
);
await page.goto("/legal/terms/");
checkThat(
  "the terms render",
  (await page.locator("h1:has-text('Terms of Use')").count()) === 1,
);
await page.goto("/support/");
checkThat(
  "the support page renders",
  (await page.locator("h1:has-text('Support')").count()) === 1,
);

await page.goto("/");
await page.waitForTimeout(600); // let the service worker finish precaching
await context.setOffline(true);
await page.reload();
await page
  .waitForSelector("h2:has-text('My teams')", { timeout: 10000 })
  .catch(() => {});
checkThat(
  "the app opens from a cold start with no network",
  (await page.locator("h2:has-text('My teams')").count()) === 1,
);

// A route this browser has never opened, with the network already gone. This
// is what the precache manifest is for; runtime caching alone would fail here.
await page.goto("/support/").catch(() => {});
await page.waitForTimeout(300);
checkThat(
  "an unvisited route still opens offline",
  (await page.locator("h1:has-text('Support')").count()) === 1,
);

await context.setOffline(false);

checkThat(
  "no uncaught JavaScript errors in the whole run",
  pageErrors.length === 0,
  pageErrors.slice(0, 5).join(" | "),
);

// The only browser complaints allowed are the ones the offline steps caused
// on purpose. Anything else would be a real defect hiding in the noise.
const unexplained = errors.filter(
  (e) => !/ERR_INTERNET_DISCONNECTED|Failed to fetch|NetworkError/i.test(e),
);
checkThat(
  "every remaining browser error is an expected offline one",
  unexplained.length === 0,
  unexplained.slice(0, 5).join(" | "),
);

await browser.close();

console.log(`\n1..${results.length}`);
for (const line of results) console.log(line);
console.log(`\n${results.length - failures} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
