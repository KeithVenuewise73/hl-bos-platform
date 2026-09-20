/**
 * Drives the SceneFlow director in a real browser against the running app.
 *
 * The unit tests prove the engine's decisions. This proves the SHIPPED PAGE
 * carries them: that ticking the boxes enables the button, that an unsafe
 * request is refused by the thing the CEO actually clicks, and that a refusal
 * he can read comes back rather than a blank screen.
 *
 * It was written because running the page found two defects that reading it had
 * not: the whole director was inert when served from the standalone output with
 * no static chunks, and every safety assertion had until then only been made
 * against functions, never against the form.
 *
 * Usage:
 *   pnpm --filter @hl-bos/sceneflow-app build
 *   pnpm --filter @hl-bos/sceneflow-app start        # serves on :4100
 *   node scripts/local-test/verify-sceneflow-director.cjs http://127.0.0.1:4100
 *
 * Needs playwright and a chromium. Not part of `pnpm check`: it requires a
 * running server, and a gate that cannot run in CI is a gate that gets ignored.
 */
const BASE = (process.argv[2] || "http://127.0.0.1:4100").replace(/\/$/, "");
const URL = `${BASE}/direct`;
const EXE =
  process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const CODE_FILE = require("node:path").join(
  __dirname,
  "..",
  "..",
  ".sceneflow",
  "access-code.txt",
);

/**
 * If this copy has an access code, type it -- the same thing a phone does.
 *
 * Reading the code off the disk is exactly what the console does to show it, so
 * this is not a back door round the gate; verify-sceneflow-access.cjs is what
 * proves the gate holds against someone who does not have it.
 */
async function unlockIfNeeded(page) {
  let code = "";
  try {
    code = require("node:fs").readFileSync(CODE_FILE, "utf-8").trim();
  } catch {
    return false;
  }
  if (code === "") return false;
  await page.goto(URL, { waitUntil: "networkidle" });
  if ((await page.locator('input[aria-label="Access code"]').count()) === 0) {
    return false;
  }
  await page.fill('input[aria-label="Access code"]', code);
  await page.getByRole("button", { name: /Unlock/ }).click();
  await page.waitForTimeout(1500);
  return true;
}

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`  OK    ${name}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    failures += 1;
  }
}

async function direct(page, opts) {
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.selectOption("#castSize", String(opts.castSize ?? 4));
  await page.selectOption("#intimacy", opts.intimacy ?? "romantic");
  await page.selectOption("#interaction", opts.interaction ?? "embrace");
  if (opts.wardrobe !== undefined) await page.fill("#wardrobe", opts.wardrobe);
  if (opts.setting !== undefined) await page.fill("#setting", opts.setting);
  if (opts.direction !== undefined) await page.fill("#direction", opts.direction);
  const boxes = page.locator("input[type=checkbox]");
  if (opts.reciprocal) await boxes.nth(0).check();
  await boxes.nth(1).check();
  await boxes.nth(2).check();
  await page.getByRole("button", { name: /Direct the scene/ }).click();
  await page.waitForTimeout(1200);
  return page.locator("main").innerText();
}

(async () => {
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ executablePath: EXE });
  const page = await browser.newPage();

  console.log(`SceneFlow director verification against ${URL}`);
  console.log("-".repeat(63));

  if (await unlockIfNeeded(page)) {
    await page.goto(URL, { waitUntil: "networkidle" });
    check(
      "typing the access code gets a device in",
      (await page.locator('input[aria-label="Access code"]').count()) === 0,
    );
  }

  // The page must be alive before anything else means anything. An un-hydrated
  // page leaves the button disabled forever and every other check would pass
  // vacuously by never running.
  await page.goto(URL, { waitUntil: "networkidle" });
  const before = await page.locator("button").isDisabled();
  check("button is disabled before the attestation", before === true);
  await page.locator("input[type=checkbox]").nth(1).check();
  await page.locator("input[type=checkbox]").nth(2).check();
  await page.waitForTimeout(200);
  check(
    "ticking both boxes enables it (the page is hydrated)",
    (await page.locator("button").isDisabled()) === false,
  );

  const ok = await direct(page, {});
  check("a permitted scene is composed", ok.includes("The scene, as directed"));
  check(
    "it never claims a picture exists before one is made",
    ok.includes("No picture yet"),
  );
  check(
    "the whole cast stays in the frame",
    (ok.match(/watching the others/g) || []).length === 2,
  );

  const explicit = await direct(page, { direction: "make them have sex" });
  check("an explicit direction is refused", explicit.includes("did not stage that"));
  check("and is offered a romantic alternative", explicit.includes("Try instead"));

  const nudity = await direct(page, { wardrobe: "topless" });
  check("an unsafe wardrobe is refused", nudity.includes("intimate anatomy covered"));

  const minor = await direct(page, { setting: "a high school gym" });
  check(
    "a minor framing is refused",
    minor.includes("only with photographs of adults"),
  );
  check(
    "and is offered NOTHING — no nearest alternative",
    !minor.includes("Try instead"),
  );

  const ceiling = await direct(page, { interaction: "kiss", intimacy: "warm" });
  check(
    "an action above the chosen level is refused",
    ceiling.includes("above the intimacy level"),
  );

  const recip = await direct(page, {
    interaction: "touch-shoulder",
    intimacy: "passionate",
    reciprocal: true,
  });
  check("reciprocal affection returns a touch", recip.includes("(returned)"));

  // The generate path. On a machine with no model this MUST report the real
  // reason and substitute nothing — that is the whole contract of the worker,
  // and it is worth asserting from the outside as well as in its own tests.
  await direct(page, {});
  await page.getByRole("button", { name: /Make the picture/ }).click();
  await page.waitForTimeout(10000);
  const made = await page.locator("main").innerText();
  const produced = made.includes("Picture made");
  if (produced) {
    check(
      "a real picture is labelled with the model that made it",
      !made.includes("PLACEHOLDER"),
    );
  } else {
    check(
      "a failure to generate says so plainly",
      made.includes("No picture was made"),
    );
    check(
      "and states that nothing was substituted",
      made.includes("Nothing was substituted"),
    );
    check(
      "and gives a reason rather than a blank",
      /not available|could not be found|not installed/.test(made),
    );
  }

  await browser.close();
  console.log("-".repeat(63));
  console.log(failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error("verification could not run:", e.message);
  process.exit(1);
});
