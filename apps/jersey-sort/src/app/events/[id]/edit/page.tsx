import { notFound } from "next/navigation";

import { deleteEventAction, updateEventAction } from "@/actions/events.ts";
import { EventForm } from "@/components/EventForm.tsx";
import { Notice, param, type SearchParams } from "@/components/Notice.tsx";
import { db } from "@/lib/db.ts";
import { getEvent } from "@/lib/repo/events.ts";
import { requireUser } from "@/lib/session.ts";

export const dynamic = "force-dynamic";

export default async function EditEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const { id } = await params;
  const event = getEvent(db(), user.organizationId, id);
  if (event === undefined) notFound();
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="display mb-4 text-2xl">Edit event</h1>
      <Notice error={param(sp, "error")} />
      <EventForm action={updateEventAction} event={event} submit="Save" />
      {user.role === "owner" ? (
        <form
          action={deleteEventAction}
          className="card mt-6 space-y-3 border-low/40 p-5"
        >
          <input type="hidden" name="id" value={event.id} />
          <h2 className="font-semibold text-low">Delete this event</h2>
          <p className="text-sm text-muted">
            Deletes the event and every photo in it, including the originals on this
            computer. This cannot be undone.
          </p>
          <input
            className="input max-w-xs"
            name="confirm"
            placeholder='Type "delete"'
            aria-label="Type delete to confirm"
          />
          <button className="btn-danger" type="submit">
            Delete event and photos
          </button>
        </form>
      ) : (
        <p className="mt-6 text-xs text-muted">
          Only the organization&apos;s owner can delete an event.
        </p>
      )}
    </div>
  );
}
