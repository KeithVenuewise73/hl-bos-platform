import { describe, it, expect } from "vitest";
import { canView, canManage, canDecide, roleFromPermissions } from "./authz";

describe("authorization matrix", () => {
  it("unauthenticated (null role) sees nothing", () => {
    expect(canView(null, { operating: false })).toBe(false);
    expect(canView(null, { operating: true })).toBe(false);
    expect(canManage(null)).toBe(false);
    expect(canDecide(null)).toBe(false);
  });

  it("viewer can read non-operating views but cannot manage or decide", () => {
    expect(canView("viewer", { operating: false })).toBe(true);
    expect(canView("viewer", { operating: true })).toBe(false);
    expect(canManage("viewer")).toBe(false);
    expect(canDecide("viewer")).toBe(false);
  });

  it("executive/admin can manage but cannot decide", () => {
    for (const r of ["executive", "platform_admin"] as const) {
      expect(canManage(r)).toBe(true);
      expect(canDecide(r)).toBe(false);
    }
  });

  it("ONLY the CEO (platform_owner) can record a decision", () => {
    expect(canDecide("platform_owner")).toBe(true);
    expect(canDecide("platform_admin")).toBe(false);
    expect(canDecide("executive")).toBe(false);
    expect(canDecide("viewer")).toBe(false);
  });

  it("maps permissions least-privilege", () => {
    expect(roleFromPermissions(["platform.owner"])).toBe("platform_owner");
    expect(roleFromPermissions(["platform.console.admin"])).toBe("platform_admin");
    expect(roleFromPermissions(["platform.console.executive"])).toBe("executive");
    expect(roleFromPermissions(["platform.audit.read"])).toBe("viewer");
    expect(roleFromPermissions(["none"])).toBeNull();
  });
});
