import "server-only";
import { readClient } from "./supabase";
import { SELECTED_COLUMNS } from "./columns";
import type {
  AssignmentItemRow,
  AssignmentRow,
  ClipRow,
  FilmRow,
  GameRow,
  GradeCategoryRow,
  GradeRow,
  NoteRow,
  OpponentRow,
  ParticipationRow,
  PlayRow,
  PlayerRow,
  PlaylistItemRow,
  PlaylistRow,
  PredictionRow,
  SeasonRow,
} from "./types";

/**
 * Every read in the product.
 *
 * These queries carry no tenant or team filter beyond what a page legitimately
 * scopes to, because the filter is not theirs to apply: RLS in migration 0048
 * already restricts each table to what this user may see. Adding a WHERE that
 * duplicates a policy invites the belief that the WHERE is the protection, and
 * the day one is forgotten it silently is not.
 *
 * Each function returns [] on error rather than throwing, and the page renders
 * an empty state that says the data could not be read. A blank panel that
 * explains itself beats a crash, and beats a green one that lies.
 */

/**
 * Select lists are built from SELECTED_COLUMNS, not written out again here.
 *
 * That is the whole point: lib/schema.test.ts asserts SELECTED_COLUMNS against
 * migration 0048 on every commit, so a column renamed in the database fails the
 * fast suite instead of failing in front of a coach. A second hand-typed copy
 * of these names in this file would drift out from under that guard.
 *
 * `team_id`, `play_id` and friends appear in SELECTED_COLUMNS because the app
 * filters on them; they are dropped from the select lists where the row type
 * does not carry them.
 */
function columns(
  table: keyof typeof SELECTED_COLUMNS,
  omit: readonly string[] = [],
): string {
  return SELECTED_COLUMNS[table].filter((c) => !omit.includes(c)).join(", ");
}

const PLAY_COLUMNS = columns("plays", ["team_id"]);
const FILM_COLUMNS = columns("film_assets", ["team_id"]);
const PLAYER_COLUMNS = columns("players", ["team_id"]);

async function fromFilmstudy(): Promise<ReturnType<typeof buildQuery> | null> {
  const client = await readClient();
  if (client === null) return null;
  return buildQuery(client);
}

function buildQuery(client: NonNullable<Awaited<ReturnType<typeof readClient>>>) {
  return client.schema("filmstudy");
}

async function rows<T>(
  run: (
    q: NonNullable<Awaited<ReturnType<typeof fromFilmstudy>>>,
  ) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const q = await fromFilmstudy();
  if (q === null) return [];
  const { data, error } = await run(q);
  if (error !== null && error !== undefined) return [];
  return (data ?? []) as T[];
}

export async function listFilm(teamId: string): Promise<FilmRow[]> {
  return rows<FilmRow>((q) =>
    q
      .from("film_assets")
      .select(FILM_COLUMNS)
      .eq("team_id", teamId)
      .order("created_at", { ascending: false }),
  );
}

export async function getFilm(filmId: string): Promise<FilmRow | null> {
  const found = await rows<FilmRow>((q) =>
    q.from("film_assets").select(FILM_COLUMNS).eq("id", filmId).limit(1),
  );
  return found[0] ?? null;
}

export async function listPlays(filmId: string): Promise<PlayRow[]> {
  return rows<PlayRow>((q) =>
    q
      .from("plays")
      .select(PLAY_COLUMNS)
      .eq("film_asset_id", filmId)
      .order("play_number"),
  );
}

export async function listTeamPlays(teamId: string): Promise<PlayRow[]> {
  return rows<PlayRow>((q) =>
    q.from("plays").select(PLAY_COLUMNS).eq("team_id", teamId).order("play_number"),
  );
}

export async function listPlayers(teamId: string): Promise<PlayerRow[]> {
  return rows<PlayerRow>((q) =>
    q
      .from("players")
      .select(PLAYER_COLUMNS)
      .eq("team_id", teamId)
      .order("jersey_number", { nullsFirst: false }),
  );
}

export async function getPlayer(playerId: string): Promise<PlayerRow | null> {
  const found = await rows<PlayerRow>((q) =>
    q.from("players").select(PLAYER_COLUMNS).eq("id", playerId).limit(1),
  );
  return found[0] ?? null;
}

export async function listGames(teamId: string): Promise<GameRow[]> {
  return rows<GameRow>((q) =>
    q
      .from("games")
      .select(columns("games", ["team_id"]))
      .eq("team_id", teamId)
      .order("kickoff_at", { ascending: false, nullsFirst: false }),
  );
}

export async function listOpponents(teamId: string): Promise<OpponentRow[]> {
  return rows<OpponentRow>((q) =>
    q
      .from("opponents")
      .select(columns("opponents", ["team_id"]))
      .eq("team_id", teamId)
      .order("name"),
  );
}

export async function listSeasons(teamId: string): Promise<SeasonRow[]> {
  return rows<SeasonRow>((q) =>
    q
      .from("seasons")
      .select(columns("seasons", ["team_id"]))
      .eq("team_id", teamId)
      .order("year", { ascending: false }),
  );
}

export async function listParticipation(
  playIds: readonly string[],
): Promise<ParticipationRow[]> {
  if (playIds.length === 0) return [];
  return rows<ParticipationRow>((q) =>
    q
      .from("play_participation")
      .select(columns("play_participation"))
      .in("play_id", [...playIds]),
  );
}

export async function listPlayerParticipation(
  playerId: string,
): Promise<ParticipationRow[]> {
  return rows<ParticipationRow>((q) =>
    q
      .from("play_participation")
      .select(columns("play_participation"))
      .eq("player_id", playerId),
  );
}

export async function listGrades(playIds: readonly string[]): Promise<GradeRow[]> {
  if (playIds.length === 0) return [];
  return rows<GradeRow>((q) =>
    q
      .from("player_grades")
      .select(columns("player_grades"))
      .in("play_id", [...playIds]),
  );
}

export async function listPlayerGrades(playerId: string): Promise<GradeRow[]> {
  return rows<GradeRow>((q) =>
    q.from("player_grades").select(columns("player_grades")).eq("player_id", playerId),
  );
}

export async function listGradeCategories(teamId: string): Promise<GradeCategoryRow[]> {
  return rows<GradeCategoryRow>((q) =>
    q
      .from("grade_categories")
      .select(columns("grade_categories", ["team_id"]))
      .eq("team_id", teamId)
      .eq("active", true)
      .order("sort_order"),
  );
}

export async function listPlayerNotes(playerId: string): Promise<NoteRow[]> {
  return rows<NoteRow>((q) =>
    q
      .from("player_notes")
      .select(columns("player_notes"))
      .eq("player_id", playerId)
      .order("created_at", { ascending: false }),
  );
}

export async function listNotesForPlays(
  playIds: readonly string[],
): Promise<NoteRow[]> {
  if (playIds.length === 0) return [];
  return rows<NoteRow>((q) =>
    q
      .from("player_notes")
      .select(columns("player_notes"))
      .in("play_id", [...playIds]),
  );
}

export async function listPredictions(
  playIds: readonly string[],
): Promise<PredictionRow[]> {
  if (playIds.length === 0) return [];
  return rows<PredictionRow>((q) =>
    q
      .from("predictions")
      .select(columns("predictions"))
      .in("play_id", [...playIds]),
  );
}

export async function listClips(teamId: string): Promise<ClipRow[]> {
  return rows<ClipRow>((q) =>
    q
      .from("clips")
      .select(columns("clips", ["team_id"]))
      .eq("team_id", teamId)
      .order("created_at", { ascending: false }),
  );
}

export async function listPlaylists(teamId: string): Promise<PlaylistRow[]> {
  return rows<PlaylistRow>((q) =>
    q
      .from("playlists")
      .select(columns("playlists", ["team_id"]))
      .eq("team_id", teamId)
      .order("created_at", { ascending: false }),
  );
}

export async function listPlaylistItems(
  playlistId: string,
): Promise<PlaylistItemRow[]> {
  return rows<PlaylistItemRow>((q) =>
    q
      .from("playlist_items")
      .select(columns("playlist_items"))
      .eq("playlist_id", playlistId)
      .order("position"),
  );
}

export async function listAssignments(teamId: string): Promise<AssignmentRow[]> {
  return rows<AssignmentRow>((q) =>
    q
      .from("film_assignments")
      .select(columns("film_assignments", ["team_id"]))
      .eq("team_id", teamId)
      .order("created_at", { ascending: false }),
  );
}

export async function listAssignmentItems(
  assignmentIds: readonly string[],
): Promise<AssignmentItemRow[]> {
  if (assignmentIds.length === 0) return [];
  return rows<AssignmentItemRow>((q) =>
    q
      .from("assignment_items")
      .select(columns("assignment_items"))
      .in("assignment_id", [...assignmentIds])
      .order("position"),
  );
}

export async function listPlaysById(playIds: readonly string[]): Promise<PlayRow[]> {
  if (playIds.length === 0) return [];
  return rows<PlayRow>((q) =>
    q
      .from("plays")
      .select(PLAY_COLUMNS)
      .in("id", [...playIds])
      .order("play_number"),
  );
}

/**
 * A time-limited URL for one film's bytes.
 *
 * Film is private and proprietary (section 38), so nothing is ever served from
 * a public bucket. Returns null when there is no object — which is the normal
 * case for demo film and for a registered upload that has not arrived yet, and
 * the player renders an explanation rather than a broken element.
 */
export async function signedFilmUrl(film: FilmRow): Promise<string | null> {
  if (film.object_path === null || film.status !== "ready") return null;
  const client = await readClient();
  if (client === null) return null;
  const { data, error } = await client.storage
    .from(film.bucket)
    .createSignedUrl(film.object_path, 60 * 60);
  if (error !== null && error !== undefined) return null;
  return data?.signedUrl ?? null;
}
