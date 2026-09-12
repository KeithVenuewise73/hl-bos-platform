import Link from "next/link";
import { getViewer } from "@/lib/session";
import { can, isStaffRole } from "@/lib/access";
import { listFilm, listGames, listOpponents, listSeasons } from "@/lib/data";
import { scoreline, shortDate } from "@/lib/format";
import { Badge, Card, Empty, PageHead } from "@/components/ui";
import { NoTeam } from "@/components/no-team";
import { GameForm, OpponentForm } from "@/components/game-form";

export const dynamic = "force-dynamic";

export default async function GamesPage() {
  const viewer = await getViewer();
  if (viewer.team === null) return <NoTeam viewer={viewer} />;
  const team = viewer.team;
  const staff = isStaffRole(viewer.role);

  const [games, opponents, seasons, film] = await Promise.all([
    listGames(team.id),
    staff ? listOpponents(team.id) : Promise.resolve([]),
    listSeasons(team.id),
    listFilm(team.id),
  ]);
  const opponentName = new Map(opponents.map((o) => [o.id, o.name]));
  const filmByGame = new Map<string, string>();
  for (const asset of film) {
    if (asset.game_id !== null && !filmByGame.has(asset.game_id)) {
      filmByGame.set(asset.game_id, asset.id);
    }
  }

  return (
    <>
      <PageHead title="Games" sub={team.name} />

      {games.length === 0 ? (
        <Empty
          title="No games yet"
          reason="Add the schedule so film can be attached to the game it came from. Film works without a game, but a game makes the dashboard's next-game card and the season record possible."
        />
      ) : (
        <Card>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Opponent</th>
                  <th>Date</th>
                  <th>Week</th>
                  <th>Venue</th>
                  <th>Result</th>
                  <th>Film</th>
                </tr>
              </thead>
              <tbody>
                {games.map((game) => {
                  const score = scoreline(game.team_score, game.opponent_score);
                  const filmId = filmByGame.get(game.id);
                  return (
                    <tr key={game.id}>
                      <td style={{ fontWeight: 600 }}>
                        {game.opponent_id === null ? (
                          <span className="faint">Not set</span>
                        ) : staff ? (
                          (opponentName.get(game.opponent_id) ?? "Opponent")
                        ) : (
                          "Opponent"
                        )}
                      </td>
                      <td className="dim nowrap">{shortDate(game.kickoff_at)}</td>
                      <td className="mono dim">
                        {game.week === null ? (
                          <span className="faint">&mdash;</span>
                        ) : (
                          game.week
                        )}
                      </td>
                      <td className="dim">{game.venue}</td>
                      <td>
                        {score === null ? (
                          <span className="faint tiny">Not played</span>
                        ) : (
                          <Badge
                            tone={
                              score.startsWith("W")
                                ? "good"
                                : score.startsWith("L")
                                  ? "bad"
                                  : "neutral"
                            }
                          >
                            {score}
                          </Badge>
                        )}
                      </td>
                      <td>
                        {filmId === undefined ? (
                          <span className="faint tiny">None attached</span>
                        ) : (
                          <Link href={`/film/${filmId}`} className="btn sm ghost">
                            Open film
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {can(viewer.role, "manage_program") ? (
        <>
          <Card
            title="Add an opponent"
            sub="Opponents are coaching information and stay coach-only."
          >
            <OpponentForm teamId={team.id} />
          </Card>
          <Card title="Add or update a game">
            <GameForm
              teamId={team.id}
              opponents={opponents.map((o) => ({ id: o.id, name: o.name }))}
              seasons={seasons.map((s) => ({ id: s.id, label: s.label }))}
            />
          </Card>
        </>
      ) : null}
    </>
  );
}
