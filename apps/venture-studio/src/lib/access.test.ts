import { describe, it, expect } from "vitest";
import { devRoleFromEnv, roleFromClaims } from "./access";

describe("dev bypass is impossible in production", () => {
  it("returns null when NODE_ENV=production even with a dev role set", () => {
    expect(
      devRoleFromEnv({
        nodeEnv: "production",
        hlBosEnv: undefined,
        devRole: "platform_owner",
      }),
    ).toBeNull();
  });
  it("returns null when HL_BOS_ENV=production", () => {
    expect(
      devRoleFromEnv({
        nodeEnv: "development",
        hlBosEnv: "production",
        devRole: "platform_owner",
      }),
    ).toBeNull();
  });
  it("returns null when no dev role is set", () => {
    expect(
      devRoleFromEnv({
        nodeEnv: "development",
        hlBosEnv: undefined,
        devRole: undefined,
      }),
    ).toBeNull();
  });
  it("returns the role only in non-production with a valid role", () => {
    expect(
      devRoleFromEnv({
        nodeEnv: "development",
        hlBosEnv: undefined,
        devRole: "platform_owner",
      }),
    ).toBe("platform_owner");
  });
  it("rejects an invalid dev role", () => {
    expect(
      devRoleFromEnv({ nodeEnv: "development", hlBosEnv: undefined, devRole: "root" }),
    ).toBeNull();
  });
});

describe("roleFromClaims (fail-closed)", () => {
  it("returns null for non-object metadata", () => {
    expect(roleFromClaims(null)).toBeNull();
    expect(roleFromClaims("x")).toBeNull();
  });
  it("honors an explicit valid vstudio_role", () => {
    expect(roleFromClaims({ vstudio_role: "executive" })).toBe("executive");
  });
  it("maps platform permissions to a role", () => {
    expect(roleFromClaims({ platform_permissions: ["platform.owner"] })).toBe(
      "platform_owner",
    );
    expect(roleFromClaims({ platform_permissions: ["platform.console.read"] })).toBe(
      "viewer",
    );
  });
  it("returns null when no permission maps", () => {
    expect(roleFromClaims({ platform_permissions: ["something.else"] })).toBeNull();
  });
});
