import "server-only";

import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";

import {
  awayAddresses,
  codeFromBytes,
  phoneAddresses,
  phoneUrl,
  SCENEFLOW_PORT,
} from "./sceneflow-access";
import { pnpm, REPO_ROOT, spawnPnpm } from "./shell";
import { explain } from "./translate";

/**
 * Starting SceneFlow so a phone can reach it.
 *
 * There is one mode on purpose. A "local only" start and a "phone" start would
 * be two buttons that contradict each other the moment one is pressed while the
 * other is running, and the operator would have no way to tell which one is
 * live. So SceneFlow always listens on the network and ALWAYS has an access
 * code -- the code, not the binding, is what keeps it private.
 *
 * The code lives in a file rather than an environment variable so this console
 * can write it and the app can read it with no configuration layer between
 * them, and so the operator can be shown it without opening anything.
 */

const FILTER = "@hl-bos/sceneflow-app";
const CODE_FILE = join(REPO_ROOT, ".sceneflow", "access-code.txt");

export interface SceneFlowStatus {
  readonly running: boolean;
  /** Addresses a phone on the same Wi-Fi can open. Empty when there is none. */
  readonly phoneUrls: readonly string[];
  /**
   * Addresses that work from anywhere, over the private Tailscale network.
   * Empty when Tailscale is not installed, not signed in, or not running --
   * from here those three are indistinguishable, and all three mean the same
   * thing to the person reading the panel.
   */
  readonly awayUrls: readonly string[];
  /** The current access code, or "" when none is set. */
  readonly code: string;
  /** Plain English. Never a stack trace. */
  readonly detail: string;
}

/** 24 random bits, as a number, for codeFromBytes to shape into six digits. */
function draw(): number {
  return randomBytes(3).readUIntBE(0, 3);
}

async function readCode(): Promise<string> {
  try {
    return (await readFile(CODE_FILE, "utf-8")).trim();
  } catch {
    return "";
  }
}

async function writeCode(code: string): Promise<void> {
  await mkdir(dirname(CODE_FILE), { recursive: true });
  await writeFile(CODE_FILE, `${code}\n`, "utf-8");
}

/** Ask SceneFlow whether it is up. Short timeout: this runs during a render. */
async function healthy(): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${SCENEFLOW_PORT}/api/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function sceneflowStatus(): Promise<SceneFlowStatus> {
  const [running, code] = await Promise.all([healthy(), readCode()]);
  const interfaces = networkInterfaces();
  const phone = phoneAddresses(interfaces).map((a) => phoneUrl(a));
  const away = awayAddresses(interfaces).map((a) => phoneUrl(a));
  return {
    running,
    phoneUrls: phone,
    awayUrls: away,
    code,
    detail: describe(running, phone.length > 0),
  };
}

function describe(running: boolean, reachable: boolean): string {
  if (!running) return "Not running. Start it below.";
  if (!reachable) {
    // Honest rather than convenient: it is up, and this machine has no address
    // a phone could use, so saying "open it on your phone" would be a lie.
    return "Running on this PC. No home-network address was found, so a phone cannot reach it — the PC is probably on a VPN, or not on Wi-Fi.";
  }
  return "Running. Open the address below on your phone and type the code.";
}

export interface LaunchResult {
  readonly ok: boolean;
  /** Plain English, always. Never a stack trace. */
  readonly message: string;
  /** The raw output, for whoever debugs it. Shown collapsed, never as the headline. */
  readonly detail?: string;
}

/**
 * Build it, start it, and wait until it actually answers.
 *
 * It would be easy to spawn the process and report success; the phone would
 * then land on a connection error. So this waits for a real health response and
 * says so honestly if one never arrives.
 */
export async function startSceneFlow(): Promise<LaunchResult> {
  try {
    if ((await readCode()) === "") await writeCode(codeFromBytes(draw));
  } catch (error) {
    // Writing the code is the first thing that touches the disk, so it is the
    // first thing that can fail on a machine with an unusual profile path or a
    // read-only folder. Say so rather than dying before the panel hears back.
    return {
      ok: false,
      message: `Could not save the access code, so SceneFlow was not started. ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  if (await healthy()) {
    return { ok: true, message: "SceneFlow was already running." };
  }

  const build = await pnpm(["--filter", FILTER, "build"], {
    timeoutMs: 600_000,
  });
  if (!build.ok) {
    // Through the translator, not raw. The first version of this handed the
    // operator the tail of a Node stack trace as the reason his button did
    // nothing, which is the exact failure translate.ts exists to prevent.
    const why = explain(build.output);
    return {
      ok: false,
      message: `${why.headline} ${why.meaning}`,
      detail: build.output.slice(-1200),
    };
  }

  const spawned = spawnPnpm(["--filter", FILTER, "start:network"], {
    cwd: REPO_ROOT,
  });
  if (!spawned.ok) {
    const why = explain(spawned.error ?? "");
    return {
      ok: false,
      message: `${why.headline} ${why.meaning}`,
      detail: spawned.error ?? "",
    };
  }

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await healthy()) return { ok: true, message: "SceneFlow is running." };
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return {
    ok: false,
    message: `SceneFlow was started but never answered on port ${SCENEFLOW_PORT}. Nothing was opened, because an address that will not load is worse than none.`,
  };
}

/**
 * Replace the code.
 *
 * This is the off switch. Every phone that was let in holds a cookie derived
 * from the old code, so changing it locks all of them out at once, including
 * this machine. It does NOT stop SceneFlow listening -- it is still on the
 * network until it is closed -- which is exactly why the new code is what
 * matters and why the panel says so.
 */
export async function newSceneFlowCode(): Promise<LaunchResult> {
  const code = codeFromBytes(draw);
  await writeCode(code);
  return {
    ok: true,
    message: `The code is now ${code}. Every device that was let in has to type it again.`,
  };
}
