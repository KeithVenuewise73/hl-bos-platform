import Link from "next/link";

import { db } from "@/lib/db.ts";
import { count, longDate } from "@/lib/format.ts";
import { dateGroups } from "@/lib/repo/photos.ts";
import { requireUser } from "@/lib/session.ts";

export const dynamic = "force-dynamic";

export default async function DatesPage() {
  const user = await requireUser();
  const groups = dateGroups(db(), user.organizationId);
  return (
    <div>
      <h1 className="display mb-4 text-2xl">By date</h1>
      {groups.length === 0 ? (
        <p className="card p-6 text-sm text-muted">No photos yet.</p>
      ) : null}
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => (
          <li key={g.day}>
            <Link
              href={`/photos?day=${g.day}`}
              className="card block p-4 hover:border-muted"
            >
              <span className="display block text-xl">{longDate(g.day)}</span>
              <span className="text-sm text-muted">
                {count(g.photos, "photo")} · {count(g.events, "event")}
                {g.inferred > 0
                  ? ` · ${g.inferred} dated by upload (no date in file)`
                  : ""}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
