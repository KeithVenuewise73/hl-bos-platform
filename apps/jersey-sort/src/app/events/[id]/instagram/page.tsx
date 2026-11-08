import Link from "next/link";
import { notFound } from "next/navigation";

import { startInstagramPostAction } from "@/actions/instagram.ts";
import { Notice, param, type SearchParams } from "@/components/Notice.tsx";
import { db } from "@/lib/db.ts";
import { count, longDate, longDateTime } from "@/lib/format.ts";
import { getEvent } from "@/lib/repo/events.ts";
import { draftablePhotos, listDrafts } from "@/lib/repo/instagram.ts";
import { requireUser } from "@/lib/session.ts";

export const dynamic = "force-dynamic";

/** A game's Instagram posts: the ones started, and a button to start another. */
export default async function InstagramListPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const user = await requireUser(`/events/${id}/instagram`);
  const sp = await searchParams;
  const event = getEvent(db(), user.organizationId, id);
  if (event === undefined) notFound();
  const drafts = listDrafts(db(), user.organizationId, id);
  const photos = draftablePhotos(db(), user.organizationId, id).length;
  return (
    <div className="max-w-3xl">
      <p className="mb-1 text-sm">
        <Link className="text-muted underline" href={`/events/${id}`}>
          {event.name}
        </Link>
      </p>
      <h1 className="display mb-1 text-2xl">Instagram</h1>
      <p className="mb-4 text-sm text-muted">
        {event.name} · {longDate(event.event_date)}
      </p>
      <Notice error={param(sp, "error")} notice={param(sp, "notice")} />

      <section className="card mb-5 p-4" data-testid="ig-status">
        <p className="mb-2 text-sm">
          Put an Instagram post together from this game: choose up to 10 photos, write
          the caption, and get the pictures ready in Instagram&apos;s shape.
        </p>
        <p className="text-sm text-muted">
          <strong className="text-text">Nothing is posted from here yet.</strong>{" "}
          Posting straight to Instagram is not connected. You download the finished
          pictures and caption, then post them yourself. Instagram is public, so only
          choose photos you are allowed to share publicly; the team galleries are
          private.
        </p>
      </section>

      <form action={startInstagramPostAction} className="mb-5">
        <input type="hidden" name="event" value={id} />
        <button className="btn-primary" type="submit" disabled={photos === 0}>
          Start a new Instagram post
        </button>
        {photos === 0 ? (
          <span className="ml-3 text-sm text-muted">
            This game has no usable photos yet.
          </span>
        ) : null}
      </form>

      {drafts.length === 0 ? (
        <p className="text-sm text-muted">No Instagram posts for this game yet.</p>
      ) : (
        <ul className="space-y-2" data-testid="ig-drafts">
          {drafts.map((d) => (
            <li key={d.id}>
              <Link
                className="card block p-3 hover:ring-1 hover:ring-brand"
                href={`/events/${id}/instagram/${d.id}`}
              >
                <span className="font-semibold">
                  {d.photo_ids.length === 0
                    ? "No photos chosen yet"
                    : count(d.photo_ids.length, "photo")}
                </span>
                <span className="ml-2 text-sm text-muted">
                  {d.caption.split("\n")[0]?.slice(0, 80) || "No caption"} · edited{" "}
                  {longDateTime(d.updated_at.slice(0, 19).replace("Z", ""))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
