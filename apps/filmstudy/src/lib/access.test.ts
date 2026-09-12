import { describe, expect, it } from "vitest";
import {
  NAV,
  STAFF_ROLES,
  activeKey,
  can,
  canSee,
  isStaffRole,
  navFor,
  type FootballRole,
} from "./access";

const ALL_ROLES: FootballRole[] = [
  "org_admin",
  "head_coach",
  "coordinator",
  "position_coach",
  "analyst",
  "athlete",
  "parent",
];

describe("staff", () => {
  it("does not include athletes or guardians", () => {
    expect(isStaffRole("head_coach")).toBe(true);
    expect(isStaffRole("analyst")).toBe(true);
    expect(isStaffRole("athlete")).toBe(false);
    expect(isStaffRole("parent")).toBe(false);
    expect(isStaffRole(null)).toBe(false);
  });
});

describe("navigation", () => {
  it("shows nothing at all to a user with no role", () => {
    expect(navFor(null)).toEqual([]);
    for (const item of NAV) {
      expect(canSee(null, item.key)).toBe(false);
    }
  });

  // The two that matter. Opponent scouting is coach-only in the database; the
  // menu must not advertise it either.
  it("never offers opponent scouting or the roster to an athlete or guardian", () => {
    for (const role of ["athlete", "parent"] as const) {
      expect(canSee(role, "opponents")).toBe(false);
      expect(canSee(role, "players")).toBe(false);
      expect(canSee(role, "reports")).toBe(false);
      expect(canSee(role, "search")).toBe(false);
    }
  });

  it("gives every staff role the film room", () => {
    for (const role of STAFF_ROLES) {
      expect(canSee(role, "film")).toBe(true);
      expect(canSee(role, "dashboard")).toBe(true);
    }
  });

  it("gives athletes their own film and assignments", () => {
    expect(canSee("athlete", "film")).toBe(true);
    expect(canSee("athlete", "assignments")).toBe(true);
    expect(canSee("athlete", "dashboard")).toBe(true);
  });

  it("marks the current page by longest path, so /film/abc is Film and not Dashboard", () => {
    expect(activeKey("/")).toBe("dashboard");
    expect(activeKey("/film")).toBe("film");
    expect(activeKey("/film/abc-123")).toBe("film");
    expect(activeKey("/players/p1")).toBe("players");
    expect(activeKey("/nowhere")).toBeNull();
  });

  it("labels every unbuilt capability with the phase it lands in", () => {
    const unbuilt = NAV.filter((item) => item.phase > 1).map((item) => item.key);
    expect(unbuilt).toEqual(["opponents", "reports", "ai_coach"]);
  });
});

describe("capabilities", () => {
  it("lets no athlete or guardian grade, tag, upload or assign", () => {
    for (const role of ["athlete", "parent"] as const) {
      expect(can(role, "grade_players")).toBe(false);
      expect(can(role, "read_grades")).toBe(false);
      expect(can(role, "tag_plays")).toBe(false);
      expect(can(role, "upload_film")).toBe(false);
      expect(can(role, "assign_film")).toBe(false);
      expect(can(role, "manage_roster")).toBe(false);
      expect(can(role, "scout_opponents")).toBe(false);
    }
  });

  // An analyst charts film; they do not evaluate people. That split exists in
  // the database too (the `staff` platform role holds play.update but not
  // grade.create) and is asserted in both places on purpose.
  it("lets an analyst tag film but not grade a player", () => {
    expect(can("analyst", "tag_plays")).toBe(true);
    expect(can("analyst", "make_clips")).toBe(true);
    expect(can("analyst", "grade_players")).toBe(false);
    expect(can("analyst", "read_grades")).toBe(false);
  });

  it("reserves roster and program changes for the head coach and org admin", () => {
    expect(can("coordinator", "manage_roster")).toBe(false);
    expect(can("position_coach", "manage_program")).toBe(false);
    expect(can("head_coach", "manage_roster")).toBe(true);
    expect(can("org_admin", "manage_program")).toBe(true);
  });

  it("grants nothing to a user with no role", () => {
    expect(can(null, "upload_film")).toBe(false);
    expect(can(null, "grade_players")).toBe(false);
  });

  it("covers every role without throwing", () => {
    for (const role of ALL_ROLES) {
      expect(typeof can(role, "tag_plays")).toBe("boolean");
    }
  });
});
