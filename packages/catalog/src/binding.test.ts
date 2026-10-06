import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every local app must listen on this machine only, unless it says otherwise
 * in its own name.
 *
 * This is here because it was found in production, on the CEO's laptop, in a
 * screenshot he sent for an unrelated reason:
 *
 *   - Local:    http://localhost:4000
 *   - Network:  http://100.75.144.111:4000
 *
 * That is the Development Control Center, which runs git, pnpm and PowerShell
 * on the machine it is on. Its own next.config.ts says it must never be
 * reachable from a network -- "that would be remote code execution as a
 * service" -- and it had been reachable from every device on his home Wi-Fi
 * and his private network the whole time, because `next start` defaults to
 * 0.0.0.0 and nobody had said otherwise.
 *
 * A comment saying an app is local is not a control. A --hostname flag is.
 *
 * SceneFlow's `start:network` is the one deliberate exception: it exists to be
 * opened from a phone, it announces that in its name, and it is the only app
 * with an access code in front of it.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const APPS = path.join(REPO_ROOT, "apps");

const LOOPBACK = "--hostname 127.0.0.1";

async function appScripts(): Promise<
  { app: string; scripts: Record<string, string> }[]
> {
  const entries = await readdir(APPS, { withFileTypes: true });
  const found: { app: string; scripts: Record<string, string> }[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifest = path.join(APPS, entry.name, "package.json");
    try {
      const raw = JSON.parse(await readFile(manifest, "utf-8")) as {
        scripts?: Record<string, string>;
      };
      found.push({ app: entry.name, scripts: raw.scripts ?? {} });
    } catch {
      // No manifest: not an app.
    }
  }
  return found;
}

describe("local apps listen on this machine only", () => {
  it("finds the apps at all, so this cannot pass by testing nothing", async () => {
    const apps = await appScripts();
    expect(apps.length).toBeGreaterThanOrEqual(5);
    expect(apps.map((a) => a.app)).toContain("control-center");
  });

  it("binds every `start` and `dev` to loopback", async () => {
    for (const { app, scripts } of await appScripts()) {
      for (const name of ["start", "dev"] as const) {
        const script = scripts[name];
        if (script === undefined || !script.includes("next ")) continue;
        expect(script, `${app} -> ${name}`).toContain(LOOPBACK);
      }
    }
  });

  it("allows 0.0.0.0 only in a script whose name says so", async () => {
    for (const { app, scripts } of await appScripts()) {
      for (const [name, script] of Object.entries(scripts)) {
        if (!script.includes("0.0.0.0")) continue;
        expect(name, `${app} -> ${name} binds every interface`).toMatch(/network/i);
      }
    }
  });

  it("keeps SceneFlow's deliberate network start, so this rule is not read as a ban", async () => {
    const apps = await appScripts();
    const sceneflow = apps.find((a) => a.app === "sceneflow");
    expect(sceneflow?.scripts["start:network"]).toContain("0.0.0.0");
  });
});
