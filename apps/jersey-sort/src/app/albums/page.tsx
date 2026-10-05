import Link from "next/link";

import { createAlbumAction } from "@/actions/library.ts";
import { Notice, param, type SearchParams } from "@/components/Notice.tsx";
import { db } from "@/lib/db.ts";
import { count } from "@/lib/format.ts";
import { listAlbums } from "@/lib/repo/albums.ts";
import { requireUser } from "@/lib/session.ts";

export const dynamic = "force-dynamic";

export default async function AlbumsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const albums = listAlbums(db(), user.organizationId);
  return (
    <div>
      <h1 className="display mb-4 text-2xl">Albums</h1>
      <Notice error={param(sp, "error")} notice={param(sp, "notice")} />
      <form
        action={createAlbumAction}
        className="card mb-5 flex flex-wrap items-end gap-2 p-4"
      >
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor="a-name">
            New album
          </label>
          <input
            className="input"
            id="a-name"
            name="name"
            required
            placeholder="Senior Night highlights"
          />
        </div>
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor="a-desc">
            Description (optional)
          </label>
          <input className="input" id="a-desc" name="description" />
        </div>
        <button className="btn-primary" type="submit">
          Create album
        </button>
      </form>
      <p className="mb-3 text-sm text-muted">
        Also see{" "}
        <Link className="underline" href="/photos?favorites=1">
          your Favorites
        </Link>{" "}
        and photos{" "}
        <Link className="underline" href="/dates">
          by date
        </Link>
        .
      </p>
      {albums.length === 0 ? (
        <p className="card p-6 text-sm text-muted">No albums yet.</p>
      ) : null}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {albums.map((a) => (
          <li key={a.id}>
            <Link
              href={`/albums/${a.id}`}
              className="card block overflow-hidden hover:border-muted"
            >
              <div className="aspect-video bg-panel-2">
                {a.cover ? (
                  <img
                    src={`/api/photos/${a.cover}/thumb`}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="p-3">
                <span className="block font-semibold">{a.name}</span>
                <span className="text-xs text-muted">{count(a.photos, "photo")}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
