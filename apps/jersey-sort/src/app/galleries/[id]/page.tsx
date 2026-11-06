import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import {
  connectOnlineAction,
  deleteGalleryAction,
  publishOnlineAction,
  newGalleryLinkAction,
  renameGalleryAction,
  saveGalleryEventsAction,
  setGalleryActiveAction,
  setGalleryPasswordAction,
} from "@/actions/galleries.ts";
import { AutoRefresh } from "@/components/AutoRefresh.tsx";
import { CopyLink } from "@/components/CopyLink.tsx";
import { FamilyMessage } from "@/components/FamilyMessage.tsx";
import { Notice, param, type SearchParams } from "@/components/Notice.tsx";
import { db } from "@/lib/db.ts";
import { count, longDate } from "@/lib/format.ts";
import { importStatus } from "@/lib/imports.ts";
import { listEvents } from "@/lib/repo/events.ts";
import { isConnected, publishStatus } from "@/lib/online.ts";
import { coverFor, onlineStatus, websiteLink } from "@/lib/online-core.ts";
import { getGallery } from "@/lib/repo/galleries.ts";
import { requireUser } from "@/lib/session.ts";

export const dynamic = "force-dynamic";

export default async function GalleryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const user = await requireUser(`/galleries/${id}`);
  const sp = await searchParams;
  const gallery = getGallery(db(), user.organizationId, id);
  if (gallery === undefined) notFound();
  const events = listEvents(db(), user.organizationId, 5000);
  const chosen = new Set(gallery.eventIds);
  const h = await headers();
  const host = h.get("host") ?? "localhost:4603";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const url = `${proto}://${host}/g/${gallery.token}`;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host);
  const connected = await isConnected();
  const online = onlineStatus(db(), gallery.id);
  const publishing = publishStatus(gallery.id);
  const running = publishing !== null && !publishing.finished;
  // Photos still coming in from a folder (Publish to 5 Star publishes after).
  const arriving = gallery.eventIds
    .map((e) => importStatus(e))
    .filter((p) => p !== null && !p.finished);
  const covers = new Map(
    gallery.eventIds.map((e) => [e, coverFor(db(), gallery.id, e)] as const),
  );
  const title = gallery.group_name
    ? `${gallery.group_name} · ${gallery.name}`
    : gallery.name;

  return (
    <div className="max-w-4xl">
      <p className="mb-1 text-sm">
        <Link className="text-muted underline" href="/galleries">
          Team galleries
        </Link>
      </p>
      <h1 className="display mb-4 text-2xl">{title}</h1>
      <Notice error={param(sp, "error")} notice={param(sp, "notice")} />

      <section className="card mb-5 p-4">
        <h2 className="mb-2 font-semibold">Link</h2>
        {gallery.active === 1 ? (
          <>
            <CopyLink url={url} />
            <p className="mt-2 text-sm text-muted">
              Give the coach this link and the team password. Visitors see only the
              games ticked below.
            </p>
            {local ? (
              <p className="mt-2 text-sm text-amber-200" data-testid="local-only">
                This link opens on this computer only. For phones, publish the gallery
                online (below) and give out its website link instead.
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-red-300" data-testid="link-off">
            The link is switched off: nobody can open this gallery.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <form action={setGalleryActiveAction}>
            <input type="hidden" name="id" value={gallery.id} />
            <input
              type="hidden"
              name="active"
              value={gallery.active === 1 ? "0" : "1"}
            />
            <button className="btn" type="submit">
              {gallery.active === 1 ? "Switch the link off" : "Switch the link back on"}
            </button>
          </form>
          <form action={newGalleryLinkAction}>
            <input type="hidden" name="id" value={gallery.id} />
            <button
              className="btn"
              type="submit"
              title="Use this if the link was passed on too far"
            >
              Make a new link (old one stops working)
            </button>
          </form>
        </div>
      </section>

      <section className="card mb-5 p-4" id="online" data-testid="online">
        <h2 className="mb-2 font-semibold">Online, on 5starsportsmedia.com</h2>
        {running || arriving.length > 0 ? <AutoRefresh seconds={3} /> : null}
        {arriving.map((p) =>
          p === null ? null : (
            <p key={p.folder} className="mb-2 text-sm" data-testid="publish-arriving">
              Bringing in photos from <span className="font-mono">{p.folder}</span>:{" "}
              {p.done.toLocaleString("en-US")} of {count(p.total, "photo")}. The gallery
              goes online as soon as they are all in.
            </p>
          ),
        )}
        {!connected ? (
          <>
            <p className="mb-3 text-sm text-muted">
              Publishing puts this gallery on the website: each game&apos;s public page
              shows only the cover photo you pick, and the photos stay behind the team
              password. First connect this computer, once.
            </p>
            <form action={connectOnlineAction}>
              <input type="hidden" name="id" value={gallery.id} />
              <button className="btn-primary" type="submit">
                Connect to the online galleries
              </button>
            </form>
          </>
        ) : (
          <>
            {online !== null ? (
              <>
                <p className="mb-2 text-sm" data-testid="online-status">
                  Online since {new Date(online.publishedAt).toLocaleString("en-US")}:{" "}
                  {count(online.games, "game")}, {count(online.photos, "photo")}.
                </p>
                <CopyLink url={websiteLink(gallery.token)} />
                <p className="mt-2 text-sm text-muted">
                  The website link opens on any phone. Give it out with the team
                  password.
                </p>
                {gallery.active === 1 ? (
                  <FamilyMessage title={title} link={websiteLink(gallery.token)} />
                ) : null}
              </>
            ) : (
              <p className="mb-2 text-sm text-muted">Not online yet.</p>
            )}
            {running ? (
              <p className="mt-3 text-sm" data-testid="publish-progress">
                {publishing.phase === "preparing"
                  ? "Getting ready…"
                  : `Publishing: ${publishing.done.toLocaleString("en-US")} of ${count(publishing.total, "photo")}…`}
              </p>
            ) : null}
            {publishing?.phase === "failed" ? (
              <p className="mt-3 text-sm text-red-300" data-testid="publish-problem">
                {publishing.message}
              </p>
            ) : null}
            {publishing?.phase === "done" && !running ? (
              <p className="mt-3 text-sm text-green-200" data-testid="publish-done">
                Published: {count(publishing.total, "photo")} online
                {publishing.uploaded > 0 ? ` (${publishing.uploaded} new)` : ""}.
              </p>
            ) : null}
            <form action={publishOnlineAction} className="mt-3">
              <input type="hidden" name="id" value={gallery.id} />
              <button className="btn-primary" type="submit" disabled={running}>
                {online === null ? "Publish online" : "Publish changes online"}
              </button>
            </form>
            <p className="mt-2 text-xs text-muted">
              Photos go online at web size (about 2400 px); your originals stay on this
              computer. Publishing again uploads only new photos.
            </p>
          </>
        )}
      </section>

      <section className="card mb-5 p-4">
        <h2 className="mb-2 font-semibold">Team password</h2>
        <form
          action={setGalleryPasswordAction}
          className="flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="id" value={gallery.id} />
          <div className="min-w-48 flex-1">
            <label className="label" htmlFor="g-newpass">
              New team password (6+ characters)
            </label>
            <input
              className="input"
              id="g-newpass"
              name="password"
              required
              minLength={6}
              autoComplete="off"
            />
          </div>
          <button className="btn" type="submit">
            Change password
          </button>
        </form>
        <p className="mt-2 text-sm text-muted">
          The password is never shown again once saved. Changing it signs everyone out
          of this gallery until they enter the new one.
        </p>
      </section>

      <section className="card mb-5 p-4">
        <h2 className="mb-1 font-semibold">Games this team sees</h2>
        <p className="mb-3 text-sm text-muted">
          Tick the games to show. Games come into JerseySort from DateSort (
          <em>Publish to 5 Star</em> adds one here by itself, or
          <em>Find jersey numbers</em>) or by uploading.
        </p>
        {events.length === 0 ? (
          <p className="text-sm text-muted">
            No games in JerseySort yet.{" "}
            <Link className="underline" href="/events/new">
              Create one
            </Link>
            .
          </p>
        ) : (
          <form action={saveGalleryEventsAction}>
            <input type="hidden" name="id" value={gallery.id} />
            <ul className="mb-3 max-h-[28rem] divide-y divide-line overflow-y-auto rounded-md border border-line">
              {events.map((e) => (
                <li key={e.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-panel-2">
                    <input
                      type="checkbox"
                      name="event"
                      value={e.id}
                      defaultChecked={chosen.has(e.id)}
                      data-testid="gallery-event"
                    />
                    <span className="flex-1">
                      <span className="block font-semibold">{e.name}</span>
                      <span className="text-xs text-muted">
                        {longDate(e.event_date)} · {e.team_name} · {e.sport} ·{" "}
                        {count(e.photo_count, "photo")}
                      </span>
                    </span>
                  </label>
                  {chosen.has(e.id) ? (
                    <p className="px-3 pb-2 pl-9 text-xs text-muted">
                      Cover for the website:{" "}
                      {covers.get(e.id) ? "chosen" : "none (no photo shown publicly)"} ·{" "}
                      <Link
                        className="underline"
                        href={`/galleries/${gallery.id}/cover/${e.id}`}
                        data-testid="choose-cover"
                      >
                        {covers.get(e.id) ? "change" : "choose one"}
                      </Link>
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
            <button className="btn-primary" type="submit">
              Save games
            </button>
          </form>
        )}
      </section>

      <section className="card mb-5 p-4">
        <h2 className="mb-2 font-semibold">Name</h2>
        <form
          action={renameGalleryAction}
          className="grid gap-2 sm:grid-cols-3 sm:items-end"
        >
          <input type="hidden" name="id" value={gallery.id} />
          <div>
            <label className="label" htmlFor="g-rgroup">
              Organization or group
            </label>
            <input
              className="input"
              id="g-rgroup"
              name="group"
              defaultValue={gallery.group_name ?? ""}
            />
          </div>
          <div>
            <label className="label" htmlFor="g-rname">
              Team or gallery name
            </label>
            <input
              className="input"
              id="g-rname"
              name="name"
              required
              defaultValue={gallery.name}
            />
          </div>
          <button className="btn" type="submit">
            Save name
          </button>
        </form>
      </section>

      <form action={deleteGalleryAction}>
        <input type="hidden" name="id" value={gallery.id} />
        <button className="text-sm text-red-300 underline" type="submit">
          Delete this team gallery (its photos stay in JerseySort)
        </button>
      </form>
    </div>
  );
}
