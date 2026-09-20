/**
 * Proves the access code actually keeps people out of the SHIPPED app.
 *
 * This exists because the first version of the gate did not work. It lived in
 * the root layout and rendered an unlock screen instead of the page — which
 * looks right in a browser and is wrong on the wire: React had already rendered
 * the page by then, so its entire content was still in the response payload.
 * Reading the served bytes is what found it. So this reads the served bytes.
 *
 * Usage:
 *   pnpm --filter @hl-bos/sceneflow-app build
 *   pnpm --filter @hl-bos/sceneflow-app start   # serves on :4100
 *   node scripts/local-test/verify-sceneflow-access.cjs http://127.0.0.1:4100
 *
 * It writes and restores .sceneflow/access-code.txt, because a gate can only be
 * tested by turning it on.
 */
const fs = require("node:fs");
const path = require("node:path");

const BASE = (process.argv[2] || "http://127.0.0.1:4100").replace(/\/$/, "");
const ROOT = path.resolve(__dirname, "..", "..");
const CODE_FILE = path.join(ROOT, ".sceneflow", "access-code.txt");
const CODE = "713904";

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`  OK    ${name}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    failures += 1;
  }
}

// Words that only ever appear inside the app itself. If any of them reaches a
// locked visitor, in markup or in the payload behind it, the gate leaked.
const SECRETS = [
  "Direct a scene",
  "Plan a story",
  "Choose the cast",
  "One moment becomes",
  "access code is set",
];

function leaked(body) {
  return SECRETS.filter((word) => body.includes(word));
}

async function get(pathname, cookie) {
  const response = await fetch(`${BASE}${pathname}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
  return { status: response.status, body: await response.text(), response };
}

function previous() {
  try {
    return fs.readFileSync(CODE_FILE, "utf-8");
  } catch {
    return null;
  }
}

function restore(value) {
  if (value === null) {
    try {
      fs.unlinkSync(CODE_FILE);
    } catch {
      /* it was not there to begin with */
    }
    return;
  }
  fs.writeFileSync(CODE_FILE, value, "utf-8");
}

(async () => {
  const saved = previous();
  try {
    console.log(`SceneFlow access verification against ${BASE}`);
    console.log("-".repeat(63));

    // --- With no code: the app is open, which is the documented behaviour of
    // a copy started on localhost only.
    restore(null);
    const open = await get("/");
    check("with no code set, the app serves its pages", open.status === 200);
    check(
      "and says plainly that no code is set",
      open.body.includes("No access code is set"),
    );

    // --- With a code: everything is behind it.
    fs.mkdirSync(path.dirname(CODE_FILE), { recursive: true });
    fs.writeFileSync(CODE_FILE, `${CODE}\n`, "utf-8");

    for (const pathname of ["/", "/direct", "/story"]) {
      const locked = await get(pathname);
      const spill = leaked(locked.body);
      check(`${pathname} asks for the code`, locked.body.includes("Access code"));
      check(
        `${pathname} leaks nothing of the page behind it`,
        spill.length === 0,
        spill.join(", "),
      );
    }

    const photo = await get("/api/photo/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa?ext=png");
    check("a photograph is not served without the code", photo.status === 404);
    check(
      "and the answer is a plain 404, not an unlock page pretending to be one",
      !photo.body.includes("Access code"),
    );

    const health = await get("/api/health");
    check(
      "health still answers, so the console can see it is up",
      health.status === 200,
    );
    check(
      "and tells an unauthenticated caller nothing else",
      health.body === JSON.stringify({ status: "ok", app: "sceneflow" }),
      health.body,
    );

    // --- A wrong token is not a way in.
    const forged = await get("/", "sceneflow_access=713904");
    check(
      "presenting the code where the token goes does not work",
      forged.body.includes("Access code") && leaked(forged.body).length === 0,
    );

    // --- The right token is.
    const crypto = require("node:crypto");
    const token = crypto.createHash("sha256").update(CODE, "utf-8").digest("hex");
    const unlocked = await get("/", `sceneflow_access=${token}`);
    check("the right token opens it", unlocked.body.includes("Direct a scene"));

    const unlockedPhoto = await get(
      "/api/photo/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa?ext=png",
      `sceneflow_access=${token}`,
    );
    check(
      "an unlocked visitor still gets 404 for a photograph that is not there",
      unlockedPhoto.status === 404,
    );

    // --- Changing the code locks the unlocked device out again. This is the
    // console's "New code" button, and it is the only off switch there is.
    fs.writeFileSync(CODE_FILE, "000111\n", "utf-8");
    const stale = await get("/", `sceneflow_access=${token}`);
    check(
      "changing the code locks out a device that was already in",
      stale.body.includes("Access code") && leaked(stale.body).length === 0,
    );
  } finally {
    restore(saved);
  }

  console.log("-".repeat(63));
  console.log(failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error("verification could not run:", e.message);
  process.exit(1);
});
