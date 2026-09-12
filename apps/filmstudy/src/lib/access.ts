/**
 * Navigation and capability rules for Football FilmStudy AI.
 *
 * PURE and deterministic: no I/O, no session, no environment. This is what the
 * unit tests assert, and it is the app-side half of the two-layer model the
 * database enforces.
 *
 * It is deliberately NOT the security boundary. Every one of these rules is
 * enforced again in PostgreSQL — by RLS on reads and by a permission check
 * inside each SECURITY DEFINER function on writes. If this file were wrong,
 * an athlete would see a menu item they cannot use; they would not see another
 * athlete's grades. That is the property worth having.
 */

/** Football authority on one team. Mirrors filmstudy.football_role. */
export type FootballRole =
  | "org_admin"
  | "head_coach"
  | "coordinator"
  | "position_coach"
  | "analyst"
  | "athlete"
  | "parent";

export const ROLE_LABEL: Record<FootballRole, string> = {
  org_admin: "Organization Admin",
  head_coach: "Head Coach",
  coordinator: "Coordinator",
  position_coach: "Position Coach",
  analyst: "Analyst",
  athlete: "Athlete",
  parent: "Parent / Guardian",
};

export const STAFF_ROLES: readonly FootballRole[] = [
  "org_admin",
  "head_coach",
  "coordinator",
  "position_coach",
  "analyst",
];

export function isStaffRole(role: FootballRole | null): boolean {
  return role !== null && STAFF_ROLES.includes(role);
}

export type NavKey =
  | "dashboard"
  | "film"
  | "games"
  | "players"
  | "search"
  | "playlists"
  | "assignments"
  | "opponents"
  | "reports"
  | "ai_coach"
  | "settings";

export type NavGroup = "film_room" | "program" | "intelligence" | "system";

export interface NavItem {
  readonly key: NavKey;
  readonly path: string;
  readonly label: string;
  /** Short label for the mobile bottom bar. */
  readonly short: string;
  readonly glyph: string;
  readonly group: NavGroup;
  /** Who may see it at all. */
  readonly roles: readonly FootballRole[];
  /**
   * The phase this capability actually lands in. Anything above 1 renders a
   * "Coming in Phase N" page — never a mock of the finished thing.
   */
  readonly phase: 1 | 2 | 3 | 4 | 5;
}

const STAFF = STAFF_ROLES;
const EVERYONE: readonly FootballRole[] = [...STAFF_ROLES, "athlete", "parent"];

export const NAV: readonly NavItem[] = [
  {
    key: "dashboard",
    path: "/",
    label: "Dashboard",
    short: "Home",
    glyph: "■",
    group: "film_room",
    roles: EVERYONE,
    phase: 1,
  },
  {
    key: "film",
    path: "/film",
    label: "Film",
    short: "Film",
    glyph: "▶",
    group: "film_room",
    roles: EVERYONE,
    phase: 1,
  },
  {
    key: "search",
    path: "/search",
    label: "Find Plays",
    short: "Find",
    glyph: "⌕",
    group: "film_room",
    roles: STAFF,
    phase: 1,
  },
  {
    key: "playlists",
    path: "/playlists",
    label: "Cutups",
    short: "Cutups",
    glyph: "≡",
    group: "film_room",
    roles: EVERYONE,
    phase: 1,
  },
  {
    key: "assignments",
    path: "/assignments",
    label: "Assignments",
    short: "Assigned",
    glyph: "✓",
    group: "film_room",
    roles: EVERYONE,
    phase: 1,
  },
  {
    key: "games",
    path: "/games",
    label: "Games",
    short: "Games",
    glyph: "●",
    group: "program",
    roles: EVERYONE,
    phase: 1,
  },
  {
    key: "players",
    path: "/players",
    label: "Players",
    short: "Players",
    glyph: "⚌",
    group: "program",
    roles: STAFF,
    phase: 1,
  },
  // Everything below is honest about not existing yet. Each renders a page
  // that says which phase it lands in and what has to be true first.
  {
    key: "opponents",
    path: "/opponents",
    label: "Opponent Scout",
    short: "Scout",
    glyph: "⚡",
    group: "intelligence",
    roles: STAFF,
    phase: 2,
  },
  {
    key: "reports",
    path: "/reports",
    label: "Reports",
    short: "Reports",
    glyph: "☰",
    group: "intelligence",
    roles: STAFF,
    phase: 2,
  },
  {
    key: "ai_coach",
    path: "/ai-coach",
    label: "AI Coach",
    short: "AI",
    glyph: "✦",
    group: "intelligence",
    roles: EVERYONE,
    phase: 2,
  },
  {
    key: "settings",
    path: "/settings",
    label: "Settings",
    short: "Settings",
    glyph: "⚙",
    group: "system",
    roles: EVERYONE,
    phase: 1,
  },
];

export const NAV_GROUPS: readonly { group: NavGroup; label: string }[] = [
  { group: "film_room", label: "Film Room" },
  { group: "program", label: "Program" },
  { group: "intelligence", label: "Intelligence" },
  { group: "system", label: "System" },
];

/** May this role see this navigation item at all? */
export function canSee(role: FootballRole | null, key: NavKey): boolean {
  if (role === null) return false;
  const item = NAV.find((n) => n.key === key);
  if (item === undefined) return false;
  return item.roles.includes(role);
}

export function navFor(role: FootballRole | null): readonly NavItem[] {
  if (role === null) return [];
  return NAV.filter((item) => item.roles.includes(role));
}

/** Which nav item a pathname belongs to, for the current-page marker. */
export function activeKey(pathname: string): NavKey | null {
  // Longest path first so "/film/abc" matches "/film" and "/" does not win.
  const matches = [...NAV]
    .sort((a, b) => b.path.length - a.path.length)
    .find((item) =>
      item.path === "/" ? pathname === "/" : pathname.startsWith(item.path),
    );
  return matches?.key ?? null;
}

/**
 * Capabilities, expressed the way the UI asks about them. Each maps onto the
 * permission the database will check anyway, named here so a screen never
 * decides for itself what a coordinator is allowed to do.
 */
export type Capability =
  | "upload_film"
  | "tag_plays"
  | "grade_players"
  | "read_grades"
  | "manage_roster"
  | "manage_program"
  | "assign_film"
  | "make_clips"
  | "scout_opponents";

const CAPABILITIES: Record<Capability, readonly FootballRole[]> = {
  upload_film: ["org_admin", "head_coach", "coordinator", "position_coach", "analyst"],
  tag_plays: ["org_admin", "head_coach", "coordinator", "position_coach", "analyst"],
  grade_players: ["org_admin", "head_coach", "coordinator", "position_coach"],
  read_grades: ["org_admin", "head_coach", "coordinator", "position_coach"],
  manage_roster: ["org_admin", "head_coach"],
  manage_program: ["org_admin", "head_coach"],
  assign_film: ["org_admin", "head_coach", "coordinator", "position_coach"],
  make_clips: ["org_admin", "head_coach", "coordinator", "position_coach", "analyst"],
  scout_opponents: [
    "org_admin",
    "head_coach",
    "coordinator",
    "position_coach",
    "analyst",
  ],
};

export function can(role: FootballRole | null, capability: Capability): boolean {
  if (role === null) return false;
  return CAPABILITIES[capability].includes(role);
}
