import { createEventAction } from "@/actions/events.ts";
import { EventForm } from "@/components/EventForm.tsx";
import { Notice, param, type SearchParams } from "@/components/Notice.tsx";
import { requireUser } from "@/lib/session.ts";

export const dynamic = "force-dynamic";

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireUser();
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="display mb-4 text-2xl">Create event</h1>
      <Notice error={param(sp, "error")} />
      <EventForm action={createEventAction} submit="Create event" />
    </div>
  );
}
