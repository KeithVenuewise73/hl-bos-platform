// End-to-end acceptance test of the HLG Career Platform journey, against the
// running production build in local mode, with a fictional candidate.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

// Run against a server started with HL_BOS_ENV=local ATS_SEED_DEMO=false and an
// EMPTY ATS_DATA_DIR (the run ends by deleting all data):
//   node scripts/local-test/career-platform/journey.cjs
// Fixtures (fictional candidate and posting) live beside this file; screenshots
// and results.json go to CAREER_E2E_OUT (default: a temp directory).
const os = require("os");
const BASE = process.env.CAREER_E2E_BASE ?? "http://localhost:4600";
const DIR = __dirname;
const OUT =
  process.env.CAREER_E2E_OUT ?? fs.mkdtempSync(path.join(os.tmpdir(), "career-e2e-"));
const shots = path.join(OUT, "shots");
fs.mkdirSync(shots, { recursive: true });

const results = [];
/** Click a submit button and wait for the server action and the redirect to settle. */
async function act(page, locator) {
  const posted = page.waitForResponse((r) => r.request().method() === "POST", {
    timeout: 30000,
  });
  await locator.click();
  await posted;
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(250);
}
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

async function main() {
  const browser = await chromium.launch();
  let ctx = await browser.newContext({ acceptDownloads: true });
  let page = await ctx.newPage();
  const shot = (n) =>
    page.screenshot({ path: path.join(shots, `${n}.png`), fullPage: true });
  const text = () => page.locator("main").innerText();

  // ---- 1. Intake -----------------------------------------------------------
  await page.goto(`${BASE}/start`);
  check(
    "Home shows the journey with nothing done",
    (await text()).includes("To do") && !(await text()).includes("Done"),
  );

  await page.goto(`${BASE}/intake`);
  await page.getByLabel("Employment situation").selectOption("unemployed");
  await page.getByLabel("Locations").fill("Columbus, OH");
  await act(page, page.getByRole("button", { name: "Save search profile" }));
  let t = await text();
  check(
    "Intake: invalid form is refused with every problem listed",
    t.includes("Add at least one target job title.") &&
      t.includes("Choose how actively you are searching.") &&
      t.includes("Choose at least one of remote"),
  );
  check(
    "Intake: typed values survive a failed save",
    (await page.getByLabel("Locations").inputValue()) === "Columbus, OH" &&
      (await page.getByLabel("Employment situation").inputValue()) === "unemployed",
  );

  await page.getByLabel("Search activity").selectOption("actively_applying");
  await page
    .getByLabel("Target job titles")
    .fill("Operations Manager, Warehouse Manager");
  await page
    .getByLabel("Related titles you would also consider")
    .fill("Distribution Center Manager");
  await page.locator("input[name=arrangements][value=on_site]").check();
  await page.locator("input[name=arrangements][value=hybrid]").check();
  await page.locator("input[name=arrangementsFirm]").check();
  await page.locator("input[name=employmentTypes][value=full_time]").check();
  await page.locator("input[name=locationsFirm]").check();
  await page.getByLabel("Minimum", { exact: true }).fill("80000");
  await page.getByLabel("Target", { exact: true }).fill("95000");
  await page.locator("input[name=salaryFirm]").check();
  await page.getByLabel("Confidential search?").selectOption("yes");
  await act(page, page.getByRole("button", { name: "Save search profile" }));
  check("Intake: valid profile saved", (await text()).includes("Saved."));
  await page.reload();
  check(
    "Intake: persisted across reload",
    (await page.getByLabel("Target job titles").inputValue()).includes(
      "Warehouse Manager",
    ) && (await page.getByLabel("Locations").inputValue()) === "Columbus, OH",
  );
  await shot("01-intake");

  // ---- 2. Upload and experience bank ---------------------------------------
  await page.goto(`${BASE}/experience`);
  const fake = path.join(OUT, "not-really.pdf");
  fs.writeFileSync(fake, "this is a plain text file pretending to be a PDF");
  await page.setInputFiles("#file", fake);
  await act(page, page.getByRole("button", { name: "Read my resume" }));
  check(
    "Upload: a fake PDF is refused by content",
    (await text()).includes("named .pdf but is not a PDF"),
  );

  await page.setInputFiles("#file", path.join(DIR, "jordan-rivera-resume.docx"));
  await act(page, page.getByRole("button", { name: "Read my resume" }));
  t = await text();
  const factsMatch = t.match(/Your experience bank \((\d+) facts\)/);
  check(
    "Upload: DOCX read into the experience bank",
    factsMatch && Number(factsMatch[1]) >= 10,
    factsMatch ? `${factsMatch[1]} facts` : "no count",
  );
  check("Upload: extracted facts carry their source", t.includes("From your resume"));
  await shot("02-experience");

  const suggestion = page.getByRole("button", { name: "Yes, this is true" }).first();
  if (await suggestion.count()) {
    const before = Number(
      (await text()).match(/Your experience bank \((\d+) facts\)/)[1],
    );
    await act(page, suggestion);
    const after = Number(
      (await text()).match(/Your experience bank \((\d+) facts\)/)[1],
    );
    check(
      "Inference becomes evidence only after confirmation",
      after === before + 1,
      `${before} -> ${after}`,
    );
  } else {
    check(
      "Inference suggestions offered for unlisted skills",
      false,
      "no suggestion shown",
    );
  }

  const answerBox = page.locator(
    'form:has(input[name=questionId][value="examples"]) textarea',
  );
  await answerBox.fill(
    "In 2023 I led the peak-season staffing plan for our building and hired and onboarded 30 seasonal associates.",
  );
  await act(
    page,
    page
      .locator('form:has(input[name=questionId][value="examples"])')
      .getByRole("button", { name: "Save answer" }),
  );
  check(
    "Answer to a targeted question saved as a confirmed fact",
    (await page
      .locator('input[name=text][value*="30 seasonal associates"]')
      .count()) === 1 &&
      (await page.locator("main").textContent()).includes("You confirmed"),
  );

  // ---- 3. Base resume ------------------------------------------------------
  await act(
    page,
    page.getByRole("button", { name: "Build a new draft from my experience bank" }),
  );
  check(
    "Base resume draft built",
    page.url().includes("/experience/base/") &&
      (await text()).includes("Base resume v1"),
  );
  const firstBullet = page.locator("textarea[name=text]").first();
  const original = await firstBullet.inputValue();
  await firstBullet.fill("Managed a $40M budget and 900 drivers across 12 states");
  await act(page, page.getByRole("button", { name: "Save wording" }).first());
  t = await text();
  check(
    "Invented figures in an edited line are flagged",
    t.includes("Unsupported") && t.includes("do not appear in the source evidence"),
  );
  check(
    "Approval is blocked while a line is unsupported",
    await page.getByRole("button", { name: "Approve this version" }).isDisabled(),
  );
  await shot("03-base-blocked");
  await act(page, page.getByRole("button", { name: "Leave out" }).first());
  check(
    "Unsupported line removed from the draft",
    !(await text()).includes("900 drivers"),
  );
  await act(page, page.getByRole("button", { name: "Approve this version" }));
  check(
    "Approval requires the reviewed-and-accurate confirmation",
    (await text()).includes("Tick the box to confirm you reviewed"),
  );
  await page.locator("input[name=confirm]").check();
  await act(page, page.getByRole("button", { name: "Approve this version" }));
  check(
    "Base resume approved",
    (await text()).includes(
      "Approved. Tailored applications will start from this version.",
    ),
  );
  await page.goto(`${BASE}/experience`);
  check(
    "Omitted line's fact is still in the experience bank",
    (await page.locator(`input[value="${original.replace(/"/g, '\\"')}"]`).count()) > 0,
    original.slice(0, 50),
  );

  // ---- 4. Discovery: unsupported/unavailable source, import, duplicates ----
  await page.goto(`${BASE}/jobs`);
  t = await text();
  check(
    "Coverage limits are stated (no LinkedIn/Indeed crawling claimed)",
    t.includes("LinkedIn and Indeed are not searched"),
  );
  await page.locator("#b-employer").fill("Example Freight Co");
  await page.locator("#b-source").selectOption("greenhouse");
  await page.locator("#b-token").fill("examplefreight");
  await act(page, page.getByRole("button", { name: "Add job board" }));
  await act(page, page.getByRole("button", { name: "Search my job boards now" }));
  t = await text();
  check(
    "An unreachable source is reported as failed, in plain English",
    t.includes("1 source(s) failed") &&
      t.includes("Failed: The job board could not be reached."),
  );
  await page.locator("#b-token").fill("../etc/passwd");
  await page.locator("#b-employer").fill("Bad");
  await act(page, page.getByRole("button", { name: "Add job board" }));
  check(
    "A malformed board name is refused",
    (await text()).includes("may contain only letters"),
  );

  const jobText = fs.readFileSync(path.join(DIR, "job.txt"), "utf8");
  await page.goto(`${BASE}/jobs`);
  await page.locator("#employer").fill("Northgate Logistics");
  await page.locator("#title").fill("Distribution Center Operations Manager");
  await page.locator("#url").fill("https://careers.example.test/northgate/ops-manager");
  await page.locator("#foundOn").fill("LinkedIn");
  await page.locator("#location").fill("Columbus, OH");
  await page.locator("#description").fill(jobText);
  await act(page, page.getByRole("button", { name: "Import" }));
  t = await text();
  const oppUrl = page.url();
  check(
    "Manual import creates an opportunity with a snapshot",
    oppUrl.includes("/opportunities/") && t.includes("Found via LinkedIn"),
  );
  check(
    "Location recorded and matched against the firm location requirement",
    t.includes("Columbus, OH ·") && !t.includes("Fails a must-have"),
  );
  check(
    "Disclosed salary shown; fit assessed",
    t.includes("$82,000 - $95,000") && /Strong match|Possible match/.test(t),
  );

  await page.goto(`${BASE}/jobs`);
  await page.locator("#employer").fill("Northgate Logistics");
  await page.locator("#title").fill("Distribution Center Operations Manager");
  await page.locator("#description").fill(jobText);
  await act(page, page.getByRole("button", { name: "Import" }));
  check(
    "Importing the same posting again is caught as a duplicate",
    (await text()).includes("already in your list"),
  );

  // ---- 5. Pursue and generate ----------------------------------------------
  await page.goto(oppUrl);
  await act(page, page.getByRole("button", { name: "Pursue" }));
  check("Pursue moves the role to Pursuing", (await text()).includes("Pursuing"));
  await act(page, page.getByRole("button", { name: "Prepare documents" }));
  t = await text();
  check(
    "Generation says Documents Ready, not Applied",
    t.includes("Documents Ready") &&
      t.includes("Nothing has been sent") &&
      !/·\s*Applied/.test(t),
  );
  const gapLine = (t.match(/Gaps to be honest about:[^\n]*/) || [""])[0];
  check(
    "Missing qualifications are flagged honestly as gaps, required first",
    /(Not evidenced|Only partly evidenced) \(required\): Bachelor/.test(gapLine) &&
      gapLine.includes("Six Sigma"),
    gapLine.slice(0, 220),
  );
  check(
    "The pay line is not reported as a missing qualification",
    !/Not evidenced[^·]*Salary/i.test(gapLine),
  );
  check(
    "Resume, cover letter and outreach drafts present",
    t.includes("Resume v1") &&
      t.includes("Cover letter 1") &&
      t.includes("Recruiter / hiring-manager note"),
  );
  const outreach = await page
    .locator("details:has-text('Recruiter / hiring-manager note') .pre")
    .textContent();
  check(
    "Confidential search: outreach draft carries the confidentiality note",
    outreach.includes("Confidential search"),
  );
  await shot("04-documents-ready");

  // The generated resume contains nothing unsupported in its export.
  const resumeLink = await page
    .getByRole("link", { name: "Review and edit" })
    .getAttribute("href");
  const resumeId = resumeLink.split("/").pop();
  const exportRes = await page.request.get(
    `${BASE}/resumes/${resumeId}/export?format=txt`,
  );
  const draftText = await exportRes.text();
  check(
    "Tailored resume export drops nothing it should not contain",
    exportRes.status() === 200 &&
      !draftText.includes("Six Sigma Green Belt") &&
      !/bachelor/i.test(draftText),
    `X-Claims-Dropped: ${exportRes.headers()["x-claims-dropped"]}`,
  );

  // ---- 6. Confirm submission ----------------------------------------------
  await page.getByLabel("Where you submitted it").fill("Northgate careers site");
  await act(page, page.getByRole("button", { name: "Record as applied" }));
  check(
    "Submission requires an explicit confirmation",
    (await text()).includes("Tick the box to confirm you actually submitted"),
  );
  await page.getByLabel("Where you submitted it").fill("Northgate careers site");
  await page.getByLabel("Date submitted").evaluate((el) => el.removeAttribute("max"));
  await page.getByLabel("Date submitted").fill("2099-01-01");
  await page.locator("input[name=confirm]").check();
  await act(page, page.getByRole("button", { name: "Record as applied" }));
  check(
    "A future submission date is refused server-side",
    (await text()).includes("cannot be in the future"),
  );
  const today = new Date().toISOString().slice(0, 10);
  await page.getByLabel("Where you submitted it").fill("Northgate careers site");
  await page.getByLabel("Date submitted").fill(today);
  await page.locator("input[name=confirm]").check();
  await act(page, page.getByRole("button", { name: "Record as applied" }));
  t = await text();
  check(
    "Confirmed submission moves the role to Applied",
    t.includes("Recorded as applied") && t.includes("Northgate Logistics · Applied"),
  );
  check(
    "Found-via and submitted-via are tracked separately",
    t.includes("Found via LinkedIn") &&
      t.includes("Submitted via Northgate careers site"),
  );
  check("Archive integrity check passes", t.includes("Unchanged since submission"));
  const sentBefore = await (
    await page.request.get(`${oppUrl}/submitted/resume.txt`)
  ).text();
  await shot("05-applied");

  // Later edits to the draft must not touch the archive.
  await page.goto(`${BASE}/resumes/${resumeId}`);
  const firstLine = page.locator("textarea[name=text]").first();
  await firstLine.fill("EDITED AFTER SUBMISSION — this must not appear in the archive");
  await act(page, page.getByRole("button", { name: "Save edit" }).first());
  const sentAfter = await (
    await page.request.get(`${oppUrl}/submitted/resume.txt`)
  ).text();
  check(
    "Editing the draft after submission leaves the submitted resume byte-identical",
    sentBefore === sentAfter && !sentAfter.includes("EDITED AFTER SUBMISSION"),
  );
  const draftNow = await (
    await page.request.get(`${BASE}/resumes/${resumeId}/export?format=txt`)
  ).text();
  check("…while the draft itself did change", draftNow !== draftText);

  // ---- 7. Return later -----------------------------------------------------
  await ctx.close();
  ctx = await browser.newContext({ acceptDownloads: true });
  page = await ctx.newPage();
  await page.goto(`${BASE}/pipeline`);
  t = await page.locator("main").innerText();
  check(
    "Returning later: dashboard shows the submitted application",
    t.includes("Distribution Center Operations Manager") &&
      t.includes(`${today} via Northgate careers site`),
  );
  await page
    .getByRole("link", { name: "Distribution Center Operations Manager" })
    .first()
    .click();
  await page.waitForURL(/\/opportunities\//);
  const docx = await page.request.get(`${oppUrl}/submitted/resume.docx`);
  const docxBytes = await docx.body();
  check(
    "Exact submitted resume opens as Word (DOCX)",
    docx.status() === 200 && docxBytes[0] === 0x50 && docxBytes[1] === 0x4b,
    `${docxBytes.length} bytes`,
  );
  const letter = await page.request.get(`${oppUrl}/submitted/cover-letter.txt`);
  check(
    "Exact submitted cover letter opens",
    letter.status() === 200 && (await letter.text()).includes("Northgate"),
  );
  const posting = await (
    await page.request.get(`${oppUrl}/submitted/posting.txt`)
  ).text();
  check(
    "Job-description snapshot preserved with the application",
    posting.includes("Lean Six Sigma Green Belt preferred"),
  );

  // ---- 8. Interview practice ----------------------------------------------
  await page.goto(`${oppUrl}/practice`);
  await page.getByLabel("Interview round").fill("Phone screen");
  await act(page, page.getByRole("button", { name: "Start" }));
  t = await page.locator("main").innerText();
  check(
    "Practice session built from the submitted package",
    t.includes(`You applied on ${today} via Northgate careers site`) &&
      t.includes("Preparation material"),
  );
  await page.getByLabel("Your answer").fill("I am a hard worker.");
  await act(page, page.getByRole("button", { name: "Get feedback" }));
  const weakScore = Number(
    (await page.locator("main").innerText()).match(/Feedback — (\d)\/5/)[1],
  );
  await page
    .getByLabel("Your answer")
    .fill(
      "At my last company our building was missing dock-to-stock targets during peak. I was responsible for fixing inbound flow before the holiday surge. I re-sequenced carrier appointments and I trained the receiving leads on a new putaway order, and I worked with two carriers on earlier arrival windows. As a result we cut dock-to-stock time by 31% and the team kept the schedule after peak ended. It became the standard for the second shift as well, and it is the example I would point to first.",
    );
  await act(page, page.getByRole("button", { name: "Try again" }));
  t = await page.locator("main").innerText();
  const strongScore = Number(t.match(/Feedback — (\d)\/5/)[1]);
  check(
    "Practice loop: feedback improves with a structured answer",
    strongScore > weakScore,
    `${weakScore}/5 -> ${strongScore}/5`,
  );
  await page.getByLabel("Your answer").fill("I cut costs by 47% and saved $2M.");
  await act(page, page.getByRole("button", { name: "Try again" }));
  check(
    "Practice flags figures that are not in the experience bank",
    (await page.locator("main").innerText()).includes(
      "not in your experience bank: 47%",
    ),
  );
  await shot("06-practice");

  // ---- 9. Interview, follow-up, outcome -----------------------------------
  await page.goto(oppUrl);
  await page.locator("#i-label").fill("Phone screen");
  await page.locator("#i-date").fill(today);
  await act(page, page.getByRole("button", { name: "Add interview" }));
  await act(page, page.getByRole("button", { name: "Draft a thank-you note" }));
  check(
    "Thank-you draft generated for the round",
    (await page.locator("main").innerText()).includes("Thank you for taking the time"),
  );
  await page.locator("#f-due").fill(today);
  await page.locator("#f-action").fill("Email the recruiter");
  await act(page, page.getByRole("button", { name: "Add follow-up" }));
  await page.locator("#stage-select").selectOption("interviewing");
  await act(page, page.getByRole("button", { name: "Update" }));
  await page.locator("#stage-select").selectOption("rejected");
  await page
    .locator("#outcome")
    .fill("Rejected after phone screen — they hired internally");
  await act(page, page.getByRole("button", { name: "Update" }));
  t = await page.locator("main").innerText();
  check(
    "Outcome recorded with full status history",
    t.includes("Outcome: Rejected after phone screen") &&
      t.includes("— Applied") &&
      t.includes("— Interviewing") &&
      t.includes("— Rejected"),
  );
  await page.goto(`${BASE}/pipeline`);
  t = await page.locator("main").innerText();
  check(
    "Dashboard: follow-up due and outcomes by source are counted from records",
    t.includes("Email the recruiter") && /LinkedIn\s+1\s+1\s+1\s+0/.test(t),
  );

  // ---- 10. LinkedIn --------------------------------------------------------
  await page.goto(`${BASE}/linkedin`);
  await act(page, page.getByRole("button", { name: "Suggest profile improvements" }));
  t = await page.locator("main").innerText();
  check(
    "LinkedIn suggestions generated from the approved resume",
    t.includes("About section") && t.includes("Skills to list"),
  );
  check(
    "Confidential search: no 'open to work' headline suggested",
    !t.includes("Open to"),
  );
  check(
    "No publishing integration is claimed",
    t.includes("No authorised LinkedIn publishing integration is connected"),
  );
  await page.getByLabel("Topic").fill("Peak season");
  await page
    .getByLabel("What happened")
    .fill(
      "We re-sequenced carrier appointments before peak and dock-to-stock fell by 31%.",
    );
  await page
    .getByLabel("What you took from it, or your opinion")
    .fill("Fix the schedule before adding people.");
  await act(page, page.getByRole("button", { name: "Create draft" }));
  await page.getByLabel("Planned date").fill(today);
  await act(page, page.getByRole("button", { name: "Plan" }));
  check(
    "Post draft in the subscriber's words, on the content calendar",
    (await page.locator("main").innerText()).includes(`Planned ${today}`),
  );

  // ---- 11. Mobile ----------------------------------------------------------
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });
  const mp = await mobile.newPage();
  for (const p of ["/pipeline", "/intake", oppUrl.replace(BASE, "")]) {
    await mp.goto(BASE + p);
    const overflow = await mp.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    check(
      `Mobile (390px): ${p.length > 30 ? "/opportunities/…" : p} has no horizontal overflow`,
      overflow <= 1,
      `overflow ${overflow}px`,
    );
  }
  await mp.goto(BASE + "/pipeline");
  await mp.screenshot({
    path: path.join(shots, "07-mobile-pipeline.png"),
    fullPage: true,
  });
  await mobile.close();

  // ---- 12. Export and deletion --------------------------------------------
  const exp = await page.request.get(`${BASE}/account/export`);
  const data = JSON.parse(await exp.text());
  check(
    "Data export contains the submitted package and experience bank",
    data.submissions.length === 1 &&
      data.facts.length > 10 &&
      data.opportunities.length === 1,
  );
  await page.goto(`${BASE}/account`);
  t = await page.locator("main").innerText();
  check(
    "Account shows plan, usage and that no payment is collected",
    t.includes("Plan: Pilot") &&
      t.includes("package generation") &&
      t.includes("No payment details are collected"),
  );
  await page.getByLabel("Type DELETE to confirm").fill("delete");
  await act(page, page.getByRole("button", { name: "Delete all my data" }));
  check(
    "Deletion requires the exact confirmation",
    (await page.locator("main").innerText()).includes("Type DELETE in capitals"),
  );
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await act(page, page.getByRole("button", { name: "Delete all my data" }));
  check(
    "Deletion removes everything",
    (await page.locator("main").innerText()).includes("Your account data is gone"),
  );
  const after = JSON.parse(
    await (await page.request.get(`${BASE}/account/export`)).text(),
  );
  check(
    "After deletion the export is empty",
    after.facts.length === 0 &&
      after.submissions.length === 0 &&
      after.opportunities.length === 0 &&
      after.profiles.length === 0,
  );

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("CRASH", e);
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  process.exit(2);
});
