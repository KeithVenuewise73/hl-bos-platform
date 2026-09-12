import "server-only";
import { cookies } from "next/headers";
import { readClient, supabaseConfigured } from "./supabase";
import { SELECTED_COLUMNS } from "./columns";
import type { FootballRole } from "./access";
import type { TeamRow, Viewer } from "./types";

const TEAM_COOKIE = "fs_team";

const UNAUTHENTICATED: Viewer = {
  authenticated: false,
  userId: null,
  email: null,
  team: null,
  teams: [],
  role: null,
  playerIds: [],
};

// Derived, not retyped: lib/schema.test.ts checks this list against the
// migration on every commit.
const TEAM_COLUMNS = SELECTED_COLUMNS["teams"].join(", ");

/**
 * Resolve the current viewer, server-side, fail-closed.
 *
 * Note what is NOT here: no role is read from a JWT claim, and none is passed
 * in from the client. The football role comes from filmstudy.team_members,
 * read through RLS as the user themselves — so the answer to "what am I on
 * this team?" is the database's, and a forged cookie changes which team is in
 * context but never what the user may do there.
 */
export async function getViewer(): Promise<Viewer> {
  if (!supabaseConfigured()) return UNAUTHENTICATED;

  const supabase = await readClient();
  if (supabase === null) return UNAUTHENTICATED;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return UNAUTHENTICATED;

  const { data: teamRows } = await supabase
    .schema("filmstudy")
    .from("teams")
    .select(TEAM_COLUMNS)
    .order("name");
  // The generated client types the row union loosely; the columns are asserted
  // against the migration by lib/schema.test.ts instead.
  const teams = (teamRows ?? []) as unknown as TeamRow[];

  const store = await cookies();
  const requested = store.get(TEAM_COOKIE)?.value;
  // A cookie naming a team the user cannot see selects nothing; it does not
  // grant anything. Falling back to their first real team keeps the app usable
  // after a team is removed.
  const team = teams.find((t) => t.id === requested) ?? teams[0] ?? null;

  if (team === null) {
    return {
      authenticated: true,
      userId: user.id,
      email: user.email ?? null,
      team: null,
      teams,
      role: null,
      playerIds: [],
    };
  }

  const { data: membership } = await supabase
    .schema("filmstudy")
    .from("team_members")
    .select("football_role")
    .eq("team_id", team.id)
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: links } = await supabase
    .schema("filmstudy")
    .from("player_links")
    .select("player_id")
    .eq("team_id", team.id)
    .eq("user_id", user.id);

  return {
    authenticated: true,
    userId: user.id,
    email: user.email ?? null,
    team,
    teams,
    role: (membership?.["football_role"] as FootballRole | undefined) ?? null,
    playerIds: (links ?? []).map((l) => l["player_id"] as string),
  };
}

/**
 * Options for the team-context cookie.
 *
 * Defined here rather than in the Server Action so the env-access exemption
 * covers this file and not actions.ts as well. The cookie only selects which
 * team is in view; it grants nothing, and the role is always re-read from the
 * database.
 */
export const TEAM_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env["NODE_ENV"] === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
} as const;

export { TEAM_COOKIE };
