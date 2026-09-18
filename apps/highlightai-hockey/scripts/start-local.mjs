/**
 * Start HighlightAI Hockey on this machine — the app and its vision service.
 *
 * The operating contract says no instruction may require the CEO to open a
 * terminal. This product is two processes, so "start the Python service, then
 * start the app" would be an engineering chore handed to him. This script is
 * the alternative: the Control Center spawns `node`, and this brings up both.
 *
 * TWO SAFETY PROPERTIES, and they are deliberately coupled:
 *
 *   1. It sets HL_BOS_ENV=local, which turns OFF the sign-in requirement.
 *   2. It binds to 127.0.0.1 ONLY.
 *
 * (1) alone would be dangerous: run on a public host it would serve video of a
 * child to anyone who found the address, which is exactly what the deployment
 * gate exists to prevent. (2) is why (1) is safe here — nothing outside this
 * machine can reach the port at all. Deployments do NOT use this script; they
 * run the standalone server, where the gate applies in full and refuses
 * without an identity provider.
 *
 * If Python or the vision service will not start, the app still starts. It
 * then reports honestly that analysis is unavailable, and says what would fix
 * it. That is better than refusing to open at all: creating a game and
 * uploading a video both work without it.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const repoRoot = resolve(appRoot, "..", "..");
const serviceRoot = join(repoRoot, "services", "hockey-vision");

const PORT = process.env["HOCKEY_PORT"] ?? "4650";
const VISION_PORT = process.env["HOCKEY_VISION_PORT"] ?? "4700";
const dataDir = process.env["HOCKEY_DATA_DIR"] ?? join(appRoot, ".data");
const mediaRoot = process.env["HOCKEY_MEDIA_ROOT"] ?? join(dataDir, "media");

/** The first Python that exists. Windows ships `python`, Linux `python3`. */
function findPython() {
  for (const candidate of ["python3", "python"]) {
    const probe = spawnSync(candidate, ["--version"], { stdio: "ignore" });
    if (probe.status === 0) return candidate;
  }
  return null;
}

function startVisionService() {
  if (!existsSync(join(serviceRoot, "hockey_vision", "api.py"))) {
    console.log(
      "• The vision service is not in this checkout, so analysis will be unavailable.",
    );
    return null;
  }
  const python = findPython();
  if (python === null) {
    console.log("• Python is not installed, so analysis will be unavailable.");
    console.log("  Everything else works: you can create a game and upload a video.");
    return null;
  }
  const child = spawn(python, ["-m", "hockey_vision.api"], {
    cwd: serviceRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      HOCKEY_MEDIA_ROOT: mediaRoot,
      HOCKEY_VISION_PORT: VISION_PORT,
      HOCKEY_DETECTOR: process.env["HOCKEY_DETECTOR"] ?? "motion",
      HOCKEY_NUMBER_READER: process.env["HOCKEY_NUMBER_READER"] ?? "none",
    },
  });
  child.on("error", (error) => {
    console.log(`• The vision service would not start (${error.message}).`);
    console.log("  Analysis will be unavailable; the app will say so.");
  });
  return child;
}

const vision = startVisionService();

const app = spawn(
  process.execPath,
  [
    join(appRoot, "node_modules", "next", "dist", "bin", "next"),
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    PORT,
  ],
  {
    cwd: appRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      // Local operator, at their own machine, on loopback only. See above for
      // why these two go together and never apart.
      HL_BOS_ENV: "local",
      HOCKEY_DATA_DIR: dataDir,
      HOCKEY_MEDIA_ROOT: mediaRoot,
      HOCKEY_VISION_URL:
        process.env["HOCKEY_VISION_URL"] ?? `http://127.0.0.1:${VISION_PORT}`,
    },
  },
);

/** Take the vision service down with the app, so a restart is not two steps. */
function shutdown() {
  if (vision !== null && vision.exitCode === null) vision.kill();
  if (app.exitCode === null) app.kill();
}
process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});
process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});
app.on("exit", (code) => {
  shutdown();
  process.exit(code ?? 0);
});
