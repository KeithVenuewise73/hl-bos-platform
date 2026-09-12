"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { classifySituation, type ExplosiveLevel } from "@hl-bos/football";
import { writeClient } from "@/lib/supabase";
import { TEAM_COOKIE, TEAM_COOKIE_OPTIONS } from "@/lib/session";

/**
 * Every write in the product.
 *
 * Each one calls a SECURITY DEFINER function in the `filmstudy` schema, and
 * each of those checks BOTH layers of authority before touching a row. So the
 * checks in this file are for the message the user sees, not for the security:
 * removing all of them would change the wording of a failure, not who can do
 * what. That is deliberate — an authorization rule that lives only in a
 * Server Action is one deployment mistake from not existing.
 */

export interface ActionResult {
  ok: boolean;
  /** Plain English, always safe to show. */
  message: string;
  /** Set when the action produced something to navigate to. */
  href?: string;
  /** Set when the action created a row the caller needs the id of. */
  id?: string;
}

function ok(message: string, extra: { href?: string; id?: string } = {}): ActionResult {
  // exactOptionalPropertyTypes: an explicit `undefined` is not the same as
  // absent, so spread these in only when they exist.
  return {
    ok: true,
    message,
    ...(extra.href ? { href: extra.href } : {}),
    ...(extra.id ? { id: extra.id } : {}),
  };
}

/**
 * Turn a Postgres error into something a coach can act on.
 *
 * The privilege case matters most: the database refuses with
 * `insufficient_privilege` whether or not the row exists, so this wording must
 * not imply the row does exist. Saying "you do not have access to do that on
 * this team" leaks nothing either way.
 */
function fail(error: { message?: string; code?: string } | null): ActionResult {
  const code = error?.code ?? "";
  const raw = error?.message ?? "Something went wrong.";

  if (
    code === "42501" ||
    raw.includes("insufficient privilege") ||
    raw.includes("no coaching access")
  ) {
    return { ok: false, message: "You do not have access to do that on this team." };
  }
  if (code === "23505") {
    return { ok: false, message: "That already exists." };
  }
  if (code === "23503") {
    return { ok: false, message: raw };
  }
  if (code === "23514" || code === "P0001") {
    // A CHECK or an explicit RAISE. These carry deliberately written wording
    // from the migration — "grade a player only on a play they are recorded as
    // playing" — so pass it through rather than replacing it with something
    // vaguer.
    return { ok: false, message: raw };
  }
  return { ok: false, message: raw };
}

async function rpc(
  name: string,
  args: Record<string, unknown>,
): Promise<{ data: unknown; error: { message?: string; code?: string } | null }> {
  const client = await writeClient();
  if (client === null) {
    return {
      data: null,
      error: { message: "This app is not connected to a Supabase project yet." },
    };
  }
  const response = (await client.schema("filmstudy").rpc(name, args)) as {
    data: unknown;
    error: { message?: string; code?: string } | null;
  };
  return { data: response.data, error: response.error };
}

function text(form: FormData, field: string): string | null {
  const value = form.get(field);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function num(form: FormData, field: string): number | null {
  const value = text(form, field);
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function bool(form: FormData, field: string): boolean {
  return form.get(field) === "on" || form.get(field) === "true";
}

// --- Team context -----------------------------------------------------------

/** Switch which team is in context. Grants nothing: see lib/session.ts. */
export async function selectTeam(teamId: string): Promise<void> {
  const store = await cookies();
  store.set(TEAM_COOKIE, teamId, TEAM_COOKIE_OPTIONS);
  revalidatePath("/", "layout");
}

export async function createTeam(form: FormData): Promise<ActionResult> {
  const tenant = text(form, "tenant_id");
  const name = text(form, "name");
  if (tenant === null || name === null) {
    return { ok: false, message: "A team needs an organization and a name." };
  }
  const { data, error } = await rpc("create_team", {
    p_tenant: tenant,
    p_name: name,
    p_level: text(form, "level") ?? "high_school",
    p_mascot: text(form, "mascot"),
  });
  if (error) return fail(error);
  if (typeof data === "string") await selectTeam(data);
  revalidatePath("/", "layout");
  return ok(`${name} is set up. You are its organization admin.`);
}

export async function seedDemoProgram(tenantId: string): Promise<ActionResult> {
  const { data, error } = await rpc("seed_demo_program", { p_tenant: tenantId });
  if (error) return fail(error);
  if (typeof data === "string") await selectTeam(data);
  revalidatePath("/", "layout");
  return ok(
    "Demo program added: West Seneca Wolves, 25 tagged plays. It is marked DEMO " +
      "everywhere and its film has no video behind it.",
  );
}

export async function removeDemoProgram(tenantId: string): Promise<ActionResult> {
  const { error } = await rpc("remove_demo_program", { p_tenant: tenantId });
  if (error) return fail(error);
  revalidatePath("/", "layout");
  return ok("Demo program removed.");
}

export async function updateTeamSettings(form: FormData): Promise<ActionResult> {
  const team = text(form, "team_id");
  if (team === null) return { ok: false, message: "No team selected." };
  const { error } = await rpc("update_team_settings", {
    p_team: team,
    p_grade_scale: text(form, "grade_scale"),
    p_athletes_see_grades: bool(form, "athletes_see_grades"),
    p_guardian_access: bool(form, "guardian_access"),
    p_guardians_see_grades: bool(form, "guardians_see_grades"),
  });
  if (error) return fail(error);
  revalidatePath("/settings");
  return ok("Program settings saved.");
}

// --- Roster, opponents, games ----------------------------------------------

export async function upsertPlayer(form: FormData): Promise<ActionResult> {
  const team = text(form, "team_id");
  const first = text(form, "first_name");
  const last = text(form, "last_name");
  if (team === null || first === null || last === null) {
    return { ok: false, message: "A player needs a first and last name." };
  }
  const { error } = await rpc("upsert_player", {
    p_team: team,
    p_first_name: first,
    p_last_name: last,
    p_jersey_number: num(form, "jersey_number"),
    p_position: text(form, "position"),
    p_unit: text(form, "unit"),
    p_class_year: text(form, "class_year"),
    p_height_inches: num(form, "height_inches"),
    p_weight_pounds: num(form, "weight_pounds"),
    p_player: text(form, "player_id"),
  });
  if (error) return fail(error);
  revalidatePath("/players");
  return ok(`${first} ${last} saved.`);
}

export async function upsertOpponent(form: FormData): Promise<ActionResult> {
  const team = text(form, "team_id");
  const name = text(form, "name");
  if (team === null || name === null)
    return { ok: false, message: "An opponent needs a name." };
  const { error } = await rpc("upsert_opponent", {
    p_team: team,
    p_name: name,
    p_mascot: text(form, "mascot"),
  });
  if (error) return fail(error);
  revalidatePath("/games");
  return ok(`${name} saved.`);
}

export async function upsertGame(form: FormData): Promise<ActionResult> {
  const team = text(form, "team_id");
  if (team === null) return { ok: false, message: "No team selected." };
  const kickoff = text(form, "kickoff_at");
  const { error } = await rpc("upsert_game", {
    p_team: team,
    p_opponent: text(form, "opponent_id"),
    p_season: text(form, "season_id"),
    p_kickoff_at: kickoff === null ? null : new Date(kickoff).toISOString(),
    p_venue: text(form, "venue") ?? "home",
    p_location: text(form, "location"),
    p_week: num(form, "week"),
    p_team_score: num(form, "team_score"),
    p_opponent_score: num(form, "opponent_score"),
    p_notes: text(form, "notes"),
    p_game: text(form, "game_id"),
  });
  if (error) return fail(error);
  revalidatePath("/games");
  return ok("Game saved.");
}

export async function upsertSeason(form: FormData): Promise<ActionResult> {
  const team = text(form, "team_id");
  const year = num(form, "year");
  if (team === null || year === null)
    return { ok: false, message: "A season needs a year." };
  const { error } = await rpc("upsert_season", {
    p_team: team,
    p_year: year,
    p_label: text(form, "label") ?? `${year} Season`,
    p_is_current: bool(form, "is_current"),
  });
  if (error) return fail(error);
  revalidatePath("/settings");
  return ok("Season saved.");
}

// --- Film -------------------------------------------------------------------

/**
 * Step one of an upload: register the film and get back the object path the
 * browser should upload to.
 *
 * The path is computed by the database, never sent by the client, so a browser
 * cannot aim an upload at another tenant's prefix even if it tries.
 */
export interface RegisteredFilm {
  ok: boolean;
  message: string;
  filmId?: string;
  bucket?: string;
  objectPath?: string;
}

export async function registerFilm(form: FormData): Promise<RegisteredFilm> {
  const team = text(form, "team_id");
  const title = text(form, "title");
  const filename = text(form, "filename");
  const mime = text(form, "mime");
  const size = num(form, "size_bytes");
  if (
    team === null ||
    title === null ||
    filename === null ||
    mime === null ||
    size === null
  ) {
    return { ok: false, message: "Choose a video file and give the film a title." };
  }

  const { data, error } = await rpc("register_film", {
    p_team: team,
    p_title: title,
    p_kind: text(form, "film_kind") ?? "game",
    p_original_filename: filename,
    p_mime: mime,
    p_size_bytes: size,
    p_game: text(form, "game_id"),
    p_season: text(form, "season_id"),
    p_unit: text(form, "unit"),
    p_recorded_on: text(form, "recorded_on"),
    p_notes: text(form, "notes"),
    p_athlete_visible: bool(form, "athlete_visible"),
  });
  if (error) {
    const f = fail(error);
    return { ok: false, message: f.message };
  }
  const row = data as { id?: string; bucket?: string; object_path?: string } | null;
  if (!row?.id || !row.bucket || !row.object_path) {
    return {
      ok: false,
      message: "The film record came back incomplete. Nothing was uploaded.",
    };
  }
  revalidatePath("/film");
  return {
    ok: true,
    message: "Film registered. Uploading the video now.",
    filmId: row.id,
    bucket: row.bucket,
    objectPath: row.object_path,
  };
}

/** Step two: the bytes arrived. Only now is the film playable. */
export async function confirmFilmUpload(
  filmId: string,
  sizeBytes: number,
  durationSeconds: number | null,
): Promise<ActionResult> {
  const { error } = await rpc("confirm_film_upload", {
    p_film: filmId,
    p_size_bytes: sizeBytes,
    p_duration_seconds: durationSeconds,
  });
  if (error) return fail(error);
  revalidatePath("/film");
  return ok("Film is ready to tag.", { href: `/film/${filmId}` });
}

export async function setFilmVisibility(
  filmId: string,
  athleteVisible: boolean,
): Promise<ActionResult> {
  const { error } = await rpc("set_film_visibility", {
    p_film: filmId,
    p_athlete_visible: athleteVisible,
  });
  if (error) return fail(error);
  revalidatePath(`/film/${filmId}`);
  return ok(
    athleteVisible
      ? "This film is now open to the squad."
      : "This film is coaches-only again.",
  );
}

// --- Plays ------------------------------------------------------------------

export async function createPlay(
  filmId: string,
  startSeconds: number,
  endSeconds: number,
  snapSeconds: number | null,
): Promise<ActionResult> {
  const { data, error } = await rpc("create_play", {
    p_film: filmId,
    p_start_seconds: startSeconds,
    p_end_seconds: endSeconds,
    p_snap_seconds: snapSeconds,
  });
  if (error) return fail(error);
  revalidatePath(`/film/${filmId}`);
  return ok("Play created.", typeof data === "string" ? { id: data } : {});
}

export async function deletePlay(
  playId: string,
  filmId: string,
): Promise<ActionResult> {
  const { error } = await rpc("delete_play", { p_play: playId });
  if (error) return fail(error);
  revalidatePath(`/film/${filmId}`);
  return ok("Play removed.");
}

export async function setPlayWindow(
  playId: string,
  filmId: string,
  window: { start?: number; end?: number; snap?: number },
): Promise<ActionResult> {
  const { error } = await rpc("set_play_window", {
    p_play: playId,
    p_start_seconds: window.start ?? null,
    p_end_seconds: window.end ?? null,
    p_snap_seconds: window.snap ?? null,
  });
  if (error) return fail(error);
  revalidatePath(`/film/${filmId}`);
  return ok("Play window updated.");
}

/**
 * Tag a play.
 *
 * The four situational flags are computed here by @hl-bos/football and sent
 * with the tags, rather than being derived separately in SQL or in a report.
 * One definition of "explosive", in one place, shared by every product that
 * depends on the package.
 */
export async function tagPlay(form: FormData): Promise<ActionResult> {
  const playId = text(form, "play_id");
  const filmId = text(form, "film_id");
  if (playId === null || filmId === null)
    return { ok: false, message: "No play selected." };

  const down = num(form, "down");
  const distance = num(form, "distance");
  const yardLine = num(form, "yard_line");
  const possession = text(form, "possession");
  const family = text(form, "family");
  const yards = num(form, "yards");
  const level = (text(form, "level") ?? "high_school") as ExplosiveLevel;

  const flags = classifySituation(
    {
      ...(down !== null ? { down } : {}),
      ...(distance !== null ? { distance } : {}),
      ...(yardLine !== null ? { yardLine } : {}),
      ...(possession === "offense" ||
      possession === "defense" ||
      possession === "special_teams"
        ? { possession }
        : {}),
    },
    {
      ...(family === "run" ||
      family === "pass" ||
      family === "special_teams" ||
      family === "penalty_only"
        ? { family }
        : {}),
      ...(yards !== null ? { yards } : {}),
    },
    level,
  );

  const { error } = await rpc("tag_play", {
    p_play: playId,
    p_quarter: num(form, "quarter"),
    p_clock: text(form, "clock"),
    p_down: down,
    p_distance: distance,
    p_yard_line: yardLine,
    p_hash: text(form, "hash"),
    p_possession: possession,
    p_personnel: text(form, "personnel"),
    p_formation: text(form, "formation"),
    p_strength: text(form, "strength"),
    p_motion: text(form, "motion"),
    p_play_call: text(form, "play_call"),
    p_family: family,
    p_concept: text(form, "concept"),
    p_direction: text(form, "direction"),
    p_defensive_front: text(form, "defensive_front"),
    p_box_count: num(form, "box_count"),
    p_coverage: text(form, "coverage"),
    p_pressure: text(form, "pressure"),
    p_result: text(form, "result"),
    p_yards: yards,
    p_touchdown: bool(form, "touchdown"),
    p_first_down: bool(form, "first_down"),
    p_turnover: bool(form, "turnover"),
    p_penalty: bool(form, "penalty"),
    p_explosive: flags.explosive,
    p_red_zone: flags.redZone,
    p_third_down: flags.thirdDown,
    p_goal_line: flags.goalLine,
    p_confirmation_kind: "manual",
  });
  if (error) return fail(error);
  revalidatePath(`/film/${filmId}`);
  return ok("Play tagged.");
}

/** Accept, correct or reject an AI suggestion. Never automatic. */
export async function resolvePrediction(
  predictionId: string,
  filmId: string,
  state: "coach_confirmed" | "coach_corrected" | "rejected",
  correctedValue?: string,
): Promise<ActionResult> {
  const { error } = await rpc("resolve_prediction", {
    p_prediction: predictionId,
    p_state: state,
    p_corrected_value: correctedValue ?? null,
  });
  if (error) return fail(error);
  revalidatePath(`/film/${filmId}`);
  return ok(
    state === "rejected"
      ? "Suggestion rejected. Nothing was written to the play."
      : "Confirmed. It is team data now.",
  );
}

// --- Participation, grades, notes -------------------------------------------

export async function setParticipation(form: FormData): Promise<ActionResult> {
  const playId = text(form, "play_id");
  const playerId = text(form, "player_id");
  const filmId = text(form, "film_id");
  const unit = text(form, "unit");
  if (playId === null || playerId === null || unit === null) {
    return { ok: false, message: "Pick a player and which unit they were on." };
  }
  const { error } = await rpc("set_participation", {
    p_play: playId,
    p_player: playerId,
    p_unit: unit,
    p_position: text(form, "position"),
    p_assignment: text(form, "assignment"),
  });
  if (error) return fail(error);
  if (filmId !== null) revalidatePath(`/film/${filmId}`);
  return ok("Player added to this play.");
}

export async function removeParticipation(
  playId: string,
  playerId: string,
  filmId: string,
): Promise<ActionResult> {
  const { error } = await rpc("remove_participation", {
    p_play: playId,
    p_player: playerId,
  });
  if (error) return fail(error);
  revalidatePath(`/film/${filmId}`);
  return ok("Player removed from this play.");
}

export async function setGrade(
  playId: string,
  playerId: string,
  categoryKey: string,
  filmId: string,
  grade: { symbol?: string; numeric?: number },
): Promise<ActionResult> {
  const { error } = await rpc("set_grade", {
    p_play: playId,
    p_player: playerId,
    p_category: categoryKey,
    p_symbol: grade.symbol ?? null,
    p_numeric: grade.numeric ?? null,
  });
  if (error) return fail(error);
  revalidatePath(`/film/${filmId}`);
  return ok("Grade saved.");
}

export async function addNote(form: FormData): Promise<ActionResult> {
  const playerId = text(form, "player_id");
  const body = text(form, "body");
  if (playerId === null || body === null) {
    return { ok: false, message: "A note needs a player and something to say." };
  }
  const { error } = await rpc("add_note", {
    p_player: playerId,
    p_body: body,
    p_play: text(form, "play_id"),
    p_timestamp_seconds: num(form, "timestamp_seconds"),
    p_visible_to_athlete: bool(form, "visible_to_athlete"),
    p_source: text(form, "source") ?? "typed",
  });
  if (error) return fail(error);
  const filmId = text(form, "film_id");
  if (filmId !== null) revalidatePath(`/film/${filmId}`);
  revalidatePath(`/players/${playerId}`);
  return ok("Note saved.");
}

// --- Clips, playlists, assignments ------------------------------------------

export async function createClip(form: FormData): Promise<ActionResult> {
  const filmId = text(form, "film_id");
  const title = text(form, "title");
  const start = num(form, "start_seconds");
  const end = num(form, "end_seconds");
  if (filmId === null || title === null || start === null || end === null) {
    return { ok: false, message: "A clip needs a title and a start and end." };
  }
  const { data, error } = await rpc("create_clip", {
    p_film: filmId,
    p_title: title,
    p_start_seconds: start,
    p_end_seconds: end,
    p_play: text(form, "play_id"),
    p_caption: text(form, "caption"),
    p_playback_rate: num(form, "playback_rate") ?? 1.0,
  });
  if (error) return fail(error);
  revalidatePath(`/film/${filmId}`);
  revalidatePath("/playlists");
  return ok(`Clip "${title}" saved.`, typeof data === "string" ? { id: data } : {});
}

export async function createPlaylist(form: FormData): Promise<ActionResult> {
  const team = text(form, "team_id");
  const name = text(form, "name");
  if (team === null || name === null)
    return { ok: false, message: "A cutup needs a name." };
  const { data, error } = await rpc("create_playlist", {
    p_team: team,
    p_name: name,
    p_description: text(form, "description"),
    p_shared_with_athletes: bool(form, "shared_with_athletes"),
  });
  if (error) return fail(error);
  revalidatePath("/playlists");
  return ok(`"${name}" created.`, typeof data === "string" ? { id: data } : {});
}

export async function addPlaylistItem(
  playlistId: string,
  target: { playId?: string; clipId?: string },
  note?: string,
): Promise<ActionResult> {
  const { error } = await rpc("add_playlist_item", {
    p_playlist: playlistId,
    p_play: target.playId ?? null,
    p_clip: target.clipId ?? null,
    p_note: note ?? null,
  });
  if (error) return fail(error);
  revalidatePath("/playlists");
  return ok("Added to the cutup.");
}

export async function removePlaylistItem(itemId: string): Promise<ActionResult> {
  const { error } = await rpc("remove_playlist_item", { p_item: itemId });
  if (error) return fail(error);
  revalidatePath("/playlists");
  return ok("Removed from the cutup.");
}

export async function createAssignment(form: FormData): Promise<ActionResult> {
  const playerId = text(form, "player_id");
  const kind = text(form, "assignment_kind");
  if (playerId === null || kind === null) {
    return { ok: false, message: "Pick a player and what kind of assignment this is." };
  }
  const { data, error } = await rpc("create_assignment", {
    p_player: playerId,
    p_kind: kind,
    p_message: text(form, "message"),
    p_due_on: text(form, "due_on"),
  });
  if (error) return fail(error);

  // A clip or play chosen alongside the assignment is attached immediately, so
  // an assignment with nothing in it is not the normal outcome of this form.
  const playId = text(form, "play_id");
  const clipId = text(form, "clip_id");
  if (typeof data === "string" && (playId !== null || clipId !== null)) {
    const item = await rpc("add_assignment_item", {
      p_assignment: data,
      p_play: playId,
      p_clip: clipId,
    });
    if (item.error) return fail(item.error);
  }
  revalidatePath("/assignments");
  const filmId = text(form, "film_id");
  if (filmId !== null) revalidatePath(`/film/${filmId}`);
  return ok("Film assigned.", typeof data === "string" ? { id: data } : {});
}

export async function addAssignmentItem(
  assignmentId: string,
  target: { playId?: string; clipId?: string },
): Promise<ActionResult> {
  const { error } = await rpc("add_assignment_item", {
    p_assignment: assignmentId,
    p_play: target.playId ?? null,
    p_clip: target.clipId ?? null,
  });
  if (error) return fail(error);
  revalidatePath("/assignments");
  return ok("Added to the assignment.");
}

/**
 * The athlete marking their own film reviewed.
 *
 * The database refuses this call from anyone not linked to the player, so the
 * "Players reviewed" figure on the dashboard is evidence rather than a
 * self-report by a coach.
 */
export async function recordAssignmentProgress(
  assignmentId: string,
  status: "viewed" | "acknowledged" | "completed",
  comment?: string,
): Promise<ActionResult> {
  const { error } = await rpc("record_assignment_progress", {
    p_assignment: assignmentId,
    p_status: status,
    p_comment: comment ?? null,
  });
  if (error) return fail(error);
  revalidatePath("/assignments");
  revalidatePath("/");
  return ok(status === "completed" ? "Marked reviewed." : "Progress saved.");
}
