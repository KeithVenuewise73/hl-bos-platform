import Link from "next/link";

import { Notice, param, type SearchParams } from "@/components/Notice.tsx";
import { db } from "@/lib/db.ts";
import { count } from "@/lib/format.ts";
import { listPlayers } from "@/lib/repo/players.ts";
import { getSettings } from "@/lib/repo/settings.ts";
import { requireUser } from "@/lib/session.ts";

export const dynamic = "force-dynamic";

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const d = db();
  const sp = await searchParams;
  const players = listPlayers(
    d,
    user.organizationId,
    getSettings(d, user.organizationId).thresholds.medium,
  );
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="display text-2xl">Players</h1>
        <Link className="btn-primary" href="/players/new">
          + Add player
        </Link>
      </div>
      <Notice notice={param(sp, "notice")} />
      {players.length === 0 ? (
        <p className="card p-6 text-sm text-muted">
          No players yet. Players are optional: galleries work by jersey number alone.
          Add a player to show “#24 — Dominic Herman” instead of “#24”.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {players.map((p) => (
            <li key={p.id}>
              <Link
                href={`/players/${p.id}`}
                className="card flex items-center gap-3 p-3 hover:border-muted"
              >
                {p.profile_photo_id ? (
                  <img
                    src={`/api/photos/${p.profile_photo_id}/thumb`}
                    alt=""
                    className="h-14 w-14 rounded-full object-cover"
                  />
                ) : (
                  <span className="display grid h-14 w-14 place-items-center rounded-full bg-panel-2 text-xl text-brand">
                    {p.jersey_number !== null ? `#${p.jersey_number}` : "?"}
                  </span>
                )}
                <span>
                  <span className="block font-semibold">
                    {p.first_name} {p.last_name}
                  </span>
                  <span className="text-xs text-muted">
                    {p.jersey_number !== null ? `#${p.jersey_number} · ` : ""}
                    {p.team_name} · {p.season_name}
                  </span>
                  <span className="block text-xs">{count(p.photo_count, "photo")}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
