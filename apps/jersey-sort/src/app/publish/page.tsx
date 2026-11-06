import Link from "next/link";

import { publishFolderAction } from "@/actions/publish-folder.ts";
import { EventForm } from "@/components/EventForm.tsx";
import { Notice, param, type SearchParams } from "@/components/Notice.tsx";
import { db } from "@/lib/db.ts";
import { eventForFolder } from "@/lib/folder-event.ts";
import {
  ImportError,
  readImportFolder,
  type FolderContents,
} from "@/lib/folder-import.ts";
import { count } from "@/lib/format.ts";
import { providerStatus } from "@/lib/providers.ts";
import { getEvent, listEvents, type EventRow } from "@/lib/repo/events.ts";
import { listGalleries } from "@/lib/repo/galleries.ts";
import { getSettings } from "@/lib/repo/settings.ts";
import { requireUser } from "@/lib/session.ts";

export const dynamic = "force-dynamic";

/**
 * "Publish to 5 Star", handed over from DateSort:
 * /publish?folder=…&date=…&sport=…&name=…
 *
 * Choose the team gallery, check the game's details, press Publish. Nothing
 * happens until then, and nothing in the folder is ever changed.
 */
export default async function PublishPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const get = (k: string) => param(sp, k) ?? "";
  const back = `/publish?${new URLSearchParams(
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
  const existingId =
    contents !== null
      ? await eventForFolder(db(), user.organizationId, contents)
      : null;
  const existing =
    existingId !== null ? getEvent(db(), user.organizationId, existingId) : undefined;
  const galleries = listGalleries(db(), user.organizationId).filter(
    (g) => g.active === 1,
  );
  const reader = providerStatus(getSettings(db(), user.organizationId).provider);
  const lastTeam = listEvents(db(), user.organizationId, 1)[0]?.team_name ?? "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(get("date")) ? get("date") : "";
  const start: EventRow = {
    id: "",
    name: get("name") || `${get("sport") || "Game"} ${date}`.trim(),
    sport: get("sport") || "Football",
    team_id: "",
    // No game yet to carry the team over from: the first team gallery's name.
    team_name: lastTeam || (galleries[0]?.name ?? ""),
    season_id: "",
    season_name: date.slice(0, 4),
    opponent: null,
    event_date: date,
    location: null,
    notes: null,
    created_at: "",
  };
  const n = contents?.photos.length ?? 0;
  const submit = `Publish to 5 Star (${count(n, "photo")})`;
  const jerseySwitch = (
    <label
      className="flex items-start gap-2 text-sm sm:col-span-2"
      data-testid="publish-jerseys-switch"
    >
      <input
        type="checkbox"
        name="jerseys"
        value="1"
        className="mt-1"
        data-testid="publish-jerseys"
      />
      <span>
        <span className="font-semibold text-text">Also find jersey numbers</span>
        <span className="block text-muted" data-testid="publish-reader">
          Off: the photos are published without reading them, which costs nothing. On:
          every photo is read by {reader.label}
          {reader.choice === "claude"
            ? " (each photo is sent to Anthropic as a 1600 px preview, which costs a little per photo)"
            : ""}
          , as they come in. Publishing does not wait for the numbers. You can do it
          later from the game&apos;s page.
        </span>
      </span>
    </label>
  );
  const picker = (
    <fieldset className="sm:col-span-2" data-testid="publish-galleries">
      <legend className="label">Team gallery</legend>
      <div className="space-y-1">
        {galleries.map((g, i) => (
          <label key={g.id} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="gallery"
              value={g.id}
              required
              defaultChecked={i === 0}
              data-testid="publish-gallery"
            />
            <span>
              {g.group_name ? `${g.group_name} · ${g.name}` : g.name}{" "}
              <span className="text-muted">({count(g.events, "game")})</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="display text-2xl">Publish to 5 Star</h1>
        <p className="mt-1 text-sm text-muted">
          From DateSort. Choose the team gallery, check the game, and publish it to
          5starsportsmedia.com.
        </p>
      </div>
      <Notice error={param(sp, "error") ?? problem ?? undefined} />
      {contents !== null ? (
        <section className="card space-y-2 p-5 text-sm" data-testid="publish-summary">
          <p>
            <strong className="text-text">{count(n, "photo")}</strong> from{" "}
            <span className="font-mono">{contents.folder}</span>.
          </p>
          {existing !== undefined ? (
            <p data-testid="publish-existing">
              This game is already in JerseySort as{" "}
              <strong className="text-text">{existing.name}</strong>: it is used as it
              is, and only photos not yet in it are brought in.
            </p>
          ) : null}
          {contents.raw > 0 ? (
            <p className="text-muted">
              {count(contents.raw, "Canon RAW file")} left out: the same shots as the
              JPGs.
            </p>
          ) : null}
          <p className="text-muted">
            Online, families see web-size copies behind the team password; the
            game&apos;s public page shows only a cover photo if you pick one. The folder
            itself is not changed in any way.
          </p>
        </section>
      ) : null}
      {contents !== null && n > 0 && galleries.length === 0 ? (
        <section className="card p-5 text-sm" data-testid="publish-no-gallery">
          <p>
            There is no team gallery to publish into yet.{" "}
            <Link className="underline" href="/galleries">
              Create the team gallery
            </Link>{" "}
            (its name and team password), then press <em>Publish to 5 Star</em> in
            DateSort again.
          </p>
        </section>
      ) : null}
      {contents !== null && n > 0 && galleries.length > 0 ? (
        existing !== undefined ? (
          <form action={publishFolderAction} className="card grid gap-4 p-5">
            <input type="hidden" name="folder" value={contents.folder} />
            <input type="hidden" name="back" value={back} />
            {picker}
            {jerseySwitch}
            <div>
              <button className="btn-primary" type="submit">
                {submit}
              </button>
            </div>
          </form>
        ) : (
          <EventForm
            action={publishFolderAction}
            event={start}
            submit={submit}
            hidden={{ folder: contents.folder, back }}
          >
            {picker}
            {jerseySwitch}
          </EventForm>
        )
      ) : null}
    </div>
  );
}
