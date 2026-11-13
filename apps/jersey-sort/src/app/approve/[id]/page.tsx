import Link from "next/link";
import { notFound } from "next/navigation";

import { approveAction } from "@/actions/approve.ts";
import { Notice, param, type SearchParams } from "@/components/Notice.tsx";
import { Pager } from "@/components/Pager.tsx";
import { db } from "@/lib/db.ts";
import { longDate, withParam } from "@/lib/format.ts";
import { FLAG_WORDS, type QualityFlag } from "@/lib/quality-core.ts";
import {
  gamesForReview,
  REVIEW_PAGE,
  reviewCounts,
  reviewPhotos,
  type ReviewFilter,
} from "@/lib/repo/approvals.ts";
import { getEvent, listEvents } from "@/lib/repo/events.ts";
import { ensureQuality } from "@/lib/repo/quality.ts";
import { clusterByGap } from "@/lib/relabel-core.ts";
import { config } from "@/lib/config.ts";
import { requireUser } from "@/lib/session.ts";

export const dynamic = "force-dynamic";

const FILTERS: { key: ReviewFilter; label: string }[] = [
  { key: "pending", label: "Waiting" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

const clock = (t: string) => t.slice(11, 16);

export default async function ApproveGamePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const user = await requireUser(`/approve/${id}`);
  const d = db();
  const org = user.organizationId;
  const event = getEvent(d, org, id);
  if (event === undefined) notFound();
  const sp = await searchParams;
  const filter = FILTERS.find((f) => f.key === param(sp, "show"))?.key ?? "pending";
  const page = Math.max(1, Number(param(sp, "page") ?? "1") || 1);
  const owner = user.role === "owner";
  const counts = reviewCounts(d, org, id);
  const { tiles, total } = reviewPhotos(
    d,
    org,
    id,
    filter,
    (page - 1) * REVIEW_PAGE,
    REVIEW_PAGE,
  );
  await ensureQuality(
    d,
    config().dataDir,
    org,
    tiles.filter((t) => !t.qualityChecked).map((t) => t.id),
  );
  const shown = reviewPhotos(
    d,
    org,
    id,
    filter,
    (page - 1) * REVIEW_PAGE,
    REVIEW_PAGE,
  ).tiles;
  const breaks = new Set(
    clusterByGap(shown.map((t) => ({ id: t.id, capturedAt: t.capturedAt })))
      .slice(1)
      .map((run) => run[0]!.id),
  );
  const others = listEvents(d, org).filter((e) => e.id !== id);
  const sameDay = gamesForReview(d, org).filter(
    (g) => g.eventDate === event.event_date,
  );
  const here =
    withParam(`/approve/${id}`, "show", filter) + (page > 1 ? `&page=${page}` : "");
  const base = withParam(`/approve/${id}`, "show", filter);

  return (
    <div>
      <p className="text-sm">
        <Link className="text-muted hover:underline" href="/approve">
          ← All games
        </Link>
      </p>
      <h1 className="display mt-1 text-3xl">{event.name}</h1>
      <p className="mt-1 text-muted">
        {event.sport} · {event.team_name} · {longDate(event.event_date)}
        {event.location ? ` · ${event.location}` : ""}
      </p>
      {sameDay.length > 1 ? (
        <p className="mt-2 text-sm text-medium">
          Same day: {sameDay.map((g) => g.name).join(" · ")}. Check that each photo is
          under the right game.
        </p>
      ) : null}
      <div className="mt-4">
        <Notice error={param(sp, "error")} notice={param(sp, "notice")} />
      </div>
      {!owner ? (
        <p className="mb-4 text-sm text-medium">
          You can look, but only the owner can approve, reject or move photos.
        </p>
      ) : null}
      <nav className="mb-4 flex flex-wrap gap-2 text-sm" aria-label="Show">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={withParam(`/approve/${id}`, "show", f.key)}
            className={f.key === filter ? "btn-primary" : "btn-ghost"}
          >
            {f.label}{" "}
            {f.key === "pending"
              ? counts.pending
              : f.key === "approved"
                ? counts.approved
                : f.key === "rejected"
                  ? counts.rejected
                  : counts.pending + counts.approved + counts.rejected}
          </Link>
        ))}
      </nav>
      {counts.notReady > 0 ? (
        <p className="mb-3 text-xs text-muted">
          {counts.notReady.toLocaleString()} photos are not ready yet (no web-size copy)
          and cannot be reviewed.
        </p>
      ) : null}
      {tiles.length === 0 ? (
        <p className="card p-4 text-muted">Nothing here.</p>
      ) : (
        <form action={approveAction}>
          <input type="hidden" name="returnTo" value={here} />
          <input type="hidden" name="eventId" value={id} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {shown.map((t) => (
              <div key={t.id} className="contents">
                {breaks.has(t.id) ? (
                  <p className="col-span-full mt-2 border-t border-dashed border-medium pt-1 text-xs text-medium">
                    Long pause before {clock(t.capturedAt)}: possibly a different game.
                  </p>
                ) : null}
                <label className="card block overflow-hidden">
                  <a
                    href={`/api/photos/${t.id}/preview`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img
                      src={`/api/photos/${t.id}/thumb`}
                      alt={t.filename}
                      loading="lazy"
                      className="aspect-[4/3] w-full object-cover"
                    />
                  </a>
                  <span className="flex items-center gap-2 px-2 py-1.5 text-xs">
                    {owner ? <input type="checkbox" name="photo" value={t.id} /> : null}
                    <span className="min-w-0 flex-1 truncate">
                      {clock(t.capturedAt)} · {t.filename}
                    </span>
                    <span
                      className={
                        t.status === "approved"
                          ? "text-high"
                          : t.status === "rejected"
                            ? "text-low"
                            : "text-muted"
                      }
                    >
                      {t.status === "pending" ? "waiting" : t.status}
                    </span>
                  </span>
                  {t.flags.length > 0 ? (
                    <span className="block px-2 pb-1.5 text-[11px] text-medium">
                      {t.flags.map((f) => FLAG_WORDS[f as QualityFlag]).join(" · ")}
                    </span>
                  ) : null}
                  {t.reason ? (
                    <span className="block px-2 pb-1.5 text-[11px] text-muted">
                      {t.reason}
                    </span>
                  ) : null}
                </label>
              </div>
            ))}
          </div>
          <Pager
            basePath={base}
            page={page}
            pages={Math.max(1, Math.ceil(total / REVIEW_PAGE))}
            total={total}
          />
          {owner ? (
            <div className="card sticky bottom-3 mt-4 grid gap-3 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <button className="btn-primary" name="op" value="approve">
                  Approve ticked
                </button>
                <input
                  className="input w-44"
                  name="reason"
                  placeholder="Why (optional)"
                />
                <button className="btn-danger" name="op" value="reject">
                  Reject ticked
                </button>
                <button className="btn-ghost" name="op" value="reset">
                  Back to waiting
                </button>
                {counts.pending > 0 ? (
                  <button className="btn-ghost ml-auto" name="op" value="approveRest">
                    Approve all {counts.pending.toLocaleString()} waiting
                  </button>
                ) : null}
              </div>
              <details>
                <summary className="cursor-pointer text-sm font-semibold">
                  Wrong game? Move the ticked photos
                </summary>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select className="input w-72" name="toEvent" defaultValue="">
                    <option value="" disabled>
                      Move to an existing game…
                    </option>
                    {others.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.event_date} · {e.name}
                      </option>
                    ))}
                  </select>
                  <button className="btn-ghost" name="op" value="move">
                    Move
                  </button>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <input className="input" name="name" placeholder="New game name" />
                  <input className="input" name="sport" defaultValue={event.sport} />
                  <input className="input" name="team" defaultValue={event.team_name} />
                  <input className="input" name="opponent" placeholder="Opponent" />
                  <input
                    className="input"
                    name="date"
                    defaultValue={event.event_date}
                  />
                  <input
                    className="input"
                    name="season"
                    defaultValue={event.season_name}
                  />
                </div>
                <button className="btn-ghost mt-2" name="op" value="newGame">
                  Start a new game from the ticked photos
                </button>
                <p className="mt-1 text-xs text-muted">
                  Moved photos go back to waiting under their new game.
                </p>
              </details>
            </div>
          ) : null}
        </form>
      )}
    </div>
  );
}
