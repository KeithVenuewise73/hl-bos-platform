import Link from "next/link";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/session";
import { can, isStaffRole } from "@/lib/access";
import {
  getPlayer,
  listPlayerGrades,
  listPlayerNotes,
  listPlayerParticipation,
  listPlaysById,
} from "@/lib/data";
import { playerSeason } from "@/lib/summary";
import { playerLabel, timecode } from "@/lib/format";
import { Badge, Card, Empty, Notice, PageHead, Tile } from "@/components/ui";
import { NoTeam } from "@/components/no-team";

export const dynamic = "force-dynamic";

/**
 * A player's film page.
 *
 * What is NOT here matters: there is no season projection, no position ranking
 * and no computed "tackles" or "pressures". Those are Phase 4 stat extraction.
 * Showing them now would mean deriving them from tags nobody has entered.
 */
export default async function PlayerPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  const viewer = await getViewer();
  if (viewer.team === null) return <NoTeam viewer={viewer} />;

  const player = await getPlayer(playerId);
  if (player === null) notFound();

  const staff = isStaffRole(viewer.role);
  const [participation, grades, notes] = await Promise.all([
    listPlayerParticipation(playerId),
    listPlayerGrades(playerId),
    listPlayerNotes(playerId),
  ]);
  const plays = await listPlaysById(participation.map((p) => p.play_id));
  const playById = new Map(plays.map((p) => [p.id, p]));
  const season = playerSeason(participation, grades);

  return (
    <>
      <PageHead
        title={playerLabel(player)}
        sub={[player.position, player.class_year, player.unit]
          .filter(Boolean)
          .join(" · ")}
      >
        <Link href="/players" className="btn sm ghost">
          All players
        </Link>
      </PageHead>

      <div className="grid grid-4">
        <Tile
          label="Snaps tagged"
          value={season.snaps}
          hint="Plays a coach recorded them on"
        />
        <Tile label="Offense" value={season.offensiveSnaps} />
        <Tile label="Defense" value={season.defensiveSnaps} />
        <Tile label="Special teams" value={season.specialTeamsSnaps} />
      </div>

      {staff ? (
        <>
          <h2 style={{ margin: "22px 0 10px" }}>Grades</h2>
          {season.graded === 0 ? (
            <Empty
              title="Not graded yet"
              reason={
                season.snaps === 0
                  ? "This player is not recorded on any tagged play yet, so there is nothing to grade."
                  : `${season.snaps} snaps are tagged for this player and none has been graded. That is work still to do, not a zero.`
              }
            />
          ) : (
            <>
              <div className="grid grid-4">
                <Tile label="Graded reps" value={season.graded} />
                <Tile label="Positive" value={season.positive} />
                <Tile label="Neutral" value={season.neutral} />
                <Tile label="Negative" value={season.negative} />
                <Tile
                  label="Average"
                  value={season.averageGrade}
                  hint="Null, not zero, when nothing is graded"
                />
                <Tile label="Ungraded snaps" value={season.ungraded} />
              </div>
              {season.ungraded > 0 ? (
                <Notice>
                  {season.ungraded} of this player&rsquo;s {season.snaps} tagged snaps
                  carry no grade. The figures above describe the {season.graded} that
                  do.
                </Notice>
              ) : null}
            </>
          )}
        </>
      ) : null}

      <h2 style={{ margin: "22px 0 10px" }}>Coaching notes</h2>
      {notes.length === 0 ? (
        <Empty
          title="No notes"
          reason={
            staff
              ? "No coach has written a note about this player yet."
              : "Your coaches have not shared any notes with you yet."
          }
        />
      ) : (
        <Card>
          <div className="stack">
            {notes.map((note) => {
              const play =
                note.play_id === null ? undefined : playById.get(note.play_id);
              return (
                <div
                  key={note.id}
                  style={{ borderBottom: "1px solid var(--line)", paddingBottom: 10 }}
                >
                  <div className="row between">
                    <span className="tiny faint">
                      {play === undefined ? (
                        "General note"
                      ) : (
                        <Link href={`/film/${play.film_asset_id}`}>
                          Play {play.play_number}
                          {note.timestamp_seconds === null
                            ? ""
                            : ` · ${timecode(note.timestamp_seconds)}`}
                        </Link>
                      )}
                    </span>
                    {note.visible_to_athlete ? (
                      <Badge tone="accent">Shared with athlete</Badge>
                    ) : (
                      <span className="tiny faint">Coaches only</span>
                    )}
                  </div>
                  <div>{note.body}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {staff ? (
        <>
          <h2 style={{ margin: "22px 0 10px" }}>Snaps</h2>
          {participation.length === 0 ? (
            <Empty
              title="No tagged snaps"
              reason="This player has not been recorded on any play yet. Attach them to plays in the film room."
            />
          ) : (
            <Card>
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Play</th>
                      <th>Unit</th>
                      <th>Position</th>
                      <th>Assignment</th>
                      <th>Film</th>
                    </tr>
                  </thead>
                  <tbody>
                    {participation.map((row) => {
                      const play = playById.get(row.play_id);
                      return (
                        <tr key={row.id}>
                          <td className="mono">
                            {play === undefined ? "—" : play.play_number}
                          </td>
                          <td className="dim">{row.unit}</td>
                          <td className="dim">
                            {row.position ?? <span className="faint">&mdash;</span>}
                          </td>
                          <td className="dim small">
                            {row.assignment ?? (
                              <span className="faint">not recorded</span>
                            )}
                          </td>
                          <td>
                            {play === undefined ? null : (
                              <Link
                                href={`/film/${play.film_asset_id}`}
                                className="btn sm ghost"
                              >
                                Watch
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
        </>
      ) : null}

      {can(viewer.role, "assign_film") ? (
        <Notice tone="accent">
          To send this player film to review, open a play in the film room and assign
          it, or use{" "}
          <Link href="/assignments" style={{ color: "var(--accent)" }}>
            Assignments
          </Link>
          .
        </Notice>
      ) : null}
    </>
  );
}
