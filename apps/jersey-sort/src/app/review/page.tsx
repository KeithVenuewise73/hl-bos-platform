import Link from "next/link";

import { photoAction } from "@/actions/review.ts";
import { DetectionEditor } from "@/components/DetectionEditor.tsx";
import { Notice, param, type SearchParams } from "@/components/Notice.tsx";
import { ReviewKeys } from "@/components/ReviewKeys.tsx";
import { db } from "@/lib/db.ts";
import { longDateTime } from "@/lib/format.ts";
import { getEvent, listEvents } from "@/lib/repo/events.ts";
import { getPhoto, photoDetections } from "@/lib/repo/photos.ts";
import { nextInQueue, queueCount } from "@/lib/repo/review.ts";
import { getSettings } from "@/lib/repo/settings.ts";
import { requireUser } from "@/lib/session.ts";

export const dynamic = "force-dynamic";

function ReviewButton({
  op,
  label,
  photoId,
  returnTo,
  className,
  keyHint,
}: {
  op: string;
  label: string;
  photoId: string;
  returnTo: string;
  className: string;
  keyHint: string;
}) {
  return (
    <form action={photoAction}>
      <input type="hidden" name="op" value={op} />
      <input type="hidden" name="photoId" value={photoId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button className={className} type="submit" data-review-op={op}>
        {label}{" "}
        <kbd className="ml-1 rounded border border-current/40 px-1 text-[10px] opacity-70">
          {keyHint}
        </kbd>
      </button>
    </form>
  );
}

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const d = db();
  const org = user.organizationId;
  const sp = await searchParams;
  const eventId = param(sp, "event") ?? null;
  const event = eventId === null ? undefined : getEvent(d, org, eventId);
  const scope = event?.id ?? null;
  const t = getSettings(d, org).thresholds;
  const remaining = queueCount(d, org, scope);
  // The photo being worked on stays on screen while numbers are confirmed,
  // changed or added — even once those edits have sorted it — until the
  // person says Done, No jersey, Unusable or Skip. Otherwise adding the first
  // number to a photo would whisk it away before a second could be added.
  const pinned = param(sp, "photo");
  const pinnedPhoto =
    pinned === undefined ? undefined : getPhoto(d, org, user.userId, pinned);
  const item =
    pinnedPhoto !== undefined &&
    pinnedPhoto.reviewed_at === null &&
    pinnedPhoto.no_jersey_visible === 0 &&
    pinnedPhoto.unusable === 0
      ? { photo_id: pinnedPhoto.id, event_id: pinnedPhoto.event_id }
      : nextInQueue(d, org, scope, null);
  const upNext = item ? nextInQueue(d, org, scope, item.photo_id) : undefined;
  const returnTo = scope === null ? "/review" : `/review?event=${scope}`;
  const events = listEvents(d, org).filter((e) => e.review_count > 0);

  const header = (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <h1 className="display text-2xl">Review</h1>
      <span className="text-sm text-muted">
        {remaining.toLocaleString()} photo{remaining === 1 ? "" : "s"} waiting
        {event ? ` in ${event.name}` : ""}
      </span>
      {events.length > 1 || event ? (
        <nav
          className="ml-auto flex flex-wrap gap-1 text-xs"
          aria-label="Review by event"
        >
          <Link
            className={`rounded px-2 py-1 ${scope === null ? "bg-panel-2" : "text-muted"}`}
            href="/review"
          >
            All events
          </Link>
          {events.map((e) => (
            <Link
              key={e.id}
              className={`rounded px-2 py-1 ${scope === e.id ? "bg-panel-2" : "text-muted"}`}
              href={`/review?event=${e.id}`}
            >
              {e.name} ({e.review_count})
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );

  if (item === undefined) {
    return (
      <div>
        {header}
        <Notice error={param(sp, "error")} notice={param(sp, "notice")} />
        <div className="card p-8 text-center">
          <p className="display text-2xl text-high">All caught up</p>
          <p className="mt-2 text-sm text-muted">
            No photos need review{event ? " in this event" : ""}. Uncertain numbers land
            here as analysis finishes.
          </p>
        </div>
      </div>
    );
  }

  const photo = getPhoto(d, org, user.userId, item.photo_id);
  if (photo === undefined) return header;
  const detections = photoDetections(d, org, photo.id);
  const editReturn = `${returnTo}${returnTo.includes("?") ? "&" : "?"}photo=${photo.id}`;

  return (
    <div>
      <ReviewKeys />
      {upNext ? (
        <link
          rel="preload"
          as="image"
          href={`/api/photos/${upNext.photo_id}/preview`}
        />
      ) : null}
      {header}
      <Notice error={param(sp, "error")} notice={param(sp, "notice")} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-hidden rounded-xl bg-black">
          <img
            src={`/api/photos/${photo.id}/preview`}
            alt={photo.original_filename}
            className="mx-auto max-h-[80vh] w-auto"
            data-testid="review-photo"
          />
        </div>
        <aside className="space-y-3">
          <div className="text-sm">
            <Link className="font-semibold underline" href={`/photos/${photo.id}`}>
              {photo.original_filename}
            </Link>
            <p className="text-muted">
              {photo.event_name} · {longDateTime(photo.captured_at)}
            </p>
            {photo.analysis_notes ? (
              <p className="mt-1 text-xs text-muted">{photo.analysis_notes}</p>
            ) : null}
          </div>
          {photo.status === "completed" ? (
            <p className="rounded-md border border-high/40 bg-high/10 px-2 py-1 text-xs text-green-200">
              Sorted. Add another number, or press Done for the next photo.
            </p>
          ) : null}
          <DetectionEditor
            photoId={photo.id}
            detections={detections}
            thresholds={t}
            returnTo={editReturn}
          />
          <div className="grid grid-cols-2 gap-2 pt-2">
            <ReviewButton
              op="reviewed"
              label="✓ Done, next"
              photoId={photo.id}
              returnTo={returnTo}
              className="btn-primary col-span-2"
              keyHint="Enter"
            />
            <ReviewButton
              op="no_jersey"
              label="No jersey"
              photoId={photo.id}
              returnTo={returnTo}
              className="btn-ghost"
              keyHint="N"
            />
            <ReviewButton
              op="unusable"
              label="Unusable"
              photoId={photo.id}
              returnTo={returnTo}
              className="btn-ghost"
              keyHint="U"
            />
            <ReviewButton
              op="skip"
              label="Skip for now"
              photoId={photo.id}
              returnTo={returnTo}
              className="btn-ghost col-span-2"
              keyHint="S"
            />
          </div>
          <p className="text-xs text-muted">
            “Done” keeps every number shown in the jersey galleries and drops low
            readings you did not confirm. Type a digit to add a number.
          </p>
        </aside>
      </div>
    </div>
  );
}
