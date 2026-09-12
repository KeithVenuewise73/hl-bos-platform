import Link from "next/link";
import { getViewer } from "@/lib/session";
import { can, isStaffRole } from "@/lib/access";
import { listGrades, listPlayers, listTeamPlays, listParticipation } from "@/lib/data";
import { playerLabel } from "@/lib/format";
import { Card, Empty, Notice, PageHead } from "@/components/ui";
import { NoTeam } from "@/components/no-team";
import { PlayerForm } from "@/components/player-form";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const viewer = await getViewer();
  if (viewer.team === null) return <NoTeam viewer={viewer} />;
  const team = viewer.team;

  if (!isStaffRole(viewer.role)) {
    return (
      <>
        <PageHead title="Players" />
        <Notice tone="bad">
          The roster is coaching information. Your own film, notes and assignments are
          on your dashboard.
        </Notice>
      </>
    );
  }

  const [players, plays] = await Promise.all([
    listPlayers(team.id),
    listTeamPlays(team.id),
  ]);
  const participation = await listParticipation(plays.map((p) => p.id));
  const grades = await listGrades(plays.map((p) => p.id));

  const snapsBy = new Map<string, number>();
  for (const row of participation) {
    snapsBy.set(row.player_id, (snapsBy.get(row.player_id) ?? 0) + 1);
  }
  const gradesBy = new Map<string, number>();
  for (const row of grades) {
    gradesBy.set(row.player_id, (gradesBy.get(row.player_id) ?? 0) + 1);
  }

  return (
    <>
      <PageHead
        title="Players"
        sub={`${players.filter((p) => p.active).length} active on ${team.name}`}
      />

      {players.length === 0 ? (
        <Empty
          title="No roster yet"
          reason="A player row is what connects a snap to a grade, a coaching note and a development goal. Until the roster exists, film can be tagged but nothing can be attributed to anyone."
        />
      ) : (
        <Card>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Pos</th>
                  <th>Unit</th>
                  <th>Class</th>
                  <th>Snaps</th>
                  <th>Grades</th>
                </tr>
              </thead>
              <tbody>
                {players.map((player) => {
                  const snaps = snapsBy.get(player.id) ?? 0;
                  const graded = gradesBy.get(player.id) ?? 0;
                  return (
                    <tr key={player.id}>
                      <td>
                        <Link
                          href={`/players/${player.id}`}
                          style={{ fontWeight: 600 }}
                        >
                          {playerLabel(player)}
                        </Link>
                        {!player.active ? (
                          <span className="tiny faint"> (inactive)</span>
                        ) : null}
                      </td>
                      <td className="dim">
                        {player.position ?? <span className="faint">&mdash;</span>}
                      </td>
                      <td className="dim">
                        {player.unit ?? <span className="faint">&mdash;</span>}
                      </td>
                      <td className="dim">
                        {player.class_year ?? <span className="faint">&mdash;</span>}
                      </td>
                      <td className="mono">
                        {snaps === 0 ? (
                          <span className="faint">none tagged</span>
                        ) : (
                          snaps
                        )}
                      </td>
                      <td className="mono">
                        {graded === 0 ? <span className="faint">none</span> : graded}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="tiny faint" style={{ marginBottom: 0, marginTop: 10 }}>
            Snaps are counted from plays where a coach recorded this player on the
            field, not from a participation feed. A player with 31 real snaps and 4
            tagged shows 4.
          </p>
        </Card>
      )}

      {can(viewer.role, "manage_roster") ? (
        <Card title="Add a player">
          <PlayerForm teamId={team.id} />
        </Card>
      ) : null}
    </>
  );
}
