import Link from "next/link";
import { notFound } from "next/navigation";

import {
  addPlayerNumberAction,
  deletePlayerAction,
  removePlayerNumberAction,
  updatePlayerAction,
} from "@/actions/library.ts";
import { Notice, param, type SearchParams } from "@/components/Notice.tsx";
import { Pager } from "@/components/Pager.tsx";
import { PhotoGrid } from "@/components/PhotoGrid.tsx";
import { PlayerForm } from "@/components/PlayerForm.tsx";
import { Tabs } from "@/components/Tabs.tsx";
import { db } from "@/lib/db.ts";
import { count, longDate } from "@/lib/format.ts";
import { gallery } from "@/lib/gallery.ts";
import { getPlayer, playerEvents, playerNumbers } from "@/lib/repo/players.ts";
import { getSettings } from "@/lib/repo/settings.ts";
import { requireUser } from "@/lib/session.ts";

export const dynamic = "force-dynamic";

export default async function PlayerPage({
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
  const player = getPlayer(d, org, id);
  if (player === undefined) notFound();
  const sp = await searchParams;
  const t = getSettings(d, org).thresholds;
  const tab = param(sp, "tab") ?? "all";
  const page = Number(param(sp, "page") ?? "1");
  const numbers = playerNumbers(d, org, id);
  const events = playerEvents(d, org, id, t.medium);
  const all = gallery(
    d,
    org,
    user.userId,
    t,
    { playerId: id },
    tab === "all" ? page : 1,
  );
  const favs =
    tab === "favorites"
      ? gallery(d, org, user.userId, t, { playerId: id, favoritesOnly: true }, page)
      : null;
  const g = favs ?? all;
  const name = `${player.first_name} ${player.last_name}`;
  const base = `/players/${id}`;

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-center gap-4">
        {player.profile_photo_id ? (
          <img
            src={`/api/photos/${player.profile_photo_id}/thumb`}
            alt=""
            className="h-24 w-24 rounded-full object-cover ring-2 ring-brand"
          />
        ) : (
          <span className="display grid h-24 w-24 place-items-center rounded-full bg-panel-2 text-3xl text-brand">
            {player.jersey_number !== null ? `#${player.jersey_number}` : "?"}
          </span>
        )}
        <div>
          <h1 className="display text-3xl leading-none sm:text-4xl">{name}</h1>
          <p className="mt-1 text-lg">
            {player.jersey_number !== null ? (
              <span className="display text-brand">#{player.jersey_number} </span>
            ) : null}
            {[
              player.position,
              player.graduation_year ? `Class of ${player.graduation_year}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="text-sm text-muted">
            {[player.sport, player.team_name, `${player.season_name} season`]
              .filter(Boolean)
              .join(" · ")}{" "}
            · {count(all.total, "photo")}
          </p>
        </div>
        <Link className="btn-ghost ml-auto" href={`${base}?edit=1`}>
          Edit
        </Link>
      </header>
      <Notice error={param(sp, "error")} notice={param(sp, "notice")} />

      {param(sp, "edit") === "1" ? (
        <div className="mb-6 space-y-4">
          <PlayerForm action={updatePlayerAction} player={player} submit="Save" />
          <section className="card p-4">
            <h2 className="mb-2 font-semibold">Numbers by team and season</h2>
            <ul className="mb-3 space-y-1 text-sm">
              {numbers.map((n) => (
                <li key={n.id} className="flex items-center gap-2">
                  <span className="display text-lg text-brand">#{n.jersey_number}</span>{" "}
                  {n.team_name} · {n.season_name}
                  <form action={removePlayerNumberAction}>
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="numberId" value={n.id} />
                    <button className="text-xs text-low underline" type="submit">
                      remove
                    </button>
                  </form>
                </li>
              ))}
            </ul>
            <form
              action={addPlayerNumberAction}
              className="flex flex-wrap items-end gap-2"
            >
              <input type="hidden" name="id" value={id} />
              <div>
                <label className="label" htmlFor="n-number">
                  #
                </label>
                <input className="input w-16" id="n-number" name="number" required />
              </div>
              <div>
                <label className="label" htmlFor="n-team">
                  Team
                </label>
                <input
                  className="input"
                  id="n-team"
                  name="team"
                  defaultValue={player.team_name}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="n-season">
                  Season
                </label>
                <input className="input w-24" id="n-season" name="season" required />
              </div>
              <button className="btn-ghost" type="submit">
                Add number for another season
              </button>
            </form>
          </section>
          <form action={deletePlayerAction} className="card p-4">
            <input type="hidden" name="id" value={id} />
            <button className="btn-danger" type="submit">
              Delete player (photos are kept)
            </button>
          </form>
        </div>
      ) : null}

      {events.length > 0 ? (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            Events
          </h2>
          <ul className="flex flex-wrap gap-2">
            {events.map((e) => (
              <li key={e.id}>
                <Link
                  className="card block px-3 py-2 text-sm hover:border-muted"
                  href={`/events/${e.id}`}
                >
                  {e.name}{" "}
                  <span className="text-muted">
                    · {longDate(e.event_date)} · {e.photos}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Tabs
        active={tab}
        tabs={[
          { key: "all", label: "Gallery", href: `${base}?tab=all`, count: all.total },
          { key: "favorites", label: "Favorites", href: `${base}?tab=favorites` },
        ]}
      />
      <PhotoGrid
        tiles={g.tiles}
        players={g.players}
        albums={g.albums}
        emptyText={
          tab === "favorites"
            ? "No favorites of this player yet."
            : `No photos yet. Photos appear here when #${player.jersey_number ?? "?"} is detected or confirmed at a ${player.team_name} event in the ${player.season_name} season, or when you tag them with this player.`
        }
      />
      <Pager
        basePath={`${base}?tab=${tab}`}
        page={g.page}
        pages={g.pages}
        total={g.total}
      />
    </div>
  );
}
