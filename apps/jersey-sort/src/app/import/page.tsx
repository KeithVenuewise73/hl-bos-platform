import { importFolderAction } from "@/actions/import.ts";
import { EventForm } from "@/components/EventForm.tsx";
import { Notice, param, type SearchParams } from "@/components/Notice.tsx";
import { db } from "@/lib/db.ts";
import {
  ImportError,
  readImportFolder,
  type FolderContents,
} from "@/lib/folder-import.ts";
import { providerStatus } from "@/lib/providers.ts";
import { listEvents, type EventRow } from "@/lib/repo/events.ts";
import { getSettings } from "@/lib/repo/settings.ts";
import { requireUser } from "@/lib/session.ts";

export const dynamic = "force-dynamic";

/**
 * A game handed over from DateSort: /import?folder=…&date=…&sport=…&name=…
 * Shows what is in the folder and who will read the numbers, with the event
 * details filled in. Nothing happens until "Create event" is pressed, and
 * nothing in the folder is ever changed.
 */
export default async function ImportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const get = (k: string) => param(sp, k) ?? "";
  const back = `/import?${new URLSearchParams(
    Object.fromEntries(["folder", "date", "sport", "name"].map((k) => [k, get(k)])),
  ).toString()}`;
  const user = await requireUser(back);

  let contents: FolderContents | null = null;
  let problem: string | null = null;
  try {
    contents = await readImportFolder(get("folder"));
  } catch (e) {
    problem = e instanceof ImportError ? e.message : "The folder could not be read.";
  }
  const reader = providerStatus(getSettings(db(), user.organizationId).provider);
  const lastTeam = listEvents(db(), user.organizationId, 1)[0]?.team_name ?? "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(get("date")) ? get("date") : "";
  const start: EventRow = {
    id: "",
    name: get("name") || `${get("sport") || "Game"} ${date}`.trim(),
    sport: get("sport") || "Football",
    team_id: "",
    team_name: lastTeam,
    season_id: "",
    season_name: date.slice(0, 4),
    opponent: null,
    event_date: date,
    location: null,
    notes: null,
    created_at: "",
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="display text-2xl">Find jersey numbers in a game</h1>
        <p className="mt-1 text-sm text-muted">
          From DateSort. Check the details, then create the event.
        </p>
      </div>
      <Notice error={param(sp, "error") ?? problem ?? undefined} />
      {contents !== null ? (
        <section className="card space-y-2 p-5 text-sm" data-testid="import-summary">
          <p>
            <strong className="text-text">
              {contents.photos.length.toLocaleString()} photos
            </strong>{" "}
            will be brought in from <span className="font-mono">{contents.folder}</span>
            .
          </p>
          {contents.raw > 0 ? (
            <p className="text-muted">
              {contents.raw.toLocaleString()} Canon RAW files are left out: they are the
              same shots as the JPGs, and reading both would read every number twice.
            </p>
          ) : null}
          <p className="text-muted">The folder itself is not changed in any way.</p>
          <p data-testid="import-reader">
            Jersey numbers will be read by{" "}
            <strong className="text-text">{reader.label}</strong>.{" "}
            {reader.choice === "claude"
              ? "Each photo is sent to Anthropic as a 1600 px preview."
              : ""}
            {!reader.ready ? <span className="text-bad"> {reader.detail}</span> : null}
          </p>
        </section>
      ) : null}
      {contents !== null && contents.photos.length > 0 ? (
        <EventForm
          action={importFolderAction}
          event={start}
          submit={`Create event and find jersey numbers (${contents.photos.length.toLocaleString()} photos)`}
          hidden={{ folder: contents.folder, back }}
        />
      ) : null}
    </div>
  );
}
