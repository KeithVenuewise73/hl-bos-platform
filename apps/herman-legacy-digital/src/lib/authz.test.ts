import { describe, it, expect } from "vitest";
import {
  roleFromClaims,
  internalRoleFromPermissions,
  isInternal,
  canAccessBTIC,
  bticScope,
  isInternalRole,
  devInternalRoleFromEnv,
  destinationFor,
} from "./authz";

describe("roleFromClaims — fail-closed role resolution", () => {
  it("anonymous (not authenticated) resolves to null regardless of metadata", () => {
    expect(
      roleFromClaims(
        { platform_permissions: ["platform.owner"] },
        { authenticated: false },
      ),
    ).toBeNull();
    expect(roleFromClaims(null, { authenticated: false })).toBeNull();
  });

  it("platform owner permission -> platform_owner", () => {
    expect(
      roleFromClaims(
        { platform_permissions: ["platform.owner"] },
        { authenticated: true },
      ),
    ).toBe("platform_owner");
  });

  it("console.admin / tenant.manage -> hld_admin", () => {
    expect(
      roleFromClaims(
        { platform_permissions: ["platform.console.admin"] },
        { authenticated: true },
      ),
    ).toBe("hld_admin");
    expect(
      roleFromClaims(
        { platform_permissions: ["platform.tenant.manage"] },
        { authenticated: true },
      ),
    ).toBe("hld_admin");
  });

  it("read-scoped internal permission -> hld_team_member", () => {
    expect(
      roleFromClaims(
        { platform_permissions: ["hld.btic.read"] },
        { authenticated: true },
      ),
    ).toBe("hld_team_member");
  });

  it("explicit hld_role / portal_role claim is honored when valid", () => {
    expect(
      roleFromClaims({ hld_role: "hld_team_member" }, { authenticated: true }),
    ).toBe("hld_team_member");
    expect(roleFromClaims({ portal_role: "hld_admin" }, { authenticated: true })).toBe(
      "hld_admin",
    );
  });

  it("authenticated with NO internal signal -> client", () => {
    expect(roleFromClaims({}, { authenticated: true })).toBe("client");
    expect(roleFromClaims({ platform_permissions: [] }, { authenticated: true })).toBe(
      "client",
    );
    expect(
      roleFromClaims(
        { platform_permissions: ["some.unrelated.perm"] },
        { authenticated: true },
      ),
    ).toBe("client");
    expect(roleFromClaims(undefined, { authenticated: true })).toBe("client");
  });

  it("malformed metadata never throws and never escalates", () => {
    expect(roleFromClaims({ hld_role: 123 }, { authenticated: true })).toBe("client");
    expect(
      roleFromClaims({ platform_permissions: [1, 2, 3] }, { authenticated: true }),
    ).toBe("client");
    expect(roleFromClaims("garbage", { authenticated: true })).toBe("client");
  });
});

describe("internalRoleFromPermissions", () => {
  it("prefers the most privileged role", () => {
    expect(
      internalRoleFromPermissions(["platform.console.admin", "platform.owner"]),
    ).toBe("platform_owner");
  });
  it("returns null when no internal permission present", () => {
    expect(internalRoleFromPermissions(["billing.read"])).toBeNull();
  });
});

describe("BTIC access gates", () => {
  it("internal roles can access BTIC; client and anonymous cannot", () => {
    expect(canAccessBTIC("platform_owner")).toBe(true);
    expect(canAccessBTIC("hld_admin")).toBe(true);
    expect(canAccessBTIC("hld_team_member")).toBe(true);
    expect(canAccessBTIC("client")).toBe(false);
    expect(canAccessBTIC(null)).toBe(false);
  });

  it("isInternal excludes client and anonymous", () => {
    expect(isInternal("hld_admin")).toBe(true);
    expect(isInternal("client")).toBe(false);
    expect(isInternal(null)).toBe(false);
  });

  it("bticScope: owner/admin full, team_member limited, else none", () => {
    expect(bticScope("platform_owner")).toBe("full");
    expect(bticScope("hld_admin")).toBe("full");
    expect(bticScope("hld_team_member")).toBe("limited");
    expect(bticScope("client")).toBe("none");
    expect(bticScope(null)).toBe("none");
  });
});

describe("isInternalRole validator", () => {
  it("accepts only the three internal roles", () => {
    expect(isInternalRole("platform_owner")).toBe(true);
    expect(isInternalRole("hld_admin")).toBe(true);
    expect(isInternalRole("hld_team_member")).toBe(true);
    expect(isInternalRole("client")).toBe(false);
    expect(isInternalRole("admin")).toBe(false);
    expect(isInternalRole(null)).toBe(false);
  });
});

describe("devInternalRoleFromEnv — impossible in production", () => {
  it("returns null in production even when a dev role is set", () => {
    expect(
      devInternalRoleFromEnv({
        nodeEnv: "production",
        hlBosEnv: undefined,
        devRole: "hld_admin",
      }),
    ).toBeNull();
    expect(
      devInternalRoleFromEnv({
        nodeEnv: undefined,
        hlBosEnv: "production",
        devRole: "hld_admin",
      }),
    ).toBeNull();
  });
  it("returns the role in development when explicitly set and valid", () => {
    expect(
      devInternalRoleFromEnv({
        nodeEnv: "development",
        hlBosEnv: undefined,
        devRole: "platform_owner",
      }),
    ).toBe("platform_owner");
  });
  it("returns null for an invalid or absent dev role", () => {
    expect(
      devInternalRoleFromEnv({
        nodeEnv: "development",
        hlBosEnv: undefined,
        devRole: "client",
      }),
    ).toBeNull();
    expect(
      devInternalRoleFromEnv({
        nodeEnv: "development",
        hlBosEnv: undefined,
        devRole: undefined,
      }),
    ).toBeNull();
  });
});

describe("destinationFor — role-aware, open-redirect safe, no cross-audience leak", () => {
  it("internal user -> /intelligence (or a safe next)", () => {
    expect(destinationFor("hld_admin")).toBe("/intelligence");
    expect(destinationFor("platform_owner", { next: "/intelligence/venuewise" })).toBe(
      "/intelligence/venuewise",
    );
  });
  it("client -> /portal, and NEVER into /intelligence via next", () => {
    expect(destinationFor("client")).toBe("/portal");
    expect(destinationFor("client", { next: "/intelligence" })).toBe("/portal");
    expect(destinationFor("client", { next: "/portal/billing" })).toBe(
      "/portal/billing",
    );
  });

  // Post-sign-in return into Venture Studio. An internal user who signed in
  // from /HLVS must land back on /HLVS, not at the BTIC default.
  it("internal user returns to /HLVS and nested HLVS routes via next", () => {
    expect(destinationFor("hld_admin", { next: "/HLVS" })).toBe("/HLVS");
    expect(destinationFor("platform_owner", { next: "/HLVS/opportunities" })).toBe(
      "/HLVS/opportunities",
    );
    expect(
      destinationFor("hld_admin", { next: "/HLVS/opportunities/abc/evaluation" }),
    ).toBe("/HLVS/opportunities/abc/evaluation");
  });

  it("client is NEVER routed into /HLVS via next", () => {
    expect(destinationFor("client", { next: "/HLVS" })).toBe("/portal");
    expect(destinationFor("client", { next: "/HLVS/opportunities" })).toBe("/portal");
  });

  // Acceptance case 5: a direct visit to the login page, with no `next`,
  // keeps the pre-existing BTIC destination.
  it("no next -> existing BTIC default is unchanged", () => {
    expect(destinationFor("hld_admin")).toBe("/intelligence");
    expect(destinationFor("platform_owner")).toBe("/intelligence");
    expect(destinationFor("hld_admin", { next: null })).toBe("/intelligence");
  });

  it("rejects open-redirect targets", () => {
    expect(destinationFor("hld_admin", { next: "//evil.example" })).toBe(
      "/intelligence",
    );
    expect(destinationFor("hld_admin", { next: "https://evil.example" })).toBe(
      "/intelligence",
    );
    expect(destinationFor("client", { next: "//evil.example" })).toBe("/portal");
  });
  it("anonymous -> /login", () => {
    expect(destinationFor(null)).toBe("/login");
  });
});
