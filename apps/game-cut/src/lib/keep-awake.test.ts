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

const { AWAKE_SCRIPT, keepAwake } = await import("./keep-awake");

/** A section of powercfg /requests: who is keeping the screen / computer on. */
function requests(section: "DISPLAY" | "SYSTEM"): string {
  const out = execFileSync("powercfg", ["/requests"], { encoding: "utf8" });
  const next = section === "DISPLAY" ? "SYSTEM" : "AWAYMODE";
  const m = new RegExp(
    `${section}:\\s*\\r?\\n([\\s\\S]*?)\\r?\\n\\s*\\r?\\n${next}:`,
  ).exec(out);
  return m?.[1] ?? "";
}
const systemRequests = () => requests("SYSTEM");
const displayRequests = () => requests("DISPLAY");

const settle = () => new Promise((r) => setTimeout(r, 1500));

describe.runIf(process.platform === "win32")("keeping Windows awake", () => {
  it("holds a request Windows can see, and lets it go", async () => {
    expect(systemRequests()).not.toMatch(/powershell/i);
    const awake = await keepAwake();
    expect(awake.held).toBe(true);
    expect(systemRequests()).toMatch(/powershell/i);
    // The screen too: on Modern Standby laptops, screen-off starts standby.
    expect(displayRequests()).toMatch(/powershell/i);
    awake.release();
    await settle();
    expect(systemRequests()).not.toMatch(/powershell/i);
    expect(displayRequests()).not.toMatch(/powershell/i);
  }, 60_000);
});

describe.runIf(process.platform !== "win32")("keeping awake elsewhere", () => {
  it("claims nothing it cannot do", async () => {
    const awake = await keepAwake();
    expect(awake.held).toBe(false);
    awake.release();
  });
});

describe("the keep-awake script itself", () => {
  // A find-and-replace of the app's name once turned `-Namespace DateSort` into
  // `-Namespace Game Cut`: a space splits one name into two, the command is
  // invalid, and Windows is never held awake. This fails on any machine if that
  // happens again.
  it("names its PowerShell type with a single word, so the command is valid", () => {
    expect(AWAKE_SCRIPT).toMatch(/-Name Power -Namespace [A-Za-z]+ -PassThru/);
  });

  it("asks for the system AND the screen to stay on, and closes cleanly", () => {
    expect(AWAKE_SCRIPT).toContain("0x80000003");
    expect(AWAKE_SCRIPT).toContain("[Console]::In.ReadToEnd()");
  });
});
