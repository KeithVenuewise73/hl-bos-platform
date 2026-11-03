import Link from "next/link";

import { unlockGalleryAction } from "@/actions/galleries.ts";
import { GalleryHeader } from "@/components/GalleryHeader.tsx";
import { Notice, param, type SearchParams } from "@/components/Notice.tsx";
import { db } from "@/lib/db.ts";
import { count, longDate } from "@/lib/format.ts";
import { galleryEvents, galleryForLink } from "@/lib/repo/galleries.ts";
import { visitor } from "@/lib/visitor.ts";

export const dynamic = "force-dynamic";

export const metadata = { robots: { index: false, follow: false } };

export default async function TeamGallery({
  params,
  searchParams,
}: {
  params: Promise<{ link: string }>;
  searchParams: SearchParams;
}) {
  const { link } = await params;
  const sp = await searchParams;
  const gallery = await visitor(link);

  if (gallery === undefined) {
    const behind = galleryForLink(db(), link);
    if (behind === undefined) {
      return (
        <div
          className="mx-auto max-w-md pt-16 text-center"
          data-testid="gallery-closed"
        >
          <h1 className="display mb-2 text-2xl">
            This gallery link isn&apos;t working
          </h1>
          <p className="text-sm text-muted">
            It may have been switched off or replaced with a new link. Ask your coach or
            photographer for the current one.
          </p>
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-md pt-10">
        <GalleryHeader gallery={behind} />
        <Notice error={param(sp, "error")} />
        <form action={unlockGalleryAction} className="card grid gap-3 p-5">
          <input type="hidden" name="link" value={link} />
          <label className="label" htmlFor="v-pass">
            Team password
          </label>
          <input
            className="input"
            id="v-pass"
            name="password"
            type="password"
            required
            autoFocus
            autoComplete="current-password"
          />
          <button className="btn-primary" type="submit">
            Open gallery
          </button>
          <p className="text-xs text-muted">
            Your coach or photographer has the team password.
          </p>
        </form>
      </div>
    );
  }

  const events = galleryEvents(db(), gallery);
  return (
    <div>
      <GalleryHeader gallery={gallery} />
      {events.length === 0 ? (
        <p className="card p-6 text-sm text-muted">
          No games here yet. Check back after the next game.
        </p>
      ) : null}
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {events.map((e) => (
          <li key={e.id}>
            <Link
              href={`/g/${link}/e/${e.id}`}
              className="card block overflow-hidden hover:border-muted"
              data-testid="gallery-game"
            >
              <div className="aspect-video bg-panel-2">
                {e.cover ? (
                  <img
                    src={`/g/${link}/p/${e.cover}/thumb`}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="p-3">
                <span className="block font-semibold">{e.name}</span>
                <span className="text-xs text-muted">
                  {longDate(e.event_date)} · {count(e.photos, "photo")}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
