/**
 * Proves that guessing the access code gets slower, in the running app.
 *
 * On the home Wi-Fi a six-digit code was a reasonable lock. Reachable from
 * outside the house it is not, unless guessing costs something — a million
 * combinations is minutes of work for a script that can guess without pausing.
 * throttle.ts makes it cost something; this proves the SHIPPED unlock screen
 * actually applies it, because a delay that only exists in a pure function is
 * not a delay.
 *
 * The check that matters most is the third one: the CORRECT code must also be
 * refused while a wait is running. If it were not, an attacker would walk
 * straight past the delay on the one attempt that counts.
 *
 * Usage:
 *   pnpm --filter @hl-bos/sceneflow-app build
 *   pnpm --filter @hl-bos/sceneflow-app start   # serves on :4100
 *   node scripts/local-test/verify-sceneflow-throttle.cjs http://127.0.0.1:4100
 *
 * It sets .sceneflow/access-code.txt and restores it afterwards. Takes about a
 * minute: most of it is waiting out a wait it deliberately provoked.
 *
 * Needs playwright and a chromium. Not part of `pnpm check`: it needs a running
 * server, and a gate that cannot run in CI is a gate that gets ignored.
 */
const fs = require("node:fs");
const path = require("node:path");

const BASE = (process.argv[2] || "http://127.0.0.1:4100").replace(/\/$/, "");
const EXE =
  process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const CODE_FILE = path.join(__dirname, "..", "..", ".sceneflow", "access-code.txt");
const CODE = "713904";
/** The ceiling in throttle.ts, plus a second. */
const DRAIN_MS = 31_000;

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`  OK    ${name}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    failures += 1;
  }
}

(async () => {
  const saved = (() => {
    try {
      return fs.readFileSync(CODE_FILE, "utf-8");
    } catch {
      return null;
    }
  })();

  const { chromium } = require("playwright");
  const browser = await chromium.launch({ executablePath: EXE });
  const page = await browser.newPage();

  try {
    console.log(`SceneFlow throttle verification against ${BASE}`);
    console.log("-".repeat(63));

    fs.mkdirSync(path.dirname(CODE_FILE), { recursive: true });
    fs.writeFileSync(CODE_FILE, `${CODE}\n`, "utf-8");
    await page.goto(BASE, { waitUntil: "networkidle" });

    const field = 'input[aria-label="Access code"]';
    async function guess(code, settle = 650) {
      await page.fill(field, code);
      await page.getByRole("button", { name: /Unlock/ }).click();
      await page.waitForTimeout(settle);
      return page.locator("main p").first().innerText();
    }

    check(
      "the app is locked, so there is something to guess at",
      (await page.locator(field).count()) === 1,
    );

    // Guess wrong enough times that a wait is certainly running, whatever the
    // counter was before this script started.
    const said = [];
    for (let i = 0; i < 10; i += 1) said.push(await guess("000000"));

    check(
      "wrong codes eventually stop being answered immediately",
      said.some((m) => /Too many wrong codes/.test(m)),
      said[said.length - 1],
    );

    const stated = said
      .map((m) => /Wait (\d+) seconds/.exec(m))
      .filter((m) => m !== null)
      .map((m) => Number(m[1]));
    check(
      "and the wait grows rather than staying a fixed pause",
      stated.length > 0 && Math.max(...stated) >= 4,
      `longest stated wait was ${stated.length ? `${Math.max(...stated)}s` : "none"}`,
    );

    const during = await guess(CODE);
    check(
      "the RIGHT code is refused too while a wait is running",
      /Too many wrong codes/.test(during),
      during,
    );
    check(
      "and the visitor is still on the unlock screen",
      (await page.locator(field).count()) === 1,
    );

    // It has to be a delay, not a lockout: a stranger guessing must not be able
    // to keep the owner out of his own photographs.
    console.log(`  ..    waiting ${DRAIN_MS / 1000}s for the wait to expire`);
    await page.waitForTimeout(DRAIN_MS);
    await guess(CODE, 1500);
    await page.waitForTimeout(1500);
    check(
      "once it expires the right code still gets in",
      /Direct a scene/.test(await page.locator("body").innerText()),
    );
  } finally {
    await browser.close();
    if (saved === null) {
      try {
        fs.unlinkSync(CODE_FILE);
      } catch {
        /* it was not there to begin with */
      }
    } else {
      fs.writeFileSync(CODE_FILE, saved, "utf-8");
    }
  }

  console.log("-".repeat(63));
  console.log(failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error("verification could not run:", e.message);
  process.exit(1);
});
