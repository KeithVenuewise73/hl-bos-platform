import { describe, it, expect } from "vitest";
import { devRoleFromEnv, roleFromClaims } from "./access";

describe("dev role bypass — MUST be impossible in production", () => {
  it("returns null when NODE_ENV=production, even with PORTAL_DEV_ROLE set", () => {
    expect(
      devRoleFromEnv({
        nodeEnv: "production",
        hlBosEnv: undefined,
        devRole: "platform_owner",
      }),
    ).toBeNull();
  });

  it("returns null when HL_BOS_ENV=production, even with PORTAL_DEV_ROLE set", () => {
    expect(
      devRoleFromEnv({
        nodeEnv: "development",
        hlBosEnv: "production",
        devRole: "platform_owner",
      }),
    ).toBeNull();
  });

  it("returns null in development when no dev role is set", () => {
    expect(
      devRoleFromEnv({
        nodeEnv: "development",
        hlBosEnv: undefined,
        devRole: undefined,
      }),
    ).toBeNull();
  });

  it("returns the role in development when explicitly set and valid", () => {
    expect(
      devRoleFromEnv({
        nodeEnv: "development",
        hlBosEnv: "development",
        devRole: "executive",
      }),
    ).toBe("executive");
  });

  it("returns null for an invalid dev role value", () => {
    expect(
      devRoleFromEnv({ nodeEnv: "development", hlBosEnv: undefined, devRole: "root" }),
    ).toBeNull();
  });
});

describe("role from claims — fail-closed", () => {
  it("reads an explicit valid portal_role claim", () => {
    expect(roleFromClaims({ portal_role: "administrator" })).toBe("administrator");
  });

  it("maps a platform_permissions array via least-privilege", () => {
    expect(roleFromClaims({ platform_permissions: ["platform.console.admin"] })).toBe(
      "administrator",
    );
    expect(roleFromClaims({ platform_permissions: ["platform.owner"] })).toBe(
      "platform_owner",
    );
  });

  it("returns null for missing/invalid/empty claims", () => {
    expect(roleFromClaims(null)).toBeNull();
    expect(roleFromClaims(undefined)).toBeNull();
    expect(roleFromClaims({})).toBeNull();
    expect(roleFromClaims({ portal_role: "root" })).toBeNull();
    expect(roleFromClaims({ platform_permissions: [1, 2] })).toBeNull();
    expect(roleFromClaims("owner")).toBeNull();
  });
});
