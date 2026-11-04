/* eslint-disable */
// End-to-end check of the HLG TMS Release 1 prototype in a real browser.
//
//   (cd apps/tms && pnpm build && pnpm start) &   # http://127.0.0.1:4610
//   node scripts/local-test/verify-tms.cjs [screenshot-dir]
//
// Walks the four acceptance workflows of the Phase 5 brief, plus the refusals,
// against the RUNNING app. Prints PASS/FAIL per check and exits non-zero on any
// failure. Uses only synthetic demo data; restart the app for a clean run.

const { chromium, devices } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.env.TMS_URL || "http://127.0.0.1:4610";
const SHOTS = process.argv[2] || null;
const LAKESHORE = "8f1c2a6e-5b7d-4c1e-9a3f-1d2e3f4a5b6c";
let pass = 0;
let fail = 0;

function check(name, ok, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `  -> ${detail}`}`,
  );
}

async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

async function signIn(browser, email, opts = {}) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.click(`[data-user="${email}"]`);
  await page.waitForURL(`${BASE}/`);
  return { ctx, page };
}

async function api(page, op, args = {}) {
  return page.evaluate(
    async ([op, args]) => {
      const r = await fetch("/api/fleet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op, args }),
      });
      return { status: r.status, body: await r.json() };
    },
    [op, args],
  );
}

async function navKeys(page) {
  return page.$$eval("[data-nav]", (els) => els.map((e) => e.getAttribute("data-nav")));
}

async function lockedReason(page, url) {
  await page.goto(`${BASE}${url}`);
  const el = await page.$("[data-testid=locked]");
  return el ? el.getAttribute("data-reason") : null;
}

async function inspect(
  page,
  unit,
  { defect, phase = "Pre-trip", photo, ackRepairs = false } = {},
) {
  await page.goto(`${BASE}/driver`);
  await page.click(`[data-pick="${unit}"]`);
  await page.click(`[data-phase="${phase}"]`);
  await page.fill("[data-testid=odometer]", "120500");
  if (ackRepairs) await page.check("[data-testid=ack-repairs]");
  if (defect) {
    const item = page.locator(`[data-item="${defect.item}"]`);
    await item.locator('[data-result="Defect"]').click();
    await item.locator("[data-testid=severity]").selectOption(String(defect.level));
    await item.locator("[data-testid=defect-note]").fill(defect.note);
  }
  await page.click("[data-testid=all-pass]");
  if (photo)
    await page.setInputFiles("[data-testid=photo]", {
      name: "defect.jpg",
      mimeType: "image/jpeg",
      buffer: photo,
    });
  await page.fill("[data-testid=signature]", "Test Driver");
  await page.check("[data-testid=consent]");
}

async function defectAction(page, unit, kind, { level, resolution, note }) {
  const card = page.locator(`[data-defect-card="${unit}"]`).first();
  await card.locator(`[data-kind="${kind}"]`).click();
  if (level)
    await card.locator("[data-testid=assess-level]").selectOption(String(level));
  if (resolution)
    await card.locator("[data-testid=resolution]").selectOption(resolution);
  await card.locator("[data-testid=action-note]").fill(note);
  await card.locator("[data-testid=action-consent]").check();
  await card.locator("[data-testid=action-submit]").click();
  return card;
}

async function summary(page) {
  await page.goto(`${BASE}/dashboard`);
  const get = async (k) => (await page.textContent(`[data-k=${k}]`)).trim();
  return {
    oos: await get("oos"),
    defects: await get("defects"),
    completion: await get("completion"),
    available: await get("available"),
  };
}

(async () => {
  const browser = await chromium.launch();

  // ---- Signed-out visitors get nothing --------------------------------
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/dashboard`);
    check("signed-out visitor is sent to sign in", page.url().endsWith("/login"));
    const r = await page.evaluate(
      async () => (await fetch("/api/fleet", { method: "POST", body: "{}" })).status,
    );
    check("signed-out API call is refused (401)", r === 401, String(r));
    await ctx.close();
  }

  // ---- Workflow C baseline -------------------------------------------
  const morgan = await signIn(browser, "morgan@lakeshore.example.test");
  let s = await summary(morgan.page);
  check(
    "C: dashboard starts with the seeded level-2 defect: 1 out of service, 1 outstanding",
    s.oos === "1" && s.defects === "1",
    JSON.stringify(s),
  );
  await shot(morgan.page, "01-dashboard-before");

  // ---- Workflow A: driver on a phone ---------------------------------
  const dana = await signIn(browser, "dana@lakeshore.example.test", {
    ...devices["iPhone 13"],
  });
  check(
    "A: a driver's navigation offers only the inspection",
    JSON.stringify(await navKeys(dana.page)) === JSON.stringify(["driver_dvir"]),
    JSON.stringify(await navKeys(dana.page)),
  );
  check(
    "A: a driver cannot open the fleet list",
    (await lockedReason(dana.page, "/fleet")) === "role_not_allowed",
  );
  await dana.page.goto(`${BASE}/driver`);
  const picks = await dana.page.$$eval("[data-pick]", (els) =>
    els.map((e) => e.getAttribute("data-pick")),
  );
  check(
    "A: the driver sees only their assigned vehicles",
    JSON.stringify(picks) === '["T-101","T-102"]',
    JSON.stringify(picks),
  );
  const noHScroll = await dana.page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  check("A: the driver screen fits a phone without sideways scrolling", noHScroll);
  await dana.page.click('[data-pick="T-101"]');
  const items = await dana.page.$$eval("[data-item]", (els) => els.length);
  check(
    "A: a tanker gets the 16-item checklist (11 base + 5 tank)",
    items === 16,
    String(items),
  );

  // Submitting with an unanswered item is impossible from the form.
  await dana.page.fill("[data-testid=signature]", "Dana Driver");
  await dana.page.check("[data-testid=consent]");
  check(
    "A: submit stays disabled until every item is answered",
    await dana.page.isDisabled("[data-testid=submit-dvir]"),
  );

  const photoPage = await dana.ctx.newPage();
  await photoPage.setContent(
    "<div style='width:320px;height:200px;background:#b91c1c;color:#fff;font:40px sans-serif'>TIRE</div>",
  );
  const jpeg = await photoPage.screenshot({ type: "jpeg" });
  await photoPage.close();
  await inspect(dana.page, "T-101", {
    defect: { item: "Tires", level: 3, note: "Left steer tire cut to the cord" },
    photo: jpeg,
  });
  await shot(dana.page, "02-driver-dvir-mobile");
  await dana.page.click("[data-testid=submit-dvir]");
  await dana.page
    .waitForSelector("[data-testid=dvir-done]", { timeout: 10000 })
    .catch(() => null);
  const doneText = (await dana.page.textContent("body")) || "";
  check(
    "A: inspection with a defect and a photo is submitted",
    doneText.includes("Inspection submitted") &&
      doneText.includes("1 defect(s) reported"),
    (await dana.page.textContent("[data-testid=dvir-error]").catch(() => "")) || "",
  );
  await dana.page.click("text=View report");
  await dana.page.waitForSelector("[data-testid=report]");
  const imgOk = await dana.page
    .$eval("[data-testid=report] img", (i) => i.complete && i.naturalWidth > 0)
    .catch(() => false);
  check("A: the report shows the uploaded photo", imgOk);
  await shot(dana.page, "03-inspection-report");
  await dana.page.goto(`${BASE}/driver`);
  const t101 = await dana.page.textContent('[data-pick="T-101"]');
  check(
    "A: the driver now sees T-101 OUT OF SERVICE",
    t101.includes("Out of service"),
    t101,
  );

  // ---- Workflow C after the report -----------------------------------
  s = await summary(morgan.page);
  check(
    "C: the manager's board shows 2 out of service and 2 outstanding defects",
    s.oos === "2" && s.defects === "2",
    JSON.stringify(s),
  );
  check(
    "C: inspection completion counts today's report",
    s.completion.startsWith("1 of 4"),
    s.completion,
  );
  const row = await morgan.page.textContent('[data-unit="T-101"]');
  check("C: T-101 row reads Out of service", row.includes("Out of service"), row);
  await shot(morgan.page, "04-dashboard-after-defect");

  // ---- Workflow B: maintenance ---------------------------------------
  const max = await signIn(browser, "max@lakeshore.example.test");
  await max.page.goto(`${BASE}/defects`);
  await defectAction(max.page, "T-101", "acknowledge", {
    note: "Truck parked at yard, tire on order",
  });
  await max.page.waitForTimeout(500);
  await defectAction(max.page, "T-101", "assess", {
    level: 3,
    note: "Confirmed: cut to cord, replace",
  });
  await max.page.waitForTimeout(500);
  const card = await defectAction(max.page, "T-101", "certify", {
    resolution: "Repair unnecessary",
    note: "trying to skip the repair",
  });
  await max.page.waitForSelector("[data-testid=action-error]");
  const err = await card.locator("[data-testid=action-error]").textContent();
  check(
    "B: 'Repair unnecessary' is refused on a safety hold",
    err.includes("Safety holds require repair"),
    err,
  );
  await defectAction(max.page, "T-101", "certify", {
    resolution: "Repaired",
    note: "Mounted new 295/75R22.5, torqued to spec",
  });
  await max.page
    .waitForSelector('[data-defect-card="T-101"][data-state="certified"]', {
      state: "attached",
      timeout: 5000,
    })
    .catch(() => null);
  await max.page.goto(`${BASE}/defects`);
  await max.page.click("text=all");
  const state = await max.page.getAttribute('[data-defect-card="T-101"]', "data-state");
  check("B: the repair is certified", state === "certified", state);
  await shot(max.page, "05-defect-certified");
  await max.page.goto(`${BASE}/maintenance?unit=T-101`);
  await max.page.fill("[data-testid=svc-title]", "Replace left steer tire");
  await max.page.fill("[data-testid=svc-cost]", "412.50");
  await max.page.click("[data-testid=svc-save]");
  await max.page.waitForSelector("[data-testid=service-records]");
  const svc = await max.page.textContent("[data-testid=service-records]");
  check(
    "B: the repair cost is recorded against T-101",
    svc.includes("Replace left steer tire") && svc.includes("$412.50"),
    svc,
  );
  check(
    "B: maintenance cannot open company setup",
    (await lockedReason(max.page, "/setup")) === "role_not_allowed",
  );

  s = await summary(morgan.page);
  check(
    "B/C: T-101 is back in service on the board (1 out of service left: T-102)",
    s.oos === "1" && s.defects === "1",
    JSON.stringify(s),
  );

  // Driver must acknowledge the certified repair before the next pre-trip.
  await inspect(dana.page, "T-101", {});
  const review = await dana.page.$("[data-testid=review-prior]");
  check(
    "B: the driver is shown the repair certification before the next trip",
    !!review,
  );
  check(
    "B: and cannot submit without acknowledging it",
    await dana.page.isDisabled("[data-testid=submit-dvir]"),
  );
  await dana.page.check("[data-testid=ack-repairs]");
  await dana.page.click("[data-testid=submit-dvir]");
  await dana.page
    .waitForSelector("[data-testid=dvir-done]", { timeout: 10000 })
    .catch(() => null);
  check(
    "B: after acknowledging, the clean pre-trip is accepted",
    !!(await dana.page.$("[data-testid=dvir-done]")),
  );

  // ---- Workflow D: a DVIR-only company -------------------------------
  const sam = await signIn(browser, "sam@twotrucks.example.test");
  const nav = await navKeys(sam.page);
  check(
    "D: DVIR-only owner's navigation",
    JSON.stringify(nav) ===
      JSON.stringify(["driver_dvir", "defects", "setup", "modules"]),
    JSON.stringify(nav),
  );
  for (const url of [
    "/fleet",
    "/fleet/TT-1",
    "/dashboard",
    "/drivers",
    "/maintenance",
  ]) {
    check(
      `D: ${url} is refused as not licensed`,
      (await lockedReason(sam.page, url)) === "not_licensed",
    );
  }
  await shot(sam.page, "06-locked-not-licensed");
  await sam.page.goto(`${BASE}/setup`);
  await sam.page.fill("[data-testid=unit-id]", "TT-3");
  await sam.page.fill("[data-testid=unit-name]", "Truck 3");
  await sam.page.click("[data-testid=unit-add]");
  await sam.page
    .waitForSelector('[data-reg="TT-3"]', { timeout: 5000 })
    .catch(() => null);
  check(
    "D: the DVIR-only company adds a vehicle to the shared registry",
    !!(await sam.page.$('[data-reg="TT-3"]')),
  );
  await shot(sam.page, "07-dvir-only-setup");
  let r = await api(sam.page, "submit_service", {
    record: {
      id: "SRV-abcdef12",
      asset: "TT-1",
      category: "Repair",
      title: "x",
      date: "2026-11-01",
      costCents: "1",
    },
  });
  check(
    "D: the API refuses a maintenance record (403)",
    r.status === 403,
    JSON.stringify(r),
  );
  const snap = (await api(sam.page, "snapshot")).body.result;
  r = await api(sam.page, "save_fleet", {
    revision: snap.state.revision,
    fleet: {
      ...snap.state.payload,
      work: [{ id: "WO-sneak", asset: "TT-1", status: "Open" }],
    },
  });
  check(
    "D: work orders cannot be smuggled in through the vehicle registry (403)",
    r.status === 403 && /work/.test(r.body.error),
    JSON.stringify(r),
  );
  r = await api(sam.page, "snapshot", { workspace: LAKESHORE });
  const ids = r.body.result.state.payload.assets.map((a) => a.id);
  check(
    "D: naming another company's id still returns only your own vehicles",
    JSON.stringify(ids) === '["TT-1","TT-2","TT-3"]',
    JSON.stringify(ids),
  );
  await sam.page.goto(`${BASE}/modules`);
  const caps = await sam.page.$$eval("[data-cap][data-on=true]", (els) =>
    els.map((e) => e.getAttribute("data-cap")),
  );
  check(
    "D: the vehicle and driver registries are included without Fleet/Driver Management",
    caps.includes("vehicle_registry") && caps.includes("driver_registry"),
    JSON.stringify(caps),
  );
  check(
    "D: modules that are not built cannot be switched on",
    await sam.page.isDisabled('[data-toggle="dispatch"]'),
  );
  r = await sam.page.evaluate(
    async () =>
      (
        await fetch("/api/demo", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "license", modules: ["dvir", "dispatch"] }),
        })
      ).status,
  );
  check(
    "D: the server refuses to license an unbuilt module (422)",
    r === 422,
    String(r),
  );
  await shot(sam.page, "08-modules");

  const riley = await signIn(browser, "riley@twotrucks.example.test", {
    ...devices["Pixel 7"],
  });
  await inspect(riley.page, "TT-1", {});
  await riley.page.click("[data-testid=submit-dvir]");
  await riley.page
    .waitForSelector("[data-testid=dvir-done]", { timeout: 10000 })
    .catch(() => null);
  check(
    "D: the DVIR-only company's driver completes an inspection",
    !!(await riley.page.$("[data-testid=dvir-done]")),
  );

  // Activation: switch Maintenance on, the screen opens; switch it off, it closes.
  await sam.page.goto(`${BASE}/modules`);
  await sam.page.check('[data-toggle="maintenance"]');
  await sam.page.click("[data-testid=save-modules]");
  await sam.page.waitForTimeout(500);
  await sam.page.goto(`${BASE}/maintenance`);
  check(
    "D: activating Maintenance opens the maintenance screen",
    !(await sam.page.$("[data-testid=locked]")) &&
      sam.page.url().endsWith("/maintenance"),
  );
  await sam.page.goto(`${BASE}/modules`);
  await sam.page.uncheck('[data-toggle="maintenance"]');
  await sam.page.click("[data-testid=save-modules]");
  await sam.page.waitForTimeout(500);
  check(
    "D: deactivating it closes the screen again",
    (await lockedReason(sam.page, "/maintenance")) === "not_licensed",
  );

  check(
    "every page carries the synthetic-data banner",
    ((await sam.page.textContent("[data-testid=demo-banner]")) || "").includes(
      "synthetic data",
    ),
  );

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
