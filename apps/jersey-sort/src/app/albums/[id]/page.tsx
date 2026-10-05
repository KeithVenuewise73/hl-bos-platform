import Link from "next/link";
import { notFound } from "next/navigation";

import { deleteAlbumAction } from "@/actions/library.ts";
import { Notice, param, type SearchParams } from "@/components/Notice.tsx";
import { Pager } from "@/components/Pager.tsx";
import { PhotoGrid } from "@/components/PhotoGrid.tsx";
import { db } from "@/lib/db.ts";
import { gallery } from "@/lib/gallery.ts";
import { getAlbum } from "@/lib/repo/albums.ts";
import { getSettings } from "@/lib/repo/settings.ts";
import { requireUser } from "@/lib/session.ts";

export const dynamic = "force-dynamic";

export default async function AlbumPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const { id } = await params;
  const d = db();
  const album = getAlbum(d, user.organizationId, id);
  if (album === undefined) notFound();
  const sp = await searchParams;
  const g = gallery(
    d,
    user.organizationId,
    user.userId,
    getSettings(d, user.organizationId).thresholds,
    { albumId: id },
    Number(param(sp, "page") ?? "1"),
  );
  return (
    <div>
      <Link className="text-sm text-muted hover:text-text" href="/albums">
        ← Albums
      </Link>
      <h1 className="display mb-1 mt-2 text-2xl">{album.name}</h1>
      {album.description ? (
        <p className="mb-3 text-sm text-muted">{album.description}</p>
      ) : null}
      <Notice notice={param(sp, "notice")} />
      <PhotoGrid
        tiles={g.tiles}
        players={g.players}
        albums={g.albums}
        emptyText="This album is empty. In any gallery, choose Select photos, pick some, then Add to album."
      />
      <Pager basePath={`/albums/${id}`} page={g.page} pages={g.pages} total={g.total} />
      <form action={deleteAlbumAction} className="mt-8">
        <input type="hidden" name="id" value={id} />
        <button className="btn-danger" type="submit">
          Delete album (photos are kept)
        </button>
      </form>
    </div>
  );
}
