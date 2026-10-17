import { FolderCheck } from "@/components/FolderCheck.tsx";
import { db } from "@/lib/db.ts";
import { listEvents } from "@/lib/repo/events.ts";
import { requireUser } from "@/lib/session.ts";

export const dynamic = "force-dynamic";

/**
 * Check a folder, then turn its shooting dates into games.
 *
 * Checking is inspection only: the reading happens in the browser, on this
 * computer, and nothing is sent or created. A date becomes an event, and its
 * photos are COPIED in, only when the person presses "Create event & import"
 * on that date.
 */
export default async function CheckFolderPage() {
  const user = await requireUser();
  const events = listEvents(db(), user.organizationId);
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="display text-2xl">Check a folder</h1>
        <p className="mt-1 text-sm text-muted">
          Point JerseySort at a folder of game photos — straight off the camera card or
          wherever you keep them — and see what is there: how many photos, which are
          Canon RAW, when each was taken, and how they split into games by date. Then
          name each game and import it.
        </p>
      </div>
      <FolderCheck
        events={events.map((e) => ({
          id: e.id,
          name: e.name,
          event_date: e.event_date,
        }))}
        defaultSport={events[0]?.sport ?? "Football"}
      />
    </div>
  );
}
