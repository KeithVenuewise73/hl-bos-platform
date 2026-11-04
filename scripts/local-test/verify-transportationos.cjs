/* eslint-disable */
// End-to-end check of HSCS TransportationOS Release 1 in a real browser,
// against the running app AND the isolated PostgreSQL behind it.
//
//   bash scripts/local-test/tms-fleet-db.sh
//   psql -h /tmp/tmspg -p 5434 -U postgres -d tms_fleet -f scripts/local-test/seed-transportationos.sql
//   (cd apps/tms && pnpm build)
//   node scripts/local-test/verify-transportationos.cjs [screenshot-dir]
//
// The script starts and RESTARTS the app itself (to prove persistence). It
// reads the database directly with psql to prove records were written, not
// just shown. Synthetic data only.

const { chromium, devices } = require("playwright");
const { spawn, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const BASE = "http://127.0.0.1:4610";
const SHOTS = process.argv[2] || null;
const PASSWORD = "tms-demo-2026"; // development fixture for the local isolated database
const LAKESHORE = "8f1c2a6e-5b7d-4c1e-9a3f-1d2e3f4a5b6c";
const TWOTRUCKS = "3a9e7c1b-2d4f-4e6a-8b0c-9d1e2f3a4b5c";
let pass = 0;
let fail = 0;
let server = null;

function check(name, ok, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `  -> ${detail}`}`,
  );
}
function sql(q) {
  return execFileSync(
    "psql",
    [
      "-h",
      "/tmp/tmspg",
      "-p",
      "5434",
      "-U",
      "postgres",
      "-d",
      "tms_fleet",
      "-X",
      "-tA",
      "-c",
      q,
    ],
    { encoding: "utf8" },
  ).trim();
}
async function startServer() {
  server = spawn(
    "npx",
    ["next", "start", "--port", "4610", "--hostname", "127.0.0.1"],
    { cwd: path.join(ROOT, "apps/tms"), stdio: "ignore", detached: true },
  );
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/login`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server did not start");
}
function stopServer() {
  if (server) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
    server = null;
  }
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
  await page.fill("[data-testid=email]", email);
  await page.fill("[data-testid=password]", PASSWORD);
  await page.click("[data-testid=sign-in]");
  await page.waitForURL(`${BASE}/`, { timeout: 15000 });
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
  { defect, phase = "Pre-trip", photo, extra = [] } = {},
) {
  await page.goto(`${BASE}/driver`);
  await page.click(`[data-pick="${unit}"]`);
  await page.click(`[data-phase="${phase}"]`);
  await page.fill("[data-testid=odometer]", "120500");
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
  await page.waitForTimeout(600);
  return card;
}
async function summary(page) {
  await page.goto(`${BASE}/dashboard`);
  const get = async (k) => (await page.textContent(`[data-k=${k}]`)).trim();
  return {
    oos: await get("oos"),
    defects: await get("defects"),
    completion: await get("completion"),
  };
}
async function billing(page, event, plan) {
  await page.goto(`${BASE}/modules`);
  await page.selectOption("[data-testid=plan]", plan);
  await page.click(`[data-event="${event}"]`);
  await page.waitForSelector("[data-testid=billing-outcome]");
  return (await page.textContent("[data-testid=billing-outcome]")).trim();
}

(async () => {
  await startServer();
  const browser = await chromium.launch();

  // ---- Sign-in -------------------------------------------------------
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/dashboard`);
    check("signed-out visitor is sent to sign in", page.url().endsWith("/login"));
    check(
      "signed-out API call is refused (401)",
      (await page.evaluate(
        async () => (await fetch("/api/fleet", { method: "POST", body: "{}" })).status,
      )) === 401,
    );
    await page.fill("[data-testid=email]", "morgan@lakeshore.example.test");
    await page.fill("[data-testid=password]", "wrong-password");
    await page.click("[data-testid=sign-in]");
    await page.waitForSelector("[data-testid=login-error]");
    check("a wrong password is refused", page.url().endsWith("/login"));
    await ctx.close();
  }

  // ---- T-3 baseline --------------------------------------------------
  const morgan = await signIn(browser, "morgan@lakeshore.example.test");
  let s = await summary(morgan.page);
  check(
    "T-3: the board starts from the seeded defect: 1 out of service, 1 outstanding",
    s.oos === "1" && s.defects === "1",
    JSON.stringify(s),
  );
  const assign = await morgan.page.textContent("[data-testid=assignments]");
  check(
    "T-3: the manager sees driver assignments",
    assign.includes("dana") &&
      assign.includes("T-101, T-102") &&
      assign.includes("B-201"),
    assign,
  );
  const alerts = await morgan.page.textContent("[data-testid=alerts]");
  check(
    "T-3: the manager sees maintenance alerts (open work order, expiring registration and credentials)",
    alerts.includes("WO-1001") &&
      alerts.includes("T-102 registration") &&
      alerts.includes("CDL expired"),
    alerts,
  );
  await shot(morgan.page, "t3-dashboard");

  // ---- T-1 driver inspection on a phone --------------------------------
  const dana = await signIn(browser, "dana@lakeshore.example.test", {
    ...devices["iPhone 13"],
  });
  check(
    "T-1: a driver's navigation offers only the inspection",
    JSON.stringify(await navKeys(dana.page)) === '["driver_dvir"]',
    JSON.stringify(await navKeys(dana.page)),
  );
  check(
    "T-1: a driver cannot open the fleet list",
    (await lockedReason(dana.page, "/fleet")) === "role_not_allowed",
  );
  await dana.page.goto(`${BASE}/driver`);
  const picks = await dana.page.$$eval("[data-pick]", (els) =>
    els.map((e) => e.getAttribute("data-pick")),
  );
  check(
    "T-1: the driver sees only assigned vehicles (from the database's own scoping)",
    JSON.stringify(picks) === '["T-101","T-102"]',
    JSON.stringify(picks),
  );
  check(
    "T-1: the screen fits a phone without sideways scrolling",
    await dana.page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  const photoPage = await dana.ctx.newPage();
  await photoPage.setContent(
    "<div style='width:320px;height:200px;background:#b91c1c;color:#fff;font:40px sans-serif'>TIRE</div>",
  );
  const jpeg = await photoPage.screenshot({ type: "jpeg" });
  await photoPage.close();
  const before = Number(sql("select count(*) from fleet.inspections"));
  await inspect(dana.page, "T-101", {
    defect: { item: "Tires", level: 3, note: "Left steer tire cut to the cord" },
    photo: jpeg,
  });
  await shot(dana.page, "t1-driver-dvir-mobile");
  await dana.page.click("[data-testid=submit-dvir]");
  await dana.page
    .waitForSelector("[data-testid=dvir-done]", { timeout: 10000 })
    .catch(() => null);
  check(
    "T-1: the inspection with a defect, photo and signature is submitted",
    !!(await dana.page.$("[data-testid=dvir-done]")),
    (await dana.page.textContent("[data-testid=dvir-error]").catch(() => "")) || "",
  );
  const row =
    sql(`select payload->>'signature' || '|' || (payload->>'photo' is not null) || '|' || (select string_agg(c->>'item' || ':' || (c->>'level'), ',') from jsonb_array_elements(payload->'checks') c where c->>'result' = 'Defect')
                   from fleet.inspections where unit_id = 'T-101' order by created_at desc limit 1`);
  check(
    "T-1: it PERSISTS — the database holds the signed report, its photo reference and the level-3 tire defect",
    Number(sql("select count(*) from fleet.inspections")) === before + 1 &&
      row === "Test Driver|true|Tires:3",
    row,
  );
  check(
    "T-1: the photo is a storage.objects row owned by the driver",
    sql(
      `select count(*) from storage.objects o join auth.users u on u.id::text = o.owner_id where o.bucket_id = 'hlg-fleet-documents' and u.email = 'dana@lakeshore.example.test'`,
    ) === "1",
  );
  await dana.page.click("text=View report");
  await dana.page.waitForSelector("[data-testid=report]");
  check(
    "T-1: the report shows the photo, read back through the storage policy",
    await dana.page
      .$eval("[data-testid=report] img", (i) => i.complete && i.naturalWidth > 0)
      .catch(() => false),
  );
  await dana.page.goto(`${BASE}/driver`);
  check(
    "T-1: the driver now sees T-101 OUT OF SERVICE",
    (await dana.page.textContent('[data-pick="T-101"]')).includes("Out of service"),
  );

  s = await summary(morgan.page);
  check(
    "T-3: the board shows 2 out of service and 2 outstanding defects",
    s.oos === "2" && s.defects === "2",
    JSON.stringify(s),
  );

  // ---- T-2 maintenance -------------------------------------------------
  const max = await signIn(browser, "max@lakeshore.example.test");
  await max.page.goto(`${BASE}/defects`);
  await defectAction(max.page, "T-101", "acknowledge", {
    note: "Truck parked at yard, tire on order",
  });
  await defectAction(max.page, "T-101", "assess", {
    level: 3,
    note: "Confirmed: cut to cord, replace",
  });
  const card = await defectAction(max.page, "T-101", "certify", {
    resolution: "Repair unnecessary",
    note: "trying to skip the repair",
  });
  const err =
    (await card
      .locator("[data-testid=action-error]")
      .textContent()
      .catch(() => "")) || "";
  check(
    "T-2: the DATABASE refuses 'Repair unnecessary' on a safety hold",
    err.includes("Safety holds require repair"),
    err,
  );
  await defectAction(max.page, "T-101", "certify", {
    resolution: "Repaired",
    note: "Mounted new 295/75R22.5, torqued to spec",
  });
  check(
    "T-2: the corrective action persists (acknowledge, assess, certify)",
    sql(
      `select string_agg(a.payload->>'kind', ',' order by a.created_at) from fleet.inspection_actions a join fleet.inspections i on i.id = a.inspection_id where i.unit_id = 'T-101'`,
    ) === "acknowledge,assess,certify",
  );
  await max.page.goto(`${BASE}/maintenance?unit=T-101`);
  await max.page.fill("[data-testid=svc-title]", "Replace left steer tire");
  await max.page.fill("[data-testid=svc-cost]", "412.50");
  await max.page.click("[data-testid=svc-save]");
  await max.page.waitForSelector("[data-testid=service-records]");
  check(
    "T-2: the repair cost persists against T-101",
    sql(
      "select cost_cents || '|' || (payload->>'title') from fleet.service_records where unit_id = 'T-101'",
    ) === "41250|Replace left steer tire",
  );
  check(
    "T-2: maintenance cannot open company setup",
    (await lockedReason(max.page, "/setup")) === "role_not_allowed",
  );
  s = await summary(morgan.page);
  check(
    "T-2/T-3: T-101 is back in service on the board (T-102 remains)",
    s.oos === "1" && s.defects === "1",
    JSON.stringify(s),
  );
  await inspect(dana.page, "T-101", {});
  check(
    "T-2: the driver must review the repair before the next trip",
    !!(await dana.page.$("[data-testid=review-prior]")) &&
      (await dana.page.isDisabled("[data-testid=submit-dvir]")),
  );
  await dana.page.check("[data-testid=ack-repairs]");
  await dana.page.click("[data-testid=submit-dvir]");
  await dana.page
    .waitForSelector("[data-testid=dvir-done]", { timeout: 10000 })
    .catch(() => null);
  check(
    "T-2: after the review, the clean pre-trip persists with the driver's review recorded",
    sql(
      `select count(*) from fleet.inspection_actions where payload->>'kind' = 'review'`,
    ) === "1",
  );

  // ---- Configurable template (T3 module) --------------------------------
  await morgan.page.goto(`${BASE}/setup`);
  await morgan.page.selectOption("[data-testid=template-type]", "Box truck");
  await morgan.page.fill(
    "[data-testid=template-items]",
    "Liftgate operation\nCargo straps secured",
  );
  await morgan.page.click("[data-testid=template-save]");
  await morgan.page.waitForSelector('[data-template="Box truck"]');
  check(
    "template: the manager's Box truck template persists",
    sql(
      `select array_to_string(items, '|') from fleet.inspection_templates where equipment_type = 'Box truck'`,
    ) === "Liftgate operation|Cargo straps secured",
  );
  const devon = await signIn(browser, "devon@lakeshore.example.test", {
    ...devices["Pixel 7"],
  });
  await devon.page.goto(`${BASE}/driver`);
  await devon.page.click('[data-pick="B-201"]');
  const items = await devon.page.$$eval("[data-item]", (els) =>
    els.map((e) => e.getAttribute("data-item")),
  );
  check(
    "template: the driver's box-truck checklist now has 13 items including the template's",
    items.length === 13 && items.includes("Liftgate operation"),
    String(items.length),
  );
  let r = await api(devon.page, "submit_inspection", {
    report: {
      id: "DV-skip-template-1",
      asset: "B-201",
      phase: "Pre-trip",
      odometer: 1,
      inspectedAt: new Date().toISOString(),
      driver: "Devon",
      signature: "Devon",
      consent: true,
      checks: [
        "Service brakes / connections",
        "Parking brake",
        "Steering",
        "Lights / reflectors",
        "Tires",
        "Horn",
        "Windshield wipers",
        "Mirrors",
        "Coupling devices",
        "Wheels / rims",
        "Emergency equipment",
      ].map((item) => ({ item, result: "Pass" })),
    },
  });
  check(
    "template: the DATABASE refuses an inspection that skips the template's items",
    r.status === 422 && /Liftgate operation/.test(r.body.error),
    JSON.stringify(r),
  );

  // ---- T-4 a DVIR-only company -----------------------------------------
  const sam = await signIn(browser, "sam@twotrucks.example.test");
  check(
    "T-4: DVIR-only owner's navigation",
    JSON.stringify(await navKeys(sam.page)) ===
      JSON.stringify(["driver_dvir", "defects", "setup", "modules"]),
    JSON.stringify(await navKeys(sam.page)),
  );
  for (const url of ["/fleet", "/dashboard", "/drivers", "/maintenance"])
    check(
      `T-4: ${url} is refused as not licensed`,
      (await lockedReason(sam.page, url)) === "not_licensed",
    );
  await sam.page.goto(`${BASE}/modules`);
  const built = await sam.page.$$eval("[data-module]", (els) =>
    Object.fromEntries(
      els.map((e) => [
        e.getAttribute("data-module"),
        [e.getAttribute("data-licensed"), e.textContent.includes("not built")],
      ]),
    ),
  );
  check(
    "T-4: dispatch, routes and profitability are neither licensed nor built",
    ["dispatch", "routes", "profitability"].every(
      (k) => built[k][0] === "false" && built[k][1],
    ),
    JSON.stringify(built),
  );
  check(
    "T-4: there is no dispatch/route/profitability operation to call",
    (await api(sam.page, "dispatch")).status === 400,
  );
  await sam.page.goto(`${BASE}/setup`);
  await sam.page.fill("[data-testid=unit-id]", "TT-3");
  await sam.page.fill("[data-testid=unit-name]", "Truck 3");
  await sam.page.click("[data-testid=unit-add]");
  await sam.page
    .waitForSelector('[data-reg="TT-3"]', { timeout: 5000 })
    .catch(() => null);
  check(
    "T-4: the DVIR-only company adds a vehicle to the shared registry (persisted)",
    sql(
      `select count(*) from fleet.units where workspace_id = '${TWOTRUCKS}' and id = 'TT-3'`,
    ) === "1",
  );
  r = await api(sam.page, "submit_service", {
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
    "T-4: a maintenance record is refused (403)",
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
    "T-4: the DATABASE refuses a work order smuggled through the vehicle registry (403)",
    r.status === 403 && /work orders cannot be changed/.test(r.body.error),
    JSON.stringify(r),
  );
  check(
    "T-4: and nothing was written",
    sql(
      `select count(*) from fleet.work_orders where workspace_id = '${TWOTRUCKS}'`,
    ) === "0",
  );

  // ---- cross-company ---------------------------------------------------
  r = await api(sam.page, "snapshot", { workspace: LAKESHORE });
  check(
    "cross-company: naming another company's id still returns only your own vehicles",
    JSON.stringify(r.body.result.state.payload.assets.map((a) => a.id)) ===
      '["TT-1","TT-2","TT-3"]',
  );
  r = await sam.page.evaluate(
    async (id) => (await fetch(`/api/photo?inspection=${id}`)).status,
    sql(
      `select id from fleet.inspections where workspace_id = '${LAKESHORE}' and payload->>'photo' is not null limit 1`,
    ),
  );
  check(
    "cross-company: another company's inspection photo is not served",
    r === 404,
    String(r),
  );

  // ---- H-1 subscription entitlement, in the app ------------------------
  const riley = await signIn(browser, "riley@twotrucks.example.test", {
    ...devices["Pixel 7"],
  });
  await inspect(riley.page, "TT-1", {});
  await riley.page.click("[data-testid=submit-dvir]");
  await riley.page
    .waitForSelector("[data-testid=dvir-done]", { timeout: 10000 })
    .catch(() => null);
  const rileyCount = sql(
    `select count(*) from fleet.inspections where workspace_id = '${TWOTRUCKS}'`,
  );
  check(
    "H-1: the DVIR-only company's driver completes an inspection",
    rileyCount === "1",
    rileyCount,
  );
  let out = await billing(sam.page, "invoice.payment_failed", "tms_dvir");
  check(
    "H-1: a failed payment is applied (signed event through the webhook handler)",
    out === "applied: past_due",
    out,
  );
  check(
    "H-1: … and Digital DVIR is closed for the driver",
    (await lockedReason(riley.page, "/driver")) === "not_licensed",
  );
  check(
    "H-1: … while the owner can still reach the subscription page to fix it",
    (await lockedReason(sam.page, "/modules")) === null &&
      (await lockedReason(sam.page, "/setup")) === "no_modules",
  );
  check(
    "H-1: … but the history is still there",
    sql(
      `select count(*) from fleet.inspections where workspace_id = '${TWOTRUCKS}'`,
    ) === "1",
  );
  out = await billing(sam.page, "invoice.paid", "tms_dvir");
  check(
    "H-1: payment recovered re-opens it",
    out === "applied: active" && (await lockedReason(riley.page, "/driver")) === null,
    out,
  );
  out = await billing(sam.page, "customer.subscription.deleted", "tms_dvir");
  check(
    "H-1: cancellation closes it again, keeping records",
    out === "applied: canceled" &&
      (await lockedReason(riley.page, "/driver")) === "not_licensed" &&
      sql(`select count(*) from fleet.units where workspace_id = '${TWOTRUCKS}'`) ===
        "3",
    out,
  );
  out = await billing(sam.page, "checkout.session.completed", "tms_fleet_maintenance");
  await sam.page.goto(`${BASE}/maintenance`);
  check(
    "H-1: buying Fleet + Maintenance opens Maintenance (and not DVIR)",
    out === "applied: active" &&
      sam.page.url().endsWith("/maintenance") &&
      (await lockedReason(sam.page, "/driver")) === "not_licensed",
    out,
  );
  await shot(sam.page, "h1-modules");

  await browser.close();

  // ---- persistence across a restart -------------------------------------
  stopServer();
  await new Promise((r) => setTimeout(r, 1500));
  await startServer();
  const b2 = await chromium.launch();
  const m2 = await signIn(b2, "morgan@lakeshore.example.test");
  s = await summary(m2.page);
  await m2.page.goto(`${BASE}/fleet/T-101`);
  const hist = await m2.page.textContent("body");
  check(
    "persistence: after restarting the app, the board and T-101's history are unchanged",
    s.oos === "1" &&
      s.defects === "1" &&
      hist.includes("Replace left steer tire") &&
      (hist.match(/Pre-trip ·/g) || []).length >= 2,
    JSON.stringify(s),
  );
  check(
    "every page carries the isolated-environment banner",
    ((await m2.page.textContent("[data-testid=demo-banner]")) || "").includes(
      "ISOLATED DEVELOPMENT ENVIRONMENT",
    ),
  );
  await b2.close();
  stopServer();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  stopServer();
  process.exit(2);
});
