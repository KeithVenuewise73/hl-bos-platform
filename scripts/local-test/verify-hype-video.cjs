/**
 * Drives 5-Star Hype Video end to end in a real browser against the running app.
 *
 * The unit tests prove the engine's decisions and the store's behaviour. This
 * proves the SHIPPED PAGES carry them: that the create form refuses a project
 * without consent, that a file pretending to be a photo is refused, that the
 * package states the athlete's real achievements and is labelled with what
 * wrote it, that the export downloads, that contact details are refused at
 * generation, that another site cannot post into a project, that the
 * not-connected buttons really are switched off, and that deleting a project
 * deletes its media from disk.
 *
 * Usage:
 *   pnpm --filter @hl-bos/hype-video-app build
 *   HYPE_DATA_DIR=/tmp/hype-data pnpm --filter @hl-bos/hype-video-app start
 *   HYPE_DATA_DIR=/tmp/hype-data node scripts/local-test/verify-hype-video.cjs http://127.0.0.1:4602
 *
 * Needs playwright and a chromium. Not part of `pnpm check`: it requires a
 * running server.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const BASE = (process.argv[2] || "http://127.0.0.1:4602").replace(/\/$/, "");
const EXE =
  process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const DATA_DIR = process.env.HYPE_DATA_DIR || null;
const SHOTS = process.env.HYPE_SCREENSHOTS || null;

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`  OK    ${name}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    failures += 1;
  }
}

async function shot(page, name) {
  if (SHOTS === null) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

(async () => {
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch {
    ({ chromium } = require(
      path.join(
        require("node:child_process").execSync("npm root -g").toString().trim(),
        "playwright",
      ),
    ));
  }
  const browser = await chromium.launch({ executablePath: EXE });
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hype-verify-"));

  // A real JPEG, made by the browser itself, and an HTML file wearing a .jpg name.
  await page.setContent(
    '<div style="width:480px;height:600px;background:linear-gradient(135deg,#e11d2e,#111);color:#fff;font:900 64px sans-serif;display:flex;align-items:center;justify-content:center">#23</div>',
  );
  const realJpg = path.join(tmp, "jordan.jpg");
  await page.locator("div").screenshot({ path: realJpg, type: "jpeg" });
  const fakeJpg = path.join(tmp, "not-a-photo.jpg");
  fs.writeFileSync(fakeJpg, "<html><script>alert(1)</script></html>".padEnd(64, " "));

  console.log("Dashboard");
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  check(
    "create form is on the first screen",
    (await page.locator('input[name="name"]').count()) === 1,
  );
  await shot(page, "01-dashboard");

  await page.fill('input[name="name"]', "Jordan — Game Day vs. Central");
  await page.getByRole("button", { name: /Create hype project/ }).click();
  await page.locator('.notice[role="alert"]').waitFor({ timeout: 15000 });
  const refused = await page
    .locator('.notice[role="alert"]')
    .innerText()
    .catch(() => "");
  check(
    "refuses a project with no rights confirmation",
    /right to use/i.test(refused),
    refused,
  );
  check(
    "refuses a minor's project with no guardian consent",
    /parent or guardian/i.test(refused),
    refused,
  );
  check("stays on the dashboard when refused", new URL(page.url()).pathname === "/");
  check(
    "keeps what was typed after a refusal",
    (await page.inputValue('input[name="name"]')) === "Jordan — Game Day vs. Central",
  );

  await page.locator('input[name="mediaRightsConfirmed"]').check();
  await page.locator('input[name="guardianConsentConfirmed"]').check();
  await page.fill('input[name="guardianName"]', "Maria Reyes");
  await page.getByRole("button", { name: /Create hype project/ }).click();
  await page
    .waitForURL(/\/projects\/[0-9a-f-]{36}\/media$/, { timeout: 15000 })
    .catch(async (e) => {
      await shot(page, "zz-create-failed");
      console.log(await page.locator("form").first().innerText());
      throw e;
    });
  const projectId = page.url().match(/projects\/([0-9a-f-]{36})/)[1];
  check("creates the project and goes to upload", projectId.length === 36);

  console.log("Upload");
  await page.setInputFiles('input[name="files"]', fakeJpg);
  await page.getByRole("button", { name: "Upload" }).click();
  await page.waitForLoadState("networkidle");
  const uploadError = await page
    .locator('.notice[role="alert"]')
    .innerText()
    .catch(() => "");
  check(
    "refuses an HTML file named .jpg",
    /isn't a supported photo or video/.test(uploadError),
    uploadError,
  );

  await page.setInputFiles('input[name="files"]', realJpg);
  await page.getByRole("button", { name: "Upload" }).click();
  await page.waitForLoadState("networkidle");
  check("accepts a real photo", (await page.locator(".media-tile").count()) === 1);
  const imgSrc = await page.locator(".media-tile img").getAttribute("src");
  const media = await page.request.get(`${BASE}${imgSrc}`);
  check(
    "serves it back as image/jpeg",
    media.headers()["content-type"] === "image/jpeg",
  );
  check(
    "never caches it outside this browser",
    /no-store/.test(media.headers()["cache-control"] || ""),
  );
  await shot(page, "02-media");

  const crossSite = await fetch(`${BASE}/api/projects/${projectId}/media`, {
    method: "POST",
    headers: {
      origin: "https://evil.example",
      "content-type": "multipart/form-data; boundary=x",
    },
    body: "--x--",
  });
  check(
    "refuses an upload posted from another site",
    crossSite.status === 403,
    String(crossSite.status),
  );

  console.log("Athlete details");
  await page.getByRole("link", { name: /Next: athlete details/ }).click();
  await page.waitForURL(/\/details$/);
  await page.getByRole("button", { name: /Save & choose template/ }).click();
  await page.waitForURL(/check=1/);
  check(
    "marks missing required fields",
    (await page.locator(".field-error").count()) === 3,
  );

  await page.fill('input[name="athleteName"]', "Jordan Reyes");
  await page.fill('input[name="sport"]', "Basketball");
  await page.fill('input[name="teamOrSchool"]', "Lincoln High Lions");
  await page.fill('input[name="jerseyNumber"]', "23");
  await page.fill('input[name="position"]', "Point Guard");
  await page.fill('input[name="classYearOrAgeGroup"]', "Class of 2027");
  await page.fill('input[name="sponsorName"]', "Main Street Pizza");
  await page.fill(
    'textarea[name="achievements"]',
    "Scored 31 points against Central\nTeam captain\nAll-Conference second team",
  );
  await page.fill(
    'textarea[name="personalityNotes"]',
    "Quiet leader who lets the game do the talking.",
  );
  await shot(page, "03-details");
  await page.getByRole("button", { name: /Save & choose template/ }).click();
  await page.waitForURL(/\/template$/);
  check("complete details move on to the template step", true);

  console.log("Template");
  await page.locator('input[name="template"][value="athlete_spotlight"]').check();
  await page.locator('input[name="tone"][value="cinematic"]').check();
  await page.locator('input[name="accent"][value="gold"]').check();
  await shot(page, "04-template");
  await page.getByRole("button", { name: /go to hype package/ }).click();
  await page.waitForURL(new RegExp(`/projects/${projectId}$`));

  console.log("Generate");
  const genButtons = page.getByRole("button", { name: /Generate hype package/ });
  check("generate is enabled once details are complete", await genButtons.isEnabled());
  await genButtons.click();
  await page.locator(".block").first().waitFor({ timeout: 20000 });
  const body = await page.locator("main").innerText();
  check(
    "title uses the athlete",
    body.includes("SPOTLIGHT: JORDAN REYES"),
    body.slice(0, 200),
  );
  check(
    "states an entered achievement",
    body.includes("Scored 31 points against Central."),
  );
  check("says what wrote it", body.includes("template writer (not AI)"));
  check(
    "includes the sponsor line",
    body.includes("brought to you by Main Street Pizza"),
  );
  for (const heading of [
    "15-SECOND SCRIPT",
    "30-SECOND SCRIPT",
    "VOICEOVER NARRATION",
    "SOCIAL CAPTION",
    "HASHTAGS",
    "ON-SCREEN TEXT",
    "AI VIDEO PROMPT",
    "AI MUSIC PROMPT",
  ]) {
    check(`shows ${heading.toLowerCase()}`, body.toUpperCase().includes(heading));
  }
  check(
    "uses the chosen accent",
    (await page.locator('[data-accent="gold"]').count()) > 0,
  );
  for (const name of ["Generate Video", "Generate Music", "Create Voiceover"]) {
    const b = page.getByRole("button", { name, exact: true });
    check(
      `"${name}" is present and switched off`,
      (await b.count()) === 1 && (await b.isDisabled()),
    );
  }
  await shot(page, "05-package");

  console.log("Export");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /Export Package/ }).click(),
  ]);
  const exported = fs.readFileSync(await download.path(), "utf8");
  check(
    "export downloads a .txt",
    download.suggestedFilename().endsWith(".txt"),
    download.suggestedFilename(),
  );
  check(
    "export contains the whole package",
    exported.includes("30-SECOND SCRIPT") && exported.includes("AI MUSIC PROMPT"),
  );
  await page.reload({ waitUntil: "networkidle" });
  check(
    "project is now marked exported",
    (await page.locator(".badge.exported").count()) === 1,
  );

  console.log("Refusals at generation");
  await page.goto(`${BASE}/projects/${projectId}/details`, {
    waitUntil: "networkidle",
  });
  await page.fill(
    'textarea[name="personalityNotes"]',
    "Text his mom at 555-867-5309 for highlights",
  );
  await page.getByRole("button", { name: /Save & choose template/ }).click();
  await page.waitForURL(/\/template$/);
  await page.goto(`${BASE}/projects/${projectId}`, { waitUntil: "networkidle" });
  check(
    "flags the package as out of date after details change",
    (await page.locator("text=Generate again to update it").count()) === 1,
  );
  await page.getByRole("button", { name: /Generate again/ }).click();
  await page.locator('.notice[role="alert"]').waitFor({ timeout: 20000 });
  const alert = await page
    .locator('.notice[role="alert"]')
    .innerText()
    .catch(() => "");
  check(
    "refuses to write a package containing a phone number",
    /phone number/i.test(alert),
    alert,
  );
  check("does not echo the number back", !alert.includes("5309"), alert);

  console.log("Pages");
  await page.goto(`${BASE}/projects`, { waitUntil: "networkidle" });
  check("project history lists it", (await page.locator(".project-row").count()) === 1);
  await page.goto(`${BASE}/pricing`, { waitUntil: "networkidle" });
  const pricing = await page.locator("main").innerText();
  check(
    "pricing shows the planned prices",
    ["$4.99", "$9.99/mo", "$29.95/mo", "$99–$299"].every((p) => pricing.includes(p)),
  );
  check(
    "upgrade buttons are switched off",
    (await page.locator("button:disabled", { hasText: "Upgrade" }).count()) === 4,
  );
  await shot(page, "06-pricing");

  const phone = await browser.newPage({ viewport: { width: 375, height: 800 } });
  for (const route of [
    "/",
    `/projects/${projectId}`,
    `/projects/${projectId}/template`,
    "/pricing",
  ]) {
    await phone.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    const overflow = await phone.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check(`no sideways scrolling on a phone: ${route}`, overflow <= 0, `${overflow}px`);
  }
  await phone.goto(`${BASE}/projects/${projectId}`, { waitUntil: "networkidle" });
  if (SHOTS !== null)
    await phone.screenshot({
      path: path.join(SHOTS, "07-package-phone.png"),
      fullPage: true,
    });
  await phone.close();

  console.log("Delete");
  await page.goto(`${BASE}/projects/${projectId}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Delete project/ }).click();
  await page.waitForURL(/deleted=1/);
  check(
    "delete returns to history",
    (await page.locator(".project-row").count()) === 0,
  );
  if (DATA_DIR !== null) {
    check(
      "the project's media is gone from disk",
      !fs.existsSync(path.join(DATA_DIR, "media", projectId)),
    );
  }
  const gone = await page.request.get(`${BASE}${imgSrc}`);
  check(
    "its media URL no longer serves anything",
    gone.status() === 404,
    String(gone.status()),
  );

  await browser.close();
  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
