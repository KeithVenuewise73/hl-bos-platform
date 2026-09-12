import Link from "next/link";
import { getViewer } from "@/lib/session";
import { can, isStaffRole } from "@/lib/access";
import {
  listAssignments,
  listFilm,
  listGames,
  listOpponents,
  listPlayers,
  listTeamPlays,
} from "@/lib/data";
import { reviewStatus, teamSnapshot } from "@/lib/summary";
import {
  FILM_KIND_LABEL,
  filmStatus,
  playerLabel,
  scoreline,
  shortDate,
} from "@/lib/format";
import { Badge, Card, Empty, Notice, PageHead, Tile } from "@/components/ui";
import { TeamSwitcher } from "@/components/team-switcher";
import { NoTeam } from "@/components/no-team";

export const dynamic = "force-dynamic";

/**
 * The dashboard.
 *
 * Principle 10 governs this screen more than any other, because it is the one
 * a CEO or a head coach glances at and believes. Every panel here either shows
 * rows that exist or says, in words, that it has nothing and why. There is no
 * placeholder chart, no sample insight and no zero standing in for an absence.
 *
 * The AI INSIGHTS panel from the brief is the sharpest case: FilmStudy has no
 * inference pipeline in Phase 1, so it does not render an insight. It says what
 * it would take to produce one. An empty panel that explains itself beats a
 * green one that lies.
 */
export default async function DashboardPage() {
  const viewer = await getViewer();
  if (viewer.team === null) return <NoTeam viewer={viewer} />;

  const team = viewer.team;
  const staff = isStaffRole(viewer.role);

  const [film, plays, players, games, opponents, assignments] = await Promise.all([
    listFilm(team.id),
    listTeamPlays(team.id),
    staff ? listPlayers(team.id) : Promise.resolve([]),
    listGames(team.id),
    staff ? listOpponents(team.id) : Promise.resolve([]),
    listAssignments(team.id),
  ]);

  const snapshot = teamSnapshot(plays);
  const review = reviewStatus(assignments);
  const opponentName = new Map(opponents.map((o) => [o.id, o.name]));

  const now = Date.now();
  const upcoming = games
    .filter((g) => g.kickoff_at !== null && new Date(g.kickoff_at).getTime() > now)
    .sort(
      (a, b) =>
        new Date(a.kickoff_at ?? 0).getTime() - new Date(b.kickoff_at ?? 0).getTime(),
    )[0];
  const played = games.filter(
    (g) => g.team_score !== null && g.opponent_score !== null,
  );
  const wins = played.filter(
    (g) => (g.team_score ?? 0) > (g.opponent_score ?? 0),
  ).length;
  const losses = played.filter(
    (g) => (g.team_score ?? 0) < (g.opponent_score ?? 0),
  ).length;
  const recentFilm = film[0];

  return (
    <>
      <PageHead title={team.name} sub={staff ? "Coaching dashboard" : "Your film"}>
        <TeamSwitcher teams={viewer.teams} currentId={team.id} />
        {can(viewer.role, "upload_film") ? (
          <Link href="/film/upload" className="btn primary">
            Upload film
          </Link>
        ) : null}
      </PageHead>

      {team.is_demo ? (
        <Notice>
          <strong>This is the demo program.</strong> Every row below is real data in the
          database, seeded deliberately and marked as demo — but no football was watched
          to produce it, and the film has no video file behind it. Nothing here
          describes a real game.
        </Notice>
      ) : null}

      <div className="grid grid-2" style={{ marginTop: 14 }}>
        <Card title="Next game">
          {upcoming === undefined ? (
            <Empty
              title="No upcoming game scheduled"
              reason={
                games.length === 0
                  ? "No games have been added to this season yet."
                  : "Every game on the schedule has already been played."
              }
              action={
                can(viewer.role, "manage_program") ? (
                  <Link href="/games" className="btn sm">
                    Add a game
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <div className="stack">
              <div className="row between">
                <div>
                  <div style={{ fontSize: 19, fontWeight: 650 }}>
                    {upcoming.opponent_id === null
                      ? "Opponent not set"
                      : (opponentName.get(upcoming.opponent_id) ?? "Opponent not set")}
                  </div>
                  <div className="dim small">
                    {shortDate(upcoming.kickoff_at)}
                    {upcoming.location === null ? "" : ` · ${upcoming.location}`}
                  </div>
                </div>
                <Badge tone={upcoming.venue === "home" ? "accent" : "neutral"}>
                  {upcoming.venue === "home"
                    ? "Home"
                    : upcoming.venue === "away"
                      ? "Away"
                      : "Neutral"}
                </Badge>
              </div>
              <div className="dim small">
                {played.length === 0
                  ? "No completed games recorded, so there is no record to show."
                  : `Record ${wins}-${losses} from ${played.length} recorded ${played.length === 1 ? "game" : "games"}.`}
              </div>
            </div>
          )}
        </Card>

        <Card title="Recent film">
          {recentFilm === undefined ? (
            <Empty
              title="No film uploaded"
              reason="Nothing has been uploaded to this team yet."
              action={
                can(viewer.role, "upload_film") ? (
                  <Link href="/film/upload" className="btn sm primary">
                    Upload the first film
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <div className="stack">
              <div className="row between">
                <Link href={`/film/${recentFilm.id}`} style={{ fontWeight: 600 }}>
                  {recentFilm.title}
                </Link>
                <Badge tone={filmStatus(recentFilm.status).tone}>
                  {filmStatus(recentFilm.status).label}
                </Badge>
              </div>
              <div className="dim small">
                {FILM_KIND_LABEL[recentFilm.film_kind]} ·{" "}
                {shortDate(recentFilm.created_at)}
              </div>
              <div className="small">
                {(() => {
                  const count = plays.filter(
                    (p) => p.film_asset_id === recentFilm.id,
                  ).length;
                  return count === 0
                    ? "No plays segmented yet. Open the film and mark the first play."
                    : `${count} ${count === 1 ? "play" : "plays"} segmented.`;
                })()}
              </div>
              <div className="tiny faint">{filmStatus(recentFilm.status).meaning}</div>
            </div>
          )}
        </Card>
      </div>

      <h2 style={{ margin: "22px 0 10px" }}>Team snapshot</h2>
      {plays.length === 0 ? (
        <Empty
          title="Nothing to count yet"
          reason={
            film.length === 0
              ? "No film has been uploaded, so there are no plays to summarise."
              : "Film is uploaded but no plays have been segmented. Open a film and mark the first play."
          }
          action={
            film.length > 0 ? (
              <Link href="/film" className="btn sm">
                Open the film library
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="grid grid-4">
            <Tile label="Offensive plays" value={snapshot.offensivePlays} />
            <Tile label="Defensive plays" value={snapshot.defensivePlays} />
            <Tile
              label="Explosive plays"
              value={snapshot.explosive}
              hint="12+ run, 16+ pass"
            />
            <Tile label="Turnovers" value={snapshot.turnovers} />
            <Tile label="Penalties" value={snapshot.penalties} />
            <Tile label="Red-zone plays" value={snapshot.redZonePlays} />
            <Tile
              label="Third-down conversion"
              value={
                snapshot.thirdDownConversion.percent === null
                  ? null
                  : `${snapshot.thirdDownConversion.percent}%`
              }
              hint={
                snapshot.thirdDownConversion.sample === 0
                  ? "No third down tagged with our offence on the field"
                  : `${snapshot.thirdDownConversion.hits} of ${snapshot.thirdDownConversion.sample}`
              }
            />
            <Tile label="Plays tagged" value={snapshot.totalPlays} />
          </div>
          {snapshot.untaggedPossession > 0 ? (
            <Notice>
              {snapshot.untaggedPossession} of {snapshot.totalPlays} plays have no
              possession tagged, so they are counted in the total but in neither the
              offensive nor the defensive figure. These counts describe the film that
              has been charted, not the whole game.
            </Notice>
          ) : null}
        </>
      )}

      <div className="grid grid-2" style={{ marginTop: 22 }}>
        <Card title="Film review status" sub="What athletes have actually done">
          {assignments.length === 0 ? (
            <Empty
              title="No film assigned"
              reason="No coach has assigned film to an athlete on this team yet."
              action={
                can(viewer.role, "assign_film") ? (
                  <Link href="/assignments" className="btn sm">
                    Assign film
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="grid grid-3">
                <Tile label="Assigned" value={review.assigned} />
                <Tile label="Reviewed" value={review.completed} />
                <Tile label="Not started" value={review.outstanding} />
              </div>
              <p className="tiny faint" style={{ marginTop: 10, marginBottom: 0 }}>
                Counted from what each athlete recorded themselves. A coach cannot mark
                an athlete&rsquo;s film reviewed — the database refuses it — so this
                figure is evidence, not a self-report.
              </p>
            </>
          )}
        </Card>

        <Card title="FilmStudy AI insights">
          <Empty
            title="No insights — and none invented"
            reason={
              "FilmStudy has no computer-vision or inference pipeline running yet, so it has " +
              "nothing to tell you about this film that a coach did not already type in. " +
              "Rather than show an example insight that reads like a finding, it shows this. " +
              "Automated insights arrive in Phase 2, on top of confirmed tags."
            }
            action={
              staff ? (
                <Link href="/ai-coach" className="btn sm ghost">
                  What Phase 2 will do
                </Link>
              ) : undefined
            }
          />
        </Card>
      </div>

      {staff && players.length === 0 ? (
        <Notice tone="accent">
          <strong>No roster yet.</strong> Players are what connect a snap to a grade, a
          note and a development goal.{" "}
          <Link href="/players" style={{ color: "var(--accent)" }}>
            Add the roster
          </Link>
          .
        </Notice>
      ) : null}

      {!staff && assignments.length > 0 ? (
        <Card title="Your film to review">
          <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {assignments.slice(0, 5).map((assignment) => (
              <li key={assignment.id} className="row between">
                <span>{assignment.message ?? "Film assigned for review"}</span>
                <Badge tone={assignment.status === "completed" ? "good" : "warn"}>
                  {assignment.status}
                </Badge>
              </li>
            ))}
          </ul>
          <Link href="/assignments" className="btn sm" style={{ marginTop: 12 }}>
            Open assignments
          </Link>
        </Card>
      ) : null}

      {staff && players.length > 0 ? (
        <Card
          title="Roster"
          sub={`${players.filter((p) => p.active).length} active players`}
        >
          <div className="row">
            {players.slice(0, 12).map((player) => (
              <Link key={player.id} href={`/players/${player.id}`} className="badge">
                {playerLabel(player)}
                {player.position === null ? "" : ` · ${player.position}`}
              </Link>
            ))}
            {players.length > 12 ? (
              <Link href="/players" className="badge accent">
                +{players.length - 12} more
              </Link>
            ) : null}
          </div>
        </Card>
      ) : null}

      {played.length > 0 ? (
        <Card title="Results recorded">
          <div className="row">
            {played.slice(0, 8).map((game) => (
              <span key={game.id} className="badge">
                {game.opponent_id === null
                  ? "Opponent not set"
                  : (opponentName.get(game.opponent_id) ?? "Opponent not set")}{" "}
                {scoreline(game.team_score, game.opponent_score)}
              </span>
            ))}
          </div>
        </Card>
      ) : null}
    </>
  );
}
