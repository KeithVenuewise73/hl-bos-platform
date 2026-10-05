import Link from "next/link";

import { Notice, param, type SearchParams } from "@/components/Notice.tsx";
import { db } from "@/lib/db.ts";
import { count, longDate } from "@/lib/format.ts";
import { listEvents } from "@/lib/repo/events.ts";
import { requireUser } from "@/lib/session.ts";

export const dynamic = "force-dynamic";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const events = listEvents(db(), user.organizationId);
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="display text-2xl">Events</h1>
        <Link className="btn-primary" href="/events/new">
          + Create event
        </Link>
      </div>
      <Notice notice={param(sp, "notice")} />
      {events.length === 0 ? (
        <p className="card p-6 text-sm text-muted">
          No events yet. Create one for each game, then upload its photos.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => (
            <li key={e.id}>
              <Link
                href={`/events/${e.id}`}
                className="card block p-4 hover:border-muted"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-2">
                  {e.sport} · {e.season_name}
                </p>
                <p className="display mt-1 text-lg leading-tight">{e.name}</p>
                <p className="mt-1 text-sm text-muted">
                  {longDate(e.event_date)}
                  {e.location ? ` · ${e.location}` : ""}
                </p>
                <p className="mt-2 text-sm">
                  {count(e.photo_count, "photo")}
                  {e.review_count > 0 ? (
                    <span className="text-medium"> · {e.review_count} need review</span>
                  ) : null}
                  {e.processing_count > 0 ? (
                    <span className="text-brand-2">
                      {" "}
                      · {e.processing_count} analyzing
                    </span>
                  ) : null}
                  {e.failed_count > 0 ? (
                    <span className="text-low"> · {e.failed_count} failed</span>
                  ) : null}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
