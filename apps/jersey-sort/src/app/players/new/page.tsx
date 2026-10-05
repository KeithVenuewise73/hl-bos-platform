import { createPlayerAction } from "@/actions/library.ts";
import { Notice, param, type SearchParams } from "@/components/Notice.tsx";
import { PlayerForm } from "@/components/PlayerForm.tsx";
import { db } from "@/lib/db.ts";
import { listEvents } from "@/lib/repo/events.ts";
import { requireUser } from "@/lib/session.ts";

export const dynamic = "force-dynamic";

export default async function NewPlayerPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const latest = listEvents(db(), user.organizationId, 1)[0];
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="display mb-4 text-2xl">Add player</h1>
      <Notice error={param(sp, "error")} />
      <PlayerForm
        action={createPlayerAction}
        submit="Create player"
        defaults={
          latest
            ? {
                team: latest.team_name,
                season: latest.season_name,
                sport: latest.sport,
              }
            : {}
        }
      />
    </div>
  );
}
