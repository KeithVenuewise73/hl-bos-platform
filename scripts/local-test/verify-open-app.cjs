#!/usr/bin/env node
/**
 * The Control Center as a desktop app: scripts/open-app.mjs and the last step
 * of scripts/control-center.bat.
 *
 *   1. its decisions, in-process: which browser, which arguments, what is
 *      said when the console is late, when no browser is installed, when a
 *      program cannot start (nothing is ever reported opened when it was not)
 *   2. for real: the launcher waits for a console that starts late, then
 *      starts a browser the way it does on a person's computer, and the
 *      browser is asked which page it opened (the console's, with its title)
 *   3. Windows only: the exact lines of control-center.bat's last step, run by
 *      real cmd.exe from a folder with "(x86)" in its name, start the app
 *      window launcher and then the console
 *
 * Usage:
 *   node scripts/local-test/verify-open-app.cjs
 *   env OPEN_APP_TEST_BROWSER  a Chromium-based browser to use (Linux sandbox);
 *                              on Windows the real Microsoft Edge is used
 */
const { spawn, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = path.join(__dirname, "..", "..");
const WINDOWS = process.platform === "win32";
const MODULE = pathToFileURL(path.join(ROOT, "scripts", "open-app.mjs")).href;

let failures = 0;
let checks = 0;
function check(name, ok, detail) {
  checks += 1;
  if (ok) console.log(`  OK    ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(300);
  }
  return null;
}
function freePort() {
  return new Promise((resolve) => {
    const s = http.createServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}
const fakeConsole = (port) =>
  new Promise((resolve) => {
    const s = http
      .createServer((req, res) => {
        // A real console takes a moment to render; so does this one.
        setTimeout(() => {
          res.writeHead(200, { "content-type": "text/html" });
          res.end("<title>Fake Control Center</title><p>ready</p>");
        }, 1200);
      })
      .listen(port, "127.0.0.1", () => resolve(s));
  });

/** Stop browsers started from the app profile (they outlive the launcher). */
function stopAppBrowsers() {
  try {
    if (WINDOWS) {
      execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*.hlbos*app-profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
        ],
        { stdio: "ignore" },
      );
    } else {
      execFileSync("pkill", ["-f", "user-data-dir=.*[.]hlbos/app-profile"], {
        stdio: "ignore",
      });
    }
  } catch {
    // nothing was running
  }
}

async function inProcess() {
  const m = await import(MODULE);

  console.log("\n1. Its decisions");
  const env = {
    "ProgramFiles(x86)": "X86",
    ProgramFiles: "PF",
    LOCALAPPDATA: "LOCAL",
  };
  const names = m.browserCandidates(env).map((c) => `${c.name}:${c.exe}`);
  check(
    "Microsoft Edge is tried first, then Google Chrome",
    names[0].startsWith("Microsoft Edge:") &&
      names.findIndex((n) => n.startsWith("Google Chrome")) >
        names.findLastIndex((n) => n.startsWith("Microsoft Edge")),
    names.join(" | "),
  );
  check(
    "a browser chosen for a test comes before all of them",
    m.browserCandidates({ ...env, HLBOS_APP_BROWSER: "T" })[0].exe === "T",
  );
  check(
    "the first browser that is really installed is the one used",
    m.findBrowser(env, (p) => p.includes("Chrome") && p.includes("PF"))?.name ===
      "Google Chrome" && m.findBrowser(env, () => false) === null,
  );
  const args = m.appArguments("http://localhost:4000", "P", "--a  --b=1");
  check(
    "the arguments make an app window, with its own profile, and nothing stray",
    args[0] === "--app=http://localhost:4000" &&
      args.includes("--user-data-dir=P") &&
      args.includes("--no-first-run") &&
      args.includes("--a") &&
      args.includes("--b=1") &&
      !args.includes(""),
    JSON.stringify(args),
  );

  const url = "http://localhost:4000";
  const edge = { name: "Microsoft Edge", exe: "E" };
  const run = async (deps) => {
    const started = [];
    const msg = await m.openApp(
      url,
      { HLBOS_APP_WAIT_MS: "1000" },
      {
        wait: async () => true,
        find: () => edge,
        profile: path.join(os.tmpdir(), "open-app-profile-test"),
        start: async (exe, a) => {
          started.push([exe, a]);
          return true;
        },
        ...deps,
      },
    );
    return { msg, started };
  };
  let r = await run({});
  check(
    "console up and Edge installed: Edge starts once, as an app window",
    r.started.length === 1 &&
      r.started[0][0] === "E" &&
      r.started[0][1][0] === `--app=${url}` &&
      /own window \(Microsoft Edge\)/.test(r.msg),
    r.msg,
  );
  r = await run({ wait: async () => false });
  check(
    "console never answers: nothing is opened, and it says why",
    r.started.length === 0 && /did not answer/.test(r.msg),
    r.msg,
  );
  r = await run({
    start: async (exe) => {
      (r.started ??= []).push(exe);
      return exe !== "E";
    },
  });
  check(
    "Edge cannot start: the console opens as a browser tab instead, and says so",
    /could not be started, so the console opened as a tab/.test(r.msg),
    r.msg,
  );
  r = await run({ find: () => null });
  check(
    "no Edge or Chrome: a browser tab, and it says so",
    r.started.length === 1 &&
      r.started[0][0] === "explorer.exe" &&
      /were not found, so the console opened as a tab/.test(r.msg),
    r.msg,
  );
  r = await run({ find: () => null, start: async () => false });
  check(
    "nothing can be started: it does not claim a window opened",
    /no browser could be opened for you/.test(r.msg) && !/own window/.test(r.msg),
    r.msg,
  );

  const port = await freePort();
  const late = setTimeout(async () => {
    late.server = await fakeConsole(port);
  }, 1500);
  const t0 = Date.now();
  const got = await m.waitForConsole(`http://127.0.0.1:${port}`, 15000);
  check(
    "waiting for a console that starts late returns once it answers, not before",
    got === true && Date.now() - t0 >= 1000,
    `${Date.now() - t0} ms`,
  );
  late.server?.close();
  const dead = await freePort();
  check(
    "waiting for a console that never starts gives up",
    (await m.waitForConsole(`http://127.0.0.1:${dead}`, 1500, () => sleep(200))) ===
      false,
  );
}

async function realBrowser() {
  console.log("\n2. A real browser, started the way a person's computer does");
  let browser = process.env.OPEN_APP_TEST_BROWSER || "";
  if (!browser && !WINDOWS) {
    try {
      browser = require("playwright").chromium.executablePath();
    } catch {
      const root = execFileSync("npm", ["root", "-g"]).toString().trim();
      browser = require(path.join(root, "playwright")).chromium.executablePath();
    }
  }
  const port = await freePort();
  const cdp = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    HLBOS_APP_WAIT_MS: "60000",
    HLBOS_APP_ARGS: `--headless=new --remote-debugging-port=${cdp} --disable-gpu${WINDOWS ? "" : " --no-sandbox"}`,
  };
  if (browser) env.HLBOS_APP_BROWSER = browser;
  else delete env.HLBOS_APP_BROWSER;

  let out = "";
  const child = spawn(
    process.execPath,
    [path.join(ROOT, "scripts", "open-app.mjs"), url],
    {
      env,
    },
  );
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  const exited = new Promise((r) => child.on("close", r));

  await sleep(2500);
  check(
    "while the console is not up yet, no window is opened",
    !(await fetch(`http://127.0.0.1:${cdp}/json`).then(
      () => true,
      () => false,
    )),
  );
  const server = await fakeConsole(port);
  let page = null;
  let seen = "no page";
  try {
    // The window appears at the console's address at once; its title arrives
    // when the page has loaded, so wait for that rather than read it early.
    page = await until(async () => {
      try {
        const list = await (await fetch(`http://127.0.0.1:${cdp}/json`)).json();
        const t = list.find((x) => x.type === "page" && x.url.startsWith(url));
        if (t) seen = JSON.stringify({ url: t.url, title: t.title });
        return t && t.title === "Fake Control Center" ? t : null;
      } catch {
        return null;
      }
    }, 60000);
    check(
      "once the console is up, the browser opens its page (address, then title once loaded)",
      page !== null,
      seen,
    );
    await Promise.race([exited, sleep(20000)]);
    check(
      "the launcher says it opened the app window and exits",
      /opened the Control Center in its own window/.test(out),
      out.trim(),
    );
    check(
      "the app window has its own profile folder, not the everyday browser's",
      fs.existsSync(path.join(ROOT, ".hlbos", "app-profile")),
    );
  } finally {
    server.close();
    stopAppBrowsers();
    child.kill();
    await sleep(1000);
    fs.rmSync(path.join(ROOT, ".hlbos", "app-profile"), {
      recursive: true,
      force: true,
    });
  }
}

/** The exact last step of control-center.bat, run by real cmd.exe. */
async function batchStep() {
  console.log("\n3. The last step of control-center.bat (real cmd.exe)");
  const bat = fs.readFileSync(
    path.join(ROOT, "scripts", "control-center.bat"),
    "latin1",
  );
  check(
    "the launcher still has Windows line endings",
    /\r\n/.test(bat) && !/[^\r]\n/.test(bat),
  );
  const from = bat.indexOf("REM --- 7. Go");
  const to = bat.indexOf("goto :eof", from);
  const step = from >= 0 && to > from ? bat.slice(from, to + "goto :eof".length) : "";
  const lines = step.split(/\r\n/);
  const labels = [...step.matchAll(/^:(\w+)/gm)].map((x) => x[1]);
  const jumps = [...step.matchAll(/goto :(\w+)/g)]
    .map((x) => x[1])
    .filter((l) => l !== "eof");
  check(
    "it jumps only to labels that exist, and has no bracketed block to break",
    step !== "" &&
      jumps.every((j) => labels.includes(j)) &&
      !lines.some((l) => /\(\s*$/.test(l) && !/^REM/i.test(l)),
    JSON.stringify({ labels, jumps }),
  );
  if (!WINDOWS) {
    console.log("  (running it for real needs Windows: skipped here)");
    return;
  }
  // A folder with "(x86)" in its name, like "Program Files (x86)".
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "cc-bat-"));
  const root = path.join(base, "Program Files (x86)", "HL-BOS");
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  const stamp = (name) => path.join(root, name);
  fs.writeFileSync(
    path.join(root, "scripts", "open-app.mjs"),
    `import fs from "node:fs"; fs.writeFileSync(${JSON.stringify(stamp("opened.txt"))}, process.argv.slice(2).join(" "));`,
  );
  fs.writeFileSync(
    path.join(root, "pnpm-stub.cjs"),
    `require("node:fs").writeFileSync(${JSON.stringify(stamp("served.txt"))}, process.argv.slice(2).join(" "));`,
  );
  const prelude = [
    "@echo off",
    `set "ROOT=${root}"`,
    `set "NODE_EXE=${process.execPath}"`,
    `set "PNPM_CJS=${path.join(root, "pnpm-stub.cjs")}"`,
  ].join("\r\n");
  const file = path.join(base, "step7.bat");
  fs.writeFileSync(file, `${prelude}\r\n${step}\r\n`);
  const done = new Promise((resolve) => {
    const c = spawn("cmd.exe", ["/c", file], { stdio: "ignore" });
    c.on("close", resolve);
  });
  await Promise.race([done, sleep(30000)]);
  await sleep(1500);
  check(
    "the app window launcher is started with the console's address",
    fs.existsSync(stamp("opened.txt")) &&
      fs.readFileSync(stamp("opened.txt"), "utf8") === "http://localhost:4000",
  );
  check(
    "then the console itself is started",
    fs.existsSync(stamp("served.txt")) &&
      /control-center start/.test(fs.readFileSync(stamp("served.txt"), "utf8")),
  );
  // An older copy of the folder without the launcher still opens a browser tab.
  fs.rmSync(path.join(root, "scripts", "open-app.mjs"));
  fs.rmSync(stamp("opened.txt"));
  fs.rmSync(stamp("served.txt"));
  await new Promise((resolve) => {
    const c = spawn("cmd.exe", ["/c", file], { stdio: "ignore" });
    c.on("close", resolve);
  });
  check(
    "without the launcher file (an older copy), the console still starts",
    fs.existsSync(stamp("served.txt")),
  );
  fs.rmSync(base, { recursive: true, force: true });
}

(async () => {
  try {
    await inProcess();
    await realBrowser();
    await batchStep();
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  the test itself stopped: ${e && e.stack ? e.stack : e}`);
  }
  console.log(
    `\n${failures === 0 ? "ALL" : checks - failures} OF ${checks} CHECK(S) ${failures === 0 ? "PASSED" : `PASSED; ${failures} FAILED`}`,
  );
  process.exit(failures === 0 ? 0 : 1);
})();
