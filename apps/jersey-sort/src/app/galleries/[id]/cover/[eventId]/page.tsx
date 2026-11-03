import Link from "next/link";
import { notFound } from "next/navigation";

import { setCoverAction } from "@/actions/galleries.ts";
import { db } from "@/lib/db.ts";
import { longDate } from "@/lib/format.ts";
import { coverFor } from "@/lib/online-core.ts";
import { getEvent } from "@/lib/repo/events.ts";
import { getGallery } from "@/lib/repo/galleries.ts";
import { requireUser } from "@/lib/session.ts";

export const dynamic = "force-dynamic";

/** Pick the one photo a game's public page on the website may show. */
export default async function CoverPage({
  params,
}: {
  params: Promise<{ id: string; eventId: string }>;
}) {
  const { id, eventId } = await params;
  const user = await requireUser(`/galleries/${id}/cover/${eventId}`);
  const gallery = getGallery(db(), user.organizationId, id);
  const event = getEvent(db(), user.organizationId, eventId);
  if (
    gallery === undefined ||
    event === undefined ||
    !gallery.eventIds.includes(eventId)
  ) {
    notFound();
  }
  const current = coverFor(db(), id, eventId);
  const photos = db().all<{ id: string; original_filename: string }>(
    `select id, original_filename from photos
      where event_id = :e and organization_id = :org and unusable = 0 and preview_path is not null
      order by captured_at, original_filename`,
    { e: eventId, org: user.organizationId },
  );
  return (
    <div>
      <p className="mb-1 text-sm">
        <Link className="text-muted underline" href={`/galleries/${id}`}>
          Back to the team gallery
        </Link>
      </p>
      <h1 className="display mb-1 text-2xl">Cover for the website</h1>
      <p className="mb-4 max-w-3xl text-sm text-muted">
        {event.name} · {longDate(event.event_date)}. This is the only photo of this game
        anyone can see on 5starsportsmedia.com without the team password. A team or
        crowd shot works well. Choose none and the page shows no photo.
      </p>
      <form action={setCoverAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="event" value={eventId} />
        <div className="mb-3 flex gap-2">
          <button className="btn-primary" type="submit">
            Save cover
          </button>
        </div>
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input type="radio" name="photo" value="" defaultChecked={current === null} />
          No cover (no photo shown publicly)
        </label>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {photos.map((p) => (
            <li key={p.id}>
              <label className="card block cursor-pointer overflow-hidden has-[:checked]:ring-2 has-[:checked]:ring-brand">
                <img
                  src={`/api/photos/${p.id}/thumb`}
                  alt={p.original_filename}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                />
                <span className="flex items-center gap-2 px-2 py-1 text-xs">
                  <input
                    type="radio"
                    name="photo"
                    value={p.id}
                    defaultChecked={current === p.id}
                    data-testid="cover-option"
                  />
                  {p.original_filename}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </form>
    </div>
  );
}
