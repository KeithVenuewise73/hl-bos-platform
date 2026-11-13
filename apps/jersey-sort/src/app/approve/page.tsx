import Link from "next/link";

import { Notice, param, type SearchParams } from "@/components/Notice.tsx";
import { db } from "@/lib/db.ts";
import { longDate } from "@/lib/format.ts";
import { gamesForReview } from "@/lib/repo/approvals.ts";
import { requireUser } from "@/lib/session.ts";

export const dynamic = "force-dynamic";

export default async function ApprovePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireUser("/approve");
  const sp = await searchParams;
  const games = gamesForReview(db(), user.organizationId).filter(
    (g) => g.pending + g.approved + g.rejected + g.notReady > 0,
  );
  return (
    <div>
      <h1 className="display text-3xl">Approve for the website</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Photos reach 5starsportsmedia.com only after they are approved here. Check each
        game: the photos are the right quality and carry the right game label. Photos
        from before this page existed start as waiting too.
      </p>
      {user.role !== "owner" ? (
        <p className="mt-3 text-sm text-medium">
          You can look, but only the owner can approve, reject or move photos.
        </p>
      ) : null}
      <div className="mt-4">
        <Notice error={param(sp, "error")} notice={param(sp, "notice")} />
      </div>
      {games.length === 0 ? (
        <p className="card p-4 text-muted">
          There are no photos yet. Bring photos in from DateSort or the Import page and
          they will wait here for review.
        </p>
      ) : (
        <ul className="grid gap-3">
          {games.map((g) => (
            <li
              key={g.id}
              className="card flex flex-wrap items-center gap-x-4 gap-y-2 p-4"
            >
              <div className="min-w-0 flex-1">
                <Link
                  className="font-semibold hover:underline"
                  href={`/approve/${g.id}`}
                >
                  {g.name}
                </Link>
                <p className="text-sm text-muted">
                  {g.sport} · {g.teamName} · {longDate(g.eventDate)}
                </p>
                {g.sameDay > 0 ? (
                  <p className="mt-1 text-xs text-medium">
                    {g.sameDay === 1 ? "Another game" : `${g.sameDay} other games`} on
                    this same day: check the labels.
                  </p>
                ) : null}
              </div>
              <p className="text-sm font-semibold">
                <span className={g.pending > 0 ? "text-medium" : "text-muted"}>
                  {g.pending.toLocaleString()} waiting
                </span>
                {" · "}
                <span className="text-high">
                  {g.approved.toLocaleString()} approved
                </span>
                {" · "}
                <span className="text-muted">
                  {g.rejected.toLocaleString()} rejected
                </span>
              </p>
              <Link className="btn-ghost" href={`/approve/${g.id}`}>
                {g.pending > 0 ? "Review" : "Open"}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
