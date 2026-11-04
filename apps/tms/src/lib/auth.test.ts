import { describe, expect, it } from "vitest";
import { readSession, signSession } from "./auth.ts";

const USER = "a0000000-0000-4000-8000-000000000001";
const SECRET = "test-secret";

describe("session cookie", () => {
  it("round-trips a signed session", () => {
    expect(readSession(signSession(USER, SECRET), SECRET)).toBe(USER);
  });
  it("refuses a tampered user id, a wrong secret, and an expired session", () => {
    const t = signSession(USER, SECRET);
    expect(
      readSession(t.replace(USER, "b0000000-0000-4000-8000-000000000001"), SECRET),
    ).toBeNull();
    expect(readSession(t, "other-secret")).toBeNull();
    expect(
      readSession(signSession(USER, SECRET, Date.now() - 13 * 3600_000), SECRET),
    ).toBeNull();
    expect(readSession("garbage", SECRET)).toBeNull();
    expect(readSession(undefined, SECRET)).toBeNull();
  });
});
