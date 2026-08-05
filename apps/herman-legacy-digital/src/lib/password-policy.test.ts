import { describe, it, expect } from "vitest";
import { validateNewPassword, MIN_PASSWORD_LENGTH } from "./password-policy";

describe("validateNewPassword", () => {
  it("accepts a sufficiently long, matching password", () => {
    expect(validateNewPassword("correcthorse", "correcthorse")).toEqual({
      ok: true,
    });
  });

  it("rejects a password shorter than the minimum", () => {
    const short = "a".repeat(MIN_PASSWORD_LENGTH - 1);
    const r = validateNewPassword(short, short);
    expect(r.ok).toBe(false);
    expect(r.message).toContain(String(MIN_PASSWORD_LENGTH));
  });

  it("rejects a mismatch even when long enough", () => {
    const r = validateNewPassword("longenough1", "longenough2");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/do not match/i);
  });

  it("checks length before match (length is the first failure reported)", () => {
    const r = validateNewPassword("short", "different");
    expect(r.ok).toBe(false);
    expect(r.message).toContain(String(MIN_PASSWORD_LENGTH));
  });
});
