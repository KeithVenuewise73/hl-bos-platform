import Link from "next/link";
import { notFound } from "next/navigation";

import { reanalyzeAction, retryFailedAction } from "@/actions/events.ts";
import { Notice, param, type SearchParams } from "@/components/Notice.tsx";
import { NumberCards } from "@/components/NumberCards.tsx";
import { Pager } from "@/components/Pager.tsx";
import { PhotoGrid } from "@/components/PhotoGrid.tsx";
import { ProgressPanel } from "@/components/Progress.tsx";
import { Tabs } from "@/components/Tabs.tsx";
import { Uploader } from "@/components/Uploader.tsx";
import { db } from "@/lib/db.ts";
import { count, longDate } from "@/lib/format.ts";
import { gallery } from "@/lib/gallery.ts";
import { progress } from "@/lib/repo/dashboard.ts";
import { eventStats, getEvent, numberGroups } from "@/lib/repo/events.ts";
import type { PhotoFilters } from "@/lib/repo/photos.ts";
import { getSettings } from "@/lib/repo/settings.ts";
import { requireUser } from "@/lib/session.ts";

export const dynamic = "force-dynamic";

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const { id } = await params;
  const d = db();
  const org = user.organizationId;
  const event = getEvent(d, org, id);
  if (event === undefined) notFound();
  const sp = await searchParams;
  const tab = param(sp, "tab") ?? "all";
  const number = param(sp, "number");
  const page = Number(param(sp, "page") ?? "1");
  const t = getSettings(d, org).thresholds;
  const stats = eventStats(d, org, id, t.medium, user.userId);
  const groups = numberGroups(d, org, id, t.medium);
  const names = Object.fromEntries(
    groups
      .filter((g) => g.player_name !== null)
      .map((g) => [g.value, `#${g.value} — ${g.player_name}`]),
  );
  const p = progress(d, org, id);
  const base = `/events/${id}`;

  const filters: PhotoFilters | null =
    tab === "all"
      ? { eventId: id }
      : tab === "favorites"
        ? { eventId: id, favoritesOnly: true }
        : tab === "unidentified"
          ? { eventId: id, confidence: "unidentified" }
          : tab === "numbers" && number !== undefined
            ? { eventId: id, number }
            : null;
  const g =
    filters === null ? null : gallery(d, org, user.userId, t, filters, page, names);
  const here = `${base}?tab=${tab}${number ? `&number=${encodeURIComponent(number)}` : ""}`;

  return (
    <div>
      <header className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-2">
          {event.sport} · {event.team_name} · {event.season_name} season
        </p>
        <h1 className="display mt-1 text-3xl leading-none sm:text-4xl">{event.name}</h1>
        <p className="mt-2 text-muted">
          {longDate(event.event_date)}
          {event.location ? ` · ${event.location}` : ""}
          {event.opponent ? ` · vs ${event.opponent}` : ""}
        </p>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
          <span>{count(stats.photos, "photo")}</span>
          <span>{count(stats.numbers, "jersey number")} detected</span>
          <span>{count(stats.namedPlayers, "named player")}</span>
          {stats.needsReview > 0 ? (
            <Link className="text-medium underline" href={`/review?event=${id}`}>
              {count(stats.needsReview, "photo")} need review →
            </Link>
          ) : null}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link className="btn-ghost" href={`${base}/edit`}>
            Edit event
          </Link>
          {stats.photos > 0 ? (
            <form action={reanalyzeAction}>
              <input type="hidden" name="eventId" value={id} />
              <input type="hidden" name="returnTo" value={base} />
              <button className="btn-ghost" type="submit">
                Re-analyze all
              </button>
            </form>
          ) : null}
        </div>
      </header>

      <Notice error={param(sp, "error")} notice={param(sp, "notice")} />
      <Uploader eventId={id} />
      <ProgressPanel eventId={id} initial={p} />
      {p.failed > 0 ? (
        <form
          action={retryFailedAction}
          className="card mb-5 flex flex-wrap items-center justify-between gap-2 border-low/40 p-3"
        >
          <input type="hidden" name="eventId" value={id} />
          <input type="hidden" name="returnTo" value={base} />
          <span className="text-sm">
            {count(p.failed, "photo")} could not be analyzed. Open one to see why.
          </span>
          <button className="btn-danger" type="submit">
            Retry failed
          </button>
        </form>
      ) : null}

      <Tabs
        active={tab}
        tabs={[
          {
            key: "all",
            label: "All photos",
            href: `${base}?tab=all`,
            count: stats.photos,
          },
          {
            key: "numbers",
            label: "Jersey numbers",
            href: `${base}?tab=numbers`,
            count: groups.length,
          },
          {
            key: "players",
            label: "Players",
            href: `${base}?tab=players`,
            count: stats.namedPlayers,
          },
          {
            key: "favorites",
            label: "Favorites",
            href: `${base}?tab=favorites`,
            count: stats.favorites,
          },
          {
            key: "unidentified",
            label: "Unidentified",
            href: `${base}?tab=unidentified`,
            count: stats.unidentified,
          },
        ]}
      />

      {tab === "numbers" && number === undefined ? (
        groups.length === 0 && stats.unidentified === 0 ? (
          <p className="card p-6 text-sm text-muted">
            No jersey numbers yet. Upload photos; numbers appear here as analysis
            finishes.
          </p>
        ) : (
          <NumberCards
            groups={groups}
            hrefFor={(v) => `${base}?tab=numbers&number=${v}`}
            unidentified={stats.unidentified}
            unidentifiedHref={`${base}?tab=unidentified`}
          />
        )
      ) : null}

      {tab === "players" ? (
        groups.some((x) => x.player_id !== null) ? (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {groups
              .filter((x) => x.player_id !== null)
              .map((x) => (
                <li key={x.value}>
                  <Link
                    href={`/players/${x.player_id}`}
                    className="card flex items-center gap-3 p-3 hover:border-muted"
                  >
                    <span className="display text-2xl text-brand">#{x.value}</span>
                    <span>
                      <span className="block font-semibold">{x.player_name}</span>
                      <span className="text-xs text-muted">
                        {count(x.photo_count, "photo")} at this event
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        ) : (
          <p className="card p-6 text-sm text-muted">
            No named players at this event yet.{" "}
            <Link className="text-brand-2 underline" href="/players/new">
              Create a player
            </Link>{" "}
            with a jersey number for {event.team_name}, {event.season_name}, and their
            photos from this event appear here.
          </p>
        )
      ) : null}

      {g !== null ? (
        <>
          {tab === "numbers" && number !== undefined ? (
            <div className="mb-3 flex items-baseline gap-3">
              <Link
                className="text-sm text-muted hover:text-text"
                href={`${base}?tab=numbers`}
              >
                ← All numbers
              </Link>
              <h2 className="display text-2xl">{names[number] ?? `#${number}`}</h2>
            </div>
          ) : null}
          <PhotoGrid
            tiles={g.tiles}
            players={g.players}
            albums={g.albums}
            emptyText={
              tab === "favorites"
                ? "No favorites at this event yet. Open a photo and press ★."
                : tab === "unidentified"
                  ? "Nothing unidentified."
                  : "No photos yet. Drop some above."
            }
          />
          <Pager basePath={here} page={g.page} pages={g.pages} total={g.total} />
        </>
      ) : null}
    </div>
  );
}
