import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { GalleryHeader } from "@/components/GalleryHeader.tsx";
import { db } from "@/lib/db.ts";
import { count, longDate } from "@/lib/format.ts";
import { galleryEvent, galleryPhotos } from "@/lib/repo/galleries.ts";
import { visitor } from "@/lib/visitor.ts";

export const dynamic = "force-dynamic";

export const metadata = { robots: { index: false, follow: false } };

export default async function TeamGalleryGame({
  params,
}: {
  params: Promise<{ link: string; eventId: string }>;
}) {
  const { link, eventId } = await params;
  const gallery = await visitor(link);
  if (gallery === undefined) redirect(`/g/${link}`);
  const event = galleryEvent(db(), gallery, eventId);
  if (event === undefined) notFound();
  const photos = galleryPhotos(db(), gallery, eventId);
  return (
    <div>
      <GalleryHeader gallery={gallery} />
      <p className="mb-1 text-sm">
        <Link className="text-muted underline" href={`/g/${link}`}>
          All games
        </Link>
      </p>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h2 className="display text-2xl" data-testid="game-title">
            {event.name}
          </h2>
          <p className="text-sm text-muted">
            {longDate(event.event_date)}
            {event.location ? ` · ${event.location}` : ""} ·{" "}
            {count(photos.length, "photo")}
          </p>
        </div>
        {photos.length > 0 ? (
          <a
            className="btn-primary"
            href={`/g/${link}/zip/${eventId}`}
            data-testid="download-all"
          >
            Download all ({count(photos.length, "photo")})
          </a>
        ) : null}
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {photos.map((p) => (
          <li key={p.id} className="card overflow-hidden" data-testid="gallery-photo">
            <a href={`/g/${link}/p/${p.id}/preview`} target="_blank" rel="noreferrer">
              <img
                src={`/g/${link}/p/${p.id}/thumb`}
                alt={p.original_filename}
                loading="lazy"
                className="aspect-[4/3] w-full object-cover"
              />
            </a>
            <a
              className="block px-2 py-1 text-xs text-muted hover:text-text"
              href={`/g/${link}/p/${p.id}/original?download=1`}
              data-testid="download-one"
            >
              Download
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
