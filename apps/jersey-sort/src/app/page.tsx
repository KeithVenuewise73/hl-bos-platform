import Link from "next/link";

import { Brand } from "@/components/Brand.tsx";
import { ProgressPanel } from "@/components/Progress.tsx";
import { Stat } from "@/components/Stat.tsx";
import { db } from "@/lib/db.ts";
import { count, longDate, STATUS_LABEL } from "@/lib/format.ts";
import { providerStatus } from "@/lib/providers.ts";
import { dashboardStats, progress, recentUploads } from "@/lib/repo/dashboard.ts";
import { listEvents } from "@/lib/repo/events.ts";
import { getSettings } from "@/lib/repo/settings.ts";
import { requireUser } from "@/lib/session.ts";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await requireUser();
  const d = db();
  const org = user.organizationId;
  const settings = getSettings(d, org);
  const stats = dashboardStats(d, org, settings.thresholds.medium);
  const events = listEvents(d, org, 6);
  const recent = recentUploads(d, org, 12);
  const provider = providerStatus(settings.provider);

  return (
    <div>
      <section className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Brand large />
          <p className="mt-1 text-lg text-muted">Find your athlete. Instantly.</p>
          <p className="text-sm text-muted">{user.organizationName}</p>
        </div>
        <div className="flex gap-2">
          <Link className="btn-primary" href="/events/new">
            + Create event
          </Link>
          <Link
            className="btn-ghost"
            href={events[0] ? `/events/${events[0].id}` : "/events/new"}
          >
            Upload photos
          </Link>
        </div>
      </section>

      {!provider.ready ? (
        <p className="mb-4 rounded-md border border-medium/50 bg-medium/10 px-3 py-2 text-sm">
          {provider.detail}{" "}
          <Link className="underline" href="/settings">
            Settings
          </Link>
        </p>
      ) : null}

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Photos" value={stats.photos} href="/photos" />
        <Stat label="Events" value={stats.events} href="/events" />
        <Stat label="Players" value={stats.players} href="/players" />
        <Stat label="Jersey numbers" value={stats.numbers} />
        <Stat
          label="Need review"
          value={stats.needsReview}
          href="/review"
          accent={stats.needsReview > 0}
        />
        <Stat
          label="Failed"
          value={stats.failed}
          href="/photos?status=failed"
          accent={stats.failed > 0}
        />
      </section>

      <ProgressPanel eventId={null} initial={progress(d, org, null)} />

      {stats.photos === 0 ? (
        <section className="card mb-6 p-6">
          <h2 className="display text-xl">Get started</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>Create an event for a game.</li>
            <li>Drop in the photos — hundreds at once.</li>
            <li>
              JerseySort reads the jersey numbers and files every photo under each
              athlete in it.
            </li>
            <li>
              Check the uncertain ones in Review, then add players to turn #24 into a
              name.
            </li>
          </ol>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="display text-lg">Recent events</h2>
            <Link className="text-sm text-muted hover:text-text" href="/events">
              All events →
            </Link>
          </div>
          {events.length === 0 ? (
            <p className="card p-4 text-sm text-muted">No events yet.</p>
          ) : null}
          <ul className="space-y-2">
            {events.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/events/${e.id}`}
                  className="card flex items-center justify-between gap-3 p-3 hover:border-muted"
                >
                  <span>
                    <span className="block font-semibold">{e.name}</span>
                    <span className="text-xs text-muted">
                      {longDate(e.event_date)} · {e.sport}
                    </span>
                  </span>
                  <span className="text-right text-sm">
                    {count(e.photo_count, "photo")}
                    {e.review_count > 0 ? (
                      <span className="block text-xs text-medium">
                        {e.review_count} to review
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="display text-lg">Recent uploads</h2>
            <Link className="text-sm text-muted hover:text-text" href="/dates">
              By date →
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="card p-4 text-sm text-muted">Nothing uploaded yet.</p>
          ) : null}
          <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
            {recent.map((p) => (
              <li
                key={p.id}
                className="relative aspect-square overflow-hidden rounded-md bg-panel-2"
              >
                <Link
                  href={`/photos/${p.id}`}
                  title={`${p.original_filename} · ${p.event_name} · ${STATUS_LABEL[p.status] ?? p.status}`}
                >
                  <img
                    src={`/api/photos/${p.id}/thumb`}
                    alt={p.original_filename}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Analysis: {provider.label}</p>
        </section>
      </div>
    </div>
  );
}
