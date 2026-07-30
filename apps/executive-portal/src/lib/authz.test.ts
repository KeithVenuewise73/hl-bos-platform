import { describe, it, expect } from "vitest";
import {
  canView,
  viewsFor,
  roleFromPermissions,
  isPortalRole,
  VIEWS,
  type PortalRole,
  type PortalView,
} from "./authz";

const ALL_ROLES: PortalRole[] = [
  "platform_owner",
  "executive",
  "administrator",
  "developer",
  "read_only_auditor",
];
const ALL_VIEWS: PortalView[] = VIEWS.map((v) => v.view);

describe("authorization boundary — unauthenticated", () => {
  it("a null (unauthenticated) role can see NOTHING", () => {
    for (const v of ALL_VIEWS) {
      expect(canView(null, v), `null must not see ${v}`).toBe(false);
    }
    expect(viewsFor(null)).toEqual([]);
  });
});

describe("authorization boundary — role matrix", () => {
  it("platform_owner sees every view", () => {
    for (const v of ALL_VIEWS) expect(canView("platform_owner", v)).toBe(true);
  });

  it("executive sees commercial and decisions (sensitive)", () => {
    expect(canView("executive", "commercial")).toBe(true);
    expect(canView("executive", "decisions")).toBe(true);
  });

  it("administrator sees operational but NOT commercial/decisions", () => {
    expect(canView("administrator", "deployment")).toBe(true);
    expect(canView("administrator", "commercial")).toBe(false);
    expect(canView("administrator", "decisions")).toBe(false);
  });

  it("developer sees technical but NOT commercial/decisions/deployment", () => {
    expect(canView("developer", "modules")).toBe(true);
    expect(canView("developer", "readiness")).toBe(true);
    expect(canView("developer", "commercial")).toBe(false);
    expect(canView("developer", "decisions")).toBe(false);
    expect(canView("developer", "deployment")).toBe(false);
  });

  it("read_only_auditor sees non-sensitive views only", () => {
    expect(canView("read_only_auditor", "catalog")).toBe(true);
    expect(canView("read_only_auditor", "platform_health")).toBe(true);
    expect(canView("read_only_auditor", "commercial")).toBe(false);
    expect(canView("read_only_auditor", "decisions")).toBe(false);
    expect(canView("read_only_auditor", "deployment")).toBe(false);
  });

  it("sensitive views (commercial, decisions) are owner/executive only", () => {
    for (const role of ALL_ROLES) {
      const allowed = role === "platform_owner" || role === "executive";
      expect(canView(role, "commercial")).toBe(allowed);
      expect(canView(role, "decisions")).toBe(allowed);
    }
  });

  it("transformation intelligence is owner/executive/administrator only", () => {
    for (const role of ALL_ROLES) {
      const allowed =
        role === "platform_owner" || role === "executive" || role === "administrator";
      expect(canView(role, "intelligence")).toBe(allowed);
    }
  });

  it("government contracts is owner/executive only", () => {
    for (const role of ALL_ROLES) {
      const allowed = role === "platform_owner" || role === "executive";
      expect(canView(role, "government")).toBe(allowed);
    }
  });

  it("every role can see the dashboard and catalog", () => {
    for (const role of ALL_ROLES) {
      expect(canView(role, "dashboard")).toBe(true);
      expect(canView(role, "catalog")).toBe(true);
    }
  });
});

describe("role resolution from HL-BOS permissions", () => {
  it("maps permissions to the least-privilege role", () => {
    expect(roleFromPermissions(["platform.owner"])).toBe("platform_owner");
    expect(roleFromPermissions(["platform.console.executive"])).toBe("executive");
    expect(roleFromPermissions(["platform.console.admin"])).toBe("administrator");
    expect(roleFromPermissions(["platform.console.read"])).toBe("developer");
    expect(roleFromPermissions(["platform.audit.read"])).toBe("read_only_auditor");
  });

  it("no relevant permission → null (no access)", () => {
    expect(roleFromPermissions([])).toBeNull();
    expect(roleFromPermissions(["some.tenant.permission"])).toBeNull();
  });

  it("owner permission wins over lesser ones", () => {
    expect(roleFromPermissions(["platform.console.read", "platform.owner"])).toBe(
      "platform_owner",
    );
  });
});

describe("role validation", () => {
  it("accepts only valid roles", () => {
    for (const r of ALL_ROLES) expect(isPortalRole(r)).toBe(true);
    expect(isPortalRole("admin")).toBe(false);
    expect(isPortalRole("")).toBe(false);
    expect(isPortalRole(undefined)).toBe(false);
  });
});
