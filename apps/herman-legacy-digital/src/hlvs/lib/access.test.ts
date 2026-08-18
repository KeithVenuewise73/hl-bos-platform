import { describe, it, expect } from "vitest";
import { roleFromClaims as studioRoleFromClaims, devRoleFromEnv } from "./access";
import { roleFromClaims as hldRoleFromClaims, isInternal } from "../../lib/authz";

/**
 * The /HLVS sign-in loop.
 *
 * /HLVS is admitted by HLD's middleware on HLD's internal role, then re-checked
 * by StudioShell on the Studio role. When those two disagree the viewer is
 * admitted, rendered, rejected and sent back to /admin-login — signing in again
 * repeats it forever.
 *
 * These are the claims a real HLD platform owner carries: an `hld_role`, and
 * NOTHING else. No `vstudio_role`, no `platform_permissions`. Every account
 * provisioned for HLD looks like this, so the loop was not specific to one user.
 */
const HLD_PLATFORM_OWNER = { hld_role: "platform_owner" };

describe("HLVS access — the Studio role must agree with the HLD gate", () => {
  it("HLD admits a platform owner into /HLVS", () => {
    const role = hldRoleFromClaims(HLD_PLATFORM_OWNER, { authenticated: true });
    expect(role).toBe("platform_owner");
    expect(isInternal(role)).toBe(true);
  });

  it("and the Studio grants that same viewer a role, so the page renders", () => {
    expect(studioRoleFromClaims(HLD_PLATFORM_OWNER)).toBe("platform_owner");
  });

  it("maps each internal HLD role to its Studio equivalent, least privilege", () => {
    expect(studioRoleFromClaims({ hld_role: "platform_owner" })).toBe("platform_owner");
    expect(studioRoleFromClaims({ hld_role: "hld_admin" })).toBe("platform_admin");
    expect(studioRoleFromClaims({ hld_role: "hld_team_member" })).toBe("viewer");
    expect(studioRoleFromClaims({ portal_role: "hld_admin" })).toBe("platform_admin");
  });

  it("an explicit vstudio_role still wins over the HLD claim", () => {
    expect(
      studioRoleFromClaims({ hld_role: "platform_owner", vstudio_role: "viewer" }),
    ).toBe("viewer");
  });

  it("platform_permissions still resolve, and outrank the HLD claim", () => {
    expect(
      studioRoleFromClaims({
        hld_role: "hld_team_member",
        platform_permissions: ["platform.console.admin"],
      }),
    ).toBe("platform_admin");
  });

  it("grants NOTHING to a client or an unrecognized claim — fail closed", () => {
    expect(studioRoleFromClaims({ hld_role: "client" })).toBeNull();
    expect(studioRoleFromClaims({ hld_role: "not_a_role" })).toBeNull();
    expect(studioRoleFromClaims({})).toBeNull();
    expect(studioRoleFromClaims(null)).toBeNull();
    expect(studioRoleFromClaims("platform_owner")).toBeNull();
  });

  it("keeps the dev bypass impossible in production", () => {
    expect(
      devRoleFromEnv({
        nodeEnv: "production",
        hlBosEnv: undefined,
        devRole: "platform_owner",
      }),
    ).toBeNull();
    expect(
      devRoleFromEnv({
        nodeEnv: undefined,
        hlBosEnv: "production",
        devRole: "platform_owner",
      }),
    ).toBeNull();
    expect(
      devRoleFromEnv({
        nodeEnv: "development",
        hlBosEnv: undefined,
        devRole: "platform_owner",
      }),
    ).toBe("platform_owner");
  });
});
