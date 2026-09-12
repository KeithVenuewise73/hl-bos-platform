import Link from "next/link";
import { getViewer } from "@/lib/session";
import { can, isStaffRole } from "@/lib/access";
import { listFilm, listGames, listOpponents, listTeamPlays } from "@/lib/data";
import {
  FILM_KIND_LABEL,
  fileSize,
  filmStatus,
  shortDate,
  timecode,
} from "@/lib/format";
import { Badge, Card, Empty, Notice, PageHead } from "@/components/ui";
import { NoTeam } from "@/components/no-team";

export const dynamic = "force-dynamic";

/**
 * The film library.
 *
 * Grouped by what it is, because "our game film", "practice" and "opponent
 * scouting" are three different jobs. An athlete never reaches the opponent
 * group at all — not because this page hides it, but because RLS never returns
 * those rows to them.
 */
export default async function FilmLibraryPage() {
  const viewer = await getViewer();
  if (viewer.team === null) return <NoTeam viewer={viewer} />;
  const team = viewer.team;
  const staff = isStaffRole(viewer.role);

  const [film, plays, games, opponents] = await Promise.all([
    listFilm(team.id),
    listTeamPlays(team.id),
    listGames(team.id),
    staff ? listOpponents(team.id) : Promise.resolve([]),
  ]);

  const playCount = new Map<string, number>();
  for (const play of plays) {
    playCount.set(play.film_asset_id, (playCount.get(play.film_asset_id) ?? 0) + 1);
  }
  const opponentName = new Map(opponents.map((o) => [o.id, o.name]));
  const gameOpponent = new Map(games.map((g) => [g.id, g.opponent_id]));

  const groups = [
    { kind: "game" as const, label: "Game film" },
    { kind: "practice" as const, label: "Practice" },
    { kind: "scrimmage" as const, label: "Scrimmage" },
    { kind: "individual_workout" as const, label: "Individual workouts" },
    { kind: "opponent" as const, label: "Opponent scouting" },
  ].map((group) => ({
    ...group,
    items: film.filter((f) => f.film_kind === group.kind),
  }));

  return (
    <>
      <PageHead
        title="Film"
        sub={
          film.length === 0
            ? "Nothing uploaded yet"
            : `${film.length} ${film.length === 1 ? "film" : "films"} · ${plays.length} plays segmented`
        }
      >
        {can(viewer.role, "upload_film") ? (
          <Link href="/film/upload" className="btn primary">
            Upload film
          </Link>
        ) : null}
      </PageHead>

      {film.length === 0 ? (
        <Empty
          title="No film in this library"
          reason={
            staff
              ? "Nothing has been uploaded to this team yet. Game, practice, scrimmage, individual workout and opponent film all live here."
              : "No film has been shared with you yet. Your coaches decide which film the squad can open, and any clip assigned directly to you will also appear here."
          }
          action={
            can(viewer.role, "upload_film") ? (
              <Link href="/film/upload" className="btn sm primary">
                Upload the first film
              </Link>
            ) : undefined
          }
        />
      ) : (
        groups
          .filter((group) => group.items.length > 0)
          .map((group) => (
            <Card
              key={group.kind}
              title={group.label}
              sub={`${group.items.length} in this group`}
            >
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Film</th>
                      <th>Date</th>
                      <th>Plays</th>
                      <th>Length</th>
                      <th>Status</th>
                      <th>Shared</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item) => {
                      const status = filmStatus(item.status);
                      const opponentId =
                        item.game_id === null
                          ? null
                          : (gameOpponent.get(item.game_id) ?? null);
                      const plays = playCount.get(item.id) ?? 0;
                      return (
                        <tr key={item.id}>
                          <td>
                            <Link href={`/film/${item.id}`} style={{ fontWeight: 600 }}>
                              {item.title}
                            </Link>
                            <div className="tiny faint">
                              {FILM_KIND_LABEL[item.film_kind]}
                              {opponentId === null
                                ? ""
                                : ` · vs ${opponentName.get(opponentId) ?? "opponent"}`}
                              {item.size_bytes === null
                                ? ""
                                : ` · ${fileSize(item.size_bytes)}`}
                            </div>
                          </td>
                          <td className="nowrap dim">
                            {shortDate(item.recorded_on ?? item.created_at)}
                          </td>
                          <td className="mono">
                            {plays === 0 ? (
                              <span className="faint">none yet</span>
                            ) : (
                              plays
                            )}
                          </td>
                          <td className="mono dim">
                            {item.duration_seconds === null ? (
                              <span className="faint">unknown</span>
                            ) : (
                              timecode(item.duration_seconds)
                            )}
                          </td>
                          <td>
                            <Badge tone={status.tone}>{status.label}</Badge>
                          </td>
                          <td>
                            {item.film_kind === "opponent" ? (
                              <span className="tiny faint">Coaches only</span>
                            ) : item.athlete_visible ? (
                              <Badge tone="accent">Squad</Badge>
                            ) : (
                              <span className="tiny faint">Coaches only</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ))
      )}

      {staff && film.some((f) => f.status === "registered") ? (
        <Notice>
          Some film is registered but has no video behind it yet. That happens when an
          upload was started and did not finish — the record is there, the bytes are
          not. Upload the file again to complete it.
        </Notice>
      ) : null}
    </>
  );
}
