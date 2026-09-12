import Link from "next/link";
import { getViewer } from "@/lib/session";
import { can, isStaffRole } from "@/lib/access";
import {
  listAssignmentItems,
  listAssignments,
  listClips,
  listPlayers,
  listPlaysById,
} from "@/lib/data";
import { playerLabel, shortDate, timecode } from "@/lib/format";
import { Badge, Card, Empty, PageHead } from "@/components/ui";
import { NoTeam } from "@/components/no-team";
import { AssignmentForm } from "@/components/assignment-form";
import { AthleteAssignment } from "@/components/athlete-assignment";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  review: "Review",
  correct: "Correction",
  study: "Study",
  great_rep: "Great rep",
  technique: "Technique",
  mental_error: "Mental error",
  opponent_tendency: "Opponent tendency",
};

/**
 * Film assignments, from both sides.
 *
 * A coach sees who has and has not watched. An athlete sees what they owe and
 * can mark it reviewed — and only they can: the database refuses
 * record_assignment_progress from anyone not linked to the player, so the
 * coach's view is evidence rather than a checklist a coach filled in.
 */
export default async function AssignmentsPage() {
  const viewer = await getViewer();
  if (viewer.team === null) return <NoTeam viewer={viewer} />;
  const team = viewer.team;
  const staff = isStaffRole(viewer.role);

  const assignments = await listAssignments(team.id);
  const [items, players, clips] = await Promise.all([
    listAssignmentItems(assignments.map((a) => a.id)),
    staff ? listPlayers(team.id) : Promise.resolve([]),
    staff ? listClips(team.id) : Promise.resolve([]),
  ]);
  const plays = await listPlaysById(
    items.map((i) => i.play_id).filter((id): id is string => id !== null),
  );
  const playById = new Map(plays.map((p) => [p.id, p]));
  const clipById = new Map(clips.map((c) => [c.id, c]));
  const playerById = new Map(players.map((p) => [p.id, p]));
  const itemsByAssignment = new Map<string, typeof items>();
  for (const item of items) {
    const list = itemsByAssignment.get(item.assignment_id) ?? [];
    list.push(item);
    itemsByAssignment.set(item.assignment_id, list);
  }

  const mine = assignments.filter((a) => viewer.playerIds.includes(a.player_id));

  return (
    <>
      <PageHead
        title={staff ? "Film assignments" : "Film to review"}
        sub={staff ? team.name : "Assigned to you by your coaches"}
      />

      {!staff ? (
        mine.length === 0 ? (
          <Empty
            title="Nothing assigned"
            reason="Your coaches have not assigned you film yet. When they do it appears here, with what they want you to look at."
          />
        ) : (
          <div className="stack">
            {mine.map((assignment) => (
              <AthleteAssignment
                key={assignment.id}
                assignment={{
                  id: assignment.id,
                  kind:
                    KIND_LABEL[assignment.assignment_kind] ??
                    assignment.assignment_kind,
                  message: assignment.message,
                  status: assignment.status,
                  dueOn: assignment.due_on,
                }}
                items={(itemsByAssignment.get(assignment.id) ?? []).map((item) => {
                  const play =
                    item.play_id === null ? undefined : playById.get(item.play_id);
                  return {
                    id: item.id,
                    label:
                      play === undefined
                        ? "Clip"
                        : `Play ${play.play_number} · ${timecode(play.start_seconds)}`,
                    href: play === undefined ? null : `/film/${play.film_asset_id}`,
                  };
                })}
              />
            ))}
          </div>
        )
      ) : assignments.length === 0 ? (
        <Empty
          title="No film assigned yet"
          reason="Nobody on this staff has assigned an athlete film to review. Assign from the film room, or below."
        />
      ) : (
        <Card
          title="Assigned"
          sub="Review status comes from the athlete, not from a coach"
        >
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Kind</th>
                  <th>Message</th>
                  <th>Clips</th>
                  <th>Due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((assignment) => {
                  const player = playerById.get(assignment.player_id);
                  const list = itemsByAssignment.get(assignment.id) ?? [];
                  return (
                    <tr key={assignment.id}>
                      <td style={{ fontWeight: 600 }}>
                        {player === undefined ? (
                          "Player"
                        ) : (
                          <Link href={`/players/${player.id}`}>
                            {playerLabel(player)}
                          </Link>
                        )}
                      </td>
                      <td className="dim">
                        {KIND_LABEL[assignment.assignment_kind] ??
                          assignment.assignment_kind}
                      </td>
                      <td className="dim small">
                        {assignment.message ?? (
                          <span className="faint">no message</span>
                        )}
                      </td>
                      <td>
                        {list.length === 0 ? (
                          <span className="faint tiny">nothing attached</span>
                        ) : (
                          <div className="row" style={{ gap: 4 }}>
                            {list.map((item) => {
                              const play =
                                item.play_id === null
                                  ? undefined
                                  : playById.get(item.play_id);
                              const clip =
                                item.clip_id === null
                                  ? undefined
                                  : clipById.get(item.clip_id);
                              const href =
                                play !== undefined
                                  ? `/film/${play.film_asset_id}`
                                  : clip !== undefined
                                    ? `/film/${clip.film_asset_id}`
                                    : null;
                              const label =
                                play !== undefined
                                  ? `Play ${play.play_number}`
                                  : (clip?.title ?? "clip");
                              return href === null ? (
                                <span key={item.id} className="badge">
                                  {label}
                                </span>
                              ) : (
                                <Link key={item.id} href={href} className="badge">
                                  {label}
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td className="dim nowrap">
                        {assignment.due_on === null ? (
                          <span className="faint">no date</span>
                        ) : (
                          shortDate(assignment.due_on)
                        )}
                      </td>
                      <td>
                        <Badge
                          tone={
                            assignment.status === "completed"
                              ? "good"
                              : assignment.status === "assigned"
                                ? "warn"
                                : "neutral"
                          }
                        >
                          {assignment.status}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="tiny faint" style={{ marginTop: 10, marginBottom: 0 }}>
            &ldquo;Completed&rdquo; means the athlete recorded it themselves. No coach
            can set it on their behalf &mdash; the database refuses the call.
          </p>
        </Card>
      )}

      {can(viewer.role, "assign_film") && players.length > 0 ? (
        <Card title="Assign film">
          <AssignmentForm
            players={players
              .filter((p) => p.active)
              .map((p) => ({ id: p.id, label: playerLabel(p) }))}
            clips={clips.map((c) => ({ id: c.id, label: c.title }))}
          />
        </Card>
      ) : null}
    </>
  );
}
