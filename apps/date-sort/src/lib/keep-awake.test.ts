/**
 * Keeping Windows awake is checked against Windows itself: `powercfg
 * /requests` lists every program currently holding the computer awake. The
 * request must appear while a copy holds it and be gone once released, so
 * the page never claims "will not go to sleep" on a request Windows ignored.
 * (powercfg /requests needs an administrator, which the Windows CI runner is.)
 */
import { execFileSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { keepAwake } = await import("./keep-awake");

/** The SYSTEM section of powercfg /requests: who is keeping the computer on. */
function systemRequests(): string {
  const out = execFileSync("powercfg", ["/requests"], { encoding: "utf8" });
  const m = /SYSTEM:\s*\r?\n([\s\S]*?)\r?\n\s*\r?\nAWAYMODE:/.exec(out);
  return m?.[1] ?? out;
}

const settle = () => new Promise((r) => setTimeout(r, 1500));

describe.runIf(process.platform === "win32")("keeping Windows awake", () => {
  it("holds a request Windows can see, and lets it go", async () => {
    expect(systemRequests()).not.toMatch(/powershell/i);
    const awake = await keepAwake();
    expect(awake.held).toBe(true);
    expect(systemRequests()).toMatch(/powershell/i);
    awake.release();
    await settle();
    expect(systemRequests()).not.toMatch(/powershell/i);
  }, 60_000);
});

describe.runIf(process.platform !== "win32")("keeping awake elsewhere", () => {
  it("claims nothing it cannot do", async () => {
    const awake = await keepAwake();
    expect(awake.held).toBe(false);
    awake.release();
  });
});
