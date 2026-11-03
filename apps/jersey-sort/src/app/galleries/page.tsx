import Link from "next/link";

import { createGalleryAction } from "@/actions/galleries.ts";
import { Notice, param, type SearchParams } from "@/components/Notice.tsx";
import { db } from "@/lib/db.ts";
import { count } from "@/lib/format.ts";
import { listGalleries } from "@/lib/repo/galleries.ts";
import { requireUser } from "@/lib/session.ts";

export const dynamic = "force-dynamic";

export default async function GalleriesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireUser("/galleries");
  const sp = await searchParams;
  const galleries = listGalleries(db(), user.organizationId);
  const groups = new Map<string, typeof galleries>();
  for (const g of galleries) {
    const key = g.group_name ?? "";
    groups.set(key, [...(groups.get(key) ?? []), g]);
  }
  return (
    <div>
      <h1 className="display mb-1 text-2xl">Team galleries</h1>
      <p className="mb-4 max-w-3xl text-sm text-muted">
        Give a team, an organization or a group of family and friends their own private
        gallery. They see only the games you assign to it, with a link and a team
        password, and can view and download them. Photos are branded{" "}
        <strong>{user.organizationName}</strong>.
      </p>
      <Notice error={param(sp, "error")} notice={param(sp, "notice")} />
      <form
        action={createGalleryAction}
        className="card mb-6 grid gap-3 p-4 sm:grid-cols-4 sm:items-end"
      >
        <div>
          <label className="label" htmlFor="g-group">
            Organization or group (optional)
          </label>
          <input
            className="input"
            id="g-group"
            name="group"
            placeholder="Cazenovia Hockey"
          />
        </div>
        <div>
          <label className="label" htmlFor="g-name">
            Team or gallery name
          </label>
          <input
            className="input"
            id="g-name"
            name="name"
            required
            placeholder="Varsity"
          />
        </div>
        <div>
          <label className="label" htmlFor="g-pass">
            Team password (6+ characters)
          </label>
          <input
            className="input"
            id="g-pass"
            name="password"
            required
            minLength={6}
            autoComplete="off"
            placeholder="What you'll tell the coach"
          />
        </div>
        <button className="btn-primary" type="submit">
          Create team gallery
        </button>
      </form>
      {galleries.length === 0 ? (
        <p className="card p-6 text-sm text-muted">
          No team galleries yet. Create one above, then tick the games it should show.
        </p>
      ) : null}
      {[...groups.entries()].map(([group, list]) => (
        <section key={group} className="mb-6">
          <h2 className="mb-2 font-semibold">{group || "Other galleries"}</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/galleries/${g.id}`}
                  className="card block p-4 hover:border-muted"
                  data-testid="gallery-card"
                >
                  <span className="block text-lg font-semibold">{g.name}</span>
                  <span className="text-sm text-muted">
                    {count(g.events, "game")} · {count(g.photos, "photo")}
                  </span>
                  {g.active === 0 ? (
                    <span className="mt-1 block text-xs text-red-300">
                      Link switched off
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
