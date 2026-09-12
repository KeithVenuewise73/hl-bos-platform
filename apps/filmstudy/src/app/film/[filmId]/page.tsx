import Link from "next/link";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/session";
import { can, isStaffRole } from "@/lib/access";
import {
  getFilm,
  listGradeCategories,
  listGrades,
  listNotesForPlays,
  listParticipation,
  listPlayers,
  listPlays,
  listPredictions,
  signedFilmUrl,
} from "@/lib/data";
import { taggingProgress } from "@/lib/summary";
import { FILM_KIND_LABEL, filmStatus, shortDate } from "@/lib/format";
import { Badge, Notice, PageHead } from "@/components/ui";
import { FilmRoom } from "@/components/film-room";

export const dynamic = "force-dynamic";

/**
 * The film room: the screen the product exists for.
 *
 * Left, the play list. Centre, the player. Right, play data, AI suggestions,
 * grades and notes. Bottom, the timeline. All of it server-rendered from
 * confirmed rows and handed to one client component that owns playback and the
 * keyboard.
 */
export default async function FilmRoomPage({
  params,
}: {
  params: Promise<{ filmId: string }>;
}) {
  const { filmId } = await params;
  const viewer = await getViewer();
  if (viewer.team === null) notFound();

  const film = await getFilm(filmId);
  // RLS returns nothing for a film this user may not see, so "not visible to
  // you" and "does not exist" are the same 404. That is intentional: a
  // different message would confirm the film exists.
  if (film === null) notFound();

  const staff = isStaffRole(viewer.role);
  const plays = await listPlays(filmId);
  const playIds = plays.map((p) => p.id);

  const [participation, grades, predictions, notes, players, categories, videoUrl] =
    await Promise.all([
      listParticipation(playIds),
      staff ? listGrades(playIds) : Promise.resolve([]),
      staff ? listPredictions(playIds) : Promise.resolve([]),
      listNotesForPlays(playIds),
      staff ? listPlayers(viewer.team.id) : Promise.resolve([]),
      listGradeCategories(viewer.team.id),
      signedFilmUrl(film),
    ]);

  const status = filmStatus(film.status);
  const progress = taggingProgress(plays, participation);

  return (
    <>
      <PageHead
        title={film.title}
        sub={`${FILM_KIND_LABEL[film.film_kind]} · ${shortDate(film.recorded_on ?? film.created_at)}`}
      >
        <Badge tone={status.tone}>{status.label}</Badge>
        {film.film_kind === "opponent" ? <Badge tone="warn">Coaches only</Badge> : null}
        <Link href="/film" className="btn sm ghost">
          All film
        </Link>
      </PageHead>

      {!status.playable ? (
        <Notice tone={film.status === "failed" ? "bad" : "warn"}>
          <strong>{status.label}.</strong> {status.meaning}
          {film.status === "demo_no_video" && plays.length > 0
            ? " The plays and tags below are real rows and behave exactly like real film data — only the video is absent."
            : ""}
        </Notice>
      ) : null}

      {staff &&
      plays.length > 0 &&
      progress.percent !== null &&
      progress.percent < 100 ? (
        <Notice>
          This film is <strong>{progress.percent}% charted</strong>:{" "}
          {progress.withSituation} of {progress.plays} plays have a down and distance,{" "}
          {progress.withFormation} have a formation, {progress.withResult} have a result
          and {progress.withParticipation} have players attached. Any tendency built on
          it describes the charted part, not the game.
        </Notice>
      ) : null}

      <div style={{ marginTop: 14 }}>
        <FilmRoom
          filmId={film.id}
          teamId={viewer.team.id}
          teamLevel={viewer.team.level}
          gradeScale={viewer.team.grade_scale}
          videoUrl={videoUrl}
          durationSeconds={film.duration_seconds}
          playable={status.playable}
          notPlayableReason={status.meaning}
          plays={plays}
          participation={participation}
          grades={grades}
          predictions={predictions}
          notes={notes}
          players={players}
          categories={categories}
          canTag={can(viewer.role, "tag_plays")}
          canGrade={can(viewer.role, "grade_players")}
          canClip={can(viewer.role, "make_clips")}
          canAssign={can(viewer.role, "assign_film")}
        />
      </div>
    </>
  );
}
