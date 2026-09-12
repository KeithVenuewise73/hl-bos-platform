import { getViewer } from "@/lib/session";
import { can } from "@/lib/access";
import { listGames, listOpponents, listSeasons } from "@/lib/data";
import { PageHead, Notice, Card } from "@/components/ui";
import { NoTeam } from "@/components/no-team";
import { UploadForm } from "@/components/upload-form";
import { shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const viewer = await getViewer();
  if (viewer.team === null) return <NoTeam viewer={viewer} />;
  const team = viewer.team;

  if (!can(viewer.role, "upload_film")) {
    return (
      <>
        <PageHead title="Upload film" />
        <Notice tone="bad">
          Your role on {team.name} does not include uploading film. A coach or the
          organization admin can do this.
        </Notice>
      </>
    );
  }

  const [games, opponents, seasons] = await Promise.all([
    listGames(team.id),
    listOpponents(team.id),
    listSeasons(team.id),
  ]);
  const opponentName = new Map(opponents.map((o) => [o.id, o.name]));

  return (
    <>
      <PageHead title="Upload film" sub={team.name} />
      <Card>
        <UploadForm
          teamId={team.id}
          games={games.map((game) => ({
            id: game.id,
            label: `${
              game.opponent_id === null
                ? "Opponent not set"
                : (opponentName.get(game.opponent_id) ?? "Opponent not set")
            } · ${shortDate(game.kickoff_at)}`,
          }))}
          seasons={seasons.map((s) => ({ id: s.id, label: s.label }))}
        />
      </Card>
    </>
  );
}
