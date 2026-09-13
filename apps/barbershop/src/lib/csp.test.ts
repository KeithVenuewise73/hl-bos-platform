import { describe, it, expect } from "vitest";
import { policy } from "./csp";

const NONCE = "K2g93hqDaegovFgQ1Mo3OA==";

function directive(csp: string, name: string): string {
  const found = csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith(name + " "));
  return found ?? "";
}

describe("the policy must let this app's own scripts run", () => {
  it("carries the nonce in script-src", () => {
    expect(directive(policy(NONCE), "script-src")).toContain(`'nonce-${NONCE}'`);
  });

  it("is NOT a bare script-src 'self', which is what broke the first deployment", () => {
    // Next hydrates through inline `self.__next_f.push(...)` scripts. A policy
    // naming neither a nonce nor 'unsafe-inline' blocks every one of them, and
    // the page renders perfectly while being completely dead -- no button has a
    // handler. That shipped once. This is the test that would have caught it.
    const script = directive(policy(NONCE), "script-src");
    expect(script).not.toBe("script-src 'self'");
    expect(
      script.includes("'nonce-") || script.includes("'unsafe-inline'"),
      "script-src must permit the inline hydration bootstrap somehow",
    ).toBe(true);
  });

  it("gives a different policy for a different nonce", () => {
    expect(policy("aaa")).not.toBe(policy("bbb"));
  });
});

describe("and nothing else", () => {
  it("allows the browser to reach Supabase and nowhere else", () => {
    expect(directive(policy(NONCE), "connect-src")).toBe(
      "connect-src 'self' https://*.supabase.co",
    );
  });

  it("keeps the rest shut", () => {
    const csp = policy(NONCE);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(directive(csp, "default-src")).toBe("default-src 'self'");
  });

  it("does not permit inline scripts wholesale", () => {
    // 'unsafe-inline' would also fix hydration, and would hand any injected
    // string the ability to execute. The nonce is the point.
    expect(directive(policy(NONCE), "script-src")).not.toContain("'unsafe-inline'");
  });
});
