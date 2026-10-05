import Link from "next/link";

import { Notice, param, type SearchParams } from "@/components/Notice.tsx";
import { Pager } from "@/components/Pager.tsx";
import { PhotoGrid } from "@/components/PhotoGrid.tsx";
import { db } from "@/lib/db.ts";
import { longDate } from "@/lib/format.ts";
import { gallery } from "@/lib/gallery.ts";
import { members, teamsAndSports } from "@/lib/repo/dashboard.ts";
import { listEvents } from "@/lib/repo/events.ts";
import type { PhotoFilters } from "@/lib/repo/photos.ts";
import { listPlayers } from "@/lib/repo/players.ts";
import { getSettings } from "@/lib/repo/settings.ts";
import { requireUser } from "@/lib/session.ts";

export const dynamic = "force-dynamic";

const KEYS = [
  "q",
  "event",
  "team",
  "sport",
  "number",
  "player",
  "confidence",
  "review",
  "favorites",
  "uploadedBy",
  "day",
  "status",
] as const;

export default async function PhotosPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const d = db();
  const org = user.organizationId;
  const sp = await searchParams;
  const t = getSettings(d, org).thresholds;
  const v = Object.fromEntries(KEYS.map((k) => [k, param(sp, k)])) as Record<
    (typeof KEYS)[number],
    string | undefined
  >;
  const filters: PhotoFilters = {
    q: v.q,
    eventId: v.event,
    teamId: v.team,
    sport: v.sport,
    number: v.number?.replace(/^#/, ""),
    playerId: v.player,
    confidence: v.confidence,
    review: v.review,
    favoritesOnly: v.favorites === "1",
    uploadedBy: v.uploadedBy,
    day: v.day,
    status: v.status,
  };
  const page = Number(param(sp, "page") ?? "1");
  const g = gallery(d, org, user.userId, t, filters, page);
  const events = listEvents(d, org);
  const { teams, sports } = teamsAndSports(d, org);
  const players = listPlayers(d, org, t.medium);
  const people = members(d, org);
  const query = new URLSearchParams(
    Object.entries(v).filter((e): e is [string, string] => e[1] !== undefined),
  ).toString();
  const active = Object.values(v).some((x) => x !== undefined);

  return (
    <div>
      <h1 className="display mb-1 text-2xl">
        {v.q ? `Search: “${v.q}”` : v.day ? longDate(v.day) : "Photos"}
      </h1>
      {v.q ? (
        <p className="mb-3 text-sm text-muted">
          Matches jersey numbers, player names, dates (“October 3”), teams, opponents,
          sports and filenames. Every word must match.
        </p>
      ) : null}
      <Notice error={param(sp, "error")} notice={param(sp, "notice")} />
      <details className="card mb-4 p-3" open={active}>
        <summary className="cursor-pointer text-sm font-semibold">
          Filters{active ? " (on)" : ""}
        </summary>
        <form
          className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
          action="/photos"
        >
          <div className="col-span-2 sm:col-span-3 lg:col-span-2">
            <label className="label" htmlFor="f-q">
              Search
            </label>
            <input
              className="input"
              id="f-q"
              name="q"
              defaultValue={v.q}
              placeholder="24, Dominic Herman, October 3"
            />
          </div>
          <Select
            id="event"
            label="Event"
            value={v.event}
            options={events.map((e) => [e.id, `${e.name} (${e.event_date})`])}
          />
          <Select
            id="team"
            label="Team"
            value={v.team}
            options={teams.map((x) => [x.id, x.name])}
          />
          <Select
            id="sport"
            label="Sport"
            value={v.sport}
            options={sports.map((s) => [s, s])}
          />
          <div>
            <label className="label" htmlFor="f-number">
              Jersey #
            </label>
            <input
              className="input"
              id="f-number"
              name="number"
              inputMode="numeric"
              defaultValue={v.number}
            />
          </div>
          <Select
            id="player"
            label="Player"
            value={v.player}
            options={players.map((p) => [p.id, `${p.first_name} ${p.last_name}`])}
          />
          <Select
            id="confidence"
            label="Confidence"
            value={v.confidence}
            options={[
              ["high", "High (auto-filed)"],
              ["medium", "Medium (needs review)"],
              ["low", "Low"],
              ["unidentified", "Unidentified"],
              ["nojersey", "No jersey visible"],
            ]}
          />
          <Select
            id="review"
            label="Reviewed"
            value={v.review}
            options={[
              ["reviewed", "Reviewed"],
              ["unreviewed", "Not reviewed"],
            ]}
          />
          <Select
            id="status"
            label="Status"
            value={v.status}
            options={[
              ["queued", "Queued"],
              ["processing", "Analyzing"],
              ["completed", "Sorted"],
              ["needs_review", "Needs review"],
              ["failed", "Failed"],
            ]}
          />
          <Select
            id="favorites"
            label="Favorites"
            value={v.favorites}
            options={[["1", "Favorites only"]]}
          />
          <Select
            id="uploadedBy"
            label="Uploaded by"
            value={v.uploadedBy}
            options={people.map((p) => [p.id, p.display_name])}
          />
          <div>
            <label className="label" htmlFor="f-day">
              Date
            </label>
            <input
              className="input"
              id="f-day"
              name="day"
              type="date"
              defaultValue={v.day}
            />
          </div>
          <div className="col-span-2 flex items-end gap-2 sm:col-span-3 lg:col-span-6">
            <button className="btn-primary" type="submit">
              Apply
            </button>
            <Link className="btn-ghost" href="/photos">
              Clear
            </Link>
          </div>
        </form>
      </details>
      <PhotoGrid
        tiles={g.tiles}
        players={g.players}
        albums={g.albums}
        emptyText={
          active
            ? "No photos match."
            : "No photos yet. Create an event and upload some."
        }
      />
      <Pager
        basePath={`/photos${query ? `?${query}` : ""}`}
        page={g.page}
        pages={g.pages}
        total={g.total}
      />
    </div>
  );
}

function Select({
  id,
  label,
  value,
  options,
}: {
  id: string;
  label: string;
  value: string | undefined;
  options: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <div>
      <label className="label" htmlFor={`f-${id}`}>
        {label}
      </label>
      <select className="input" id={`f-${id}`} name={id} defaultValue={value ?? ""}>
        <option value="">Any</option>
        {options.map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}
