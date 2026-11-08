import Link from "next/link";
import { notFound } from "next/navigation";

import {
  deleteInstagramPostAction,
  saveInstagramPostAction,
} from "@/actions/instagram.ts";
import { CaptionField, PhotoPicker } from "@/components/InstagramFields.tsx";
import { Notice, param, type SearchParams } from "@/components/Notice.tsx";
import { db } from "@/lib/db.ts";
import { count, longDate } from "@/lib/format.ts";
import {
  FITS,
  FORMATS,
  wouldEnlarge,
  type Fit,
  type Format,
} from "@/lib/instagram-core.ts";
import { getEvent } from "@/lib/repo/events.ts";
import { draftablePhotos, draftPhotos, getDraft } from "@/lib/repo/instagram.ts";
import { requireUser } from "@/lib/session.ts";

export const dynamic = "force-dynamic";

/** One Instagram post: choose the photos, write the caption, see the pictures, download the pack. */
export default async function InstagramPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; draft: string }>;
  searchParams: SearchParams;
}) {
  const { id, draft: draftId } = await params;
  const user = await requireUser(`/events/${id}/instagram/${draftId}`);
  const sp = await searchParams;
  const org = user.organizationId;
  const event = getEvent(db(), org, id);
  const draft = getDraft(db(), org, draftId);
  if (event === undefined || draft === undefined || draft.event_id !== id) notFound();
  const all = draftablePhotos(db(), org, id);
  const chosen = draftPhotos(db(), org, draft);
  const sizes = new Map(
    db()
      .all<{ id: string; width: number | null; height: number | null }>(
        "select id, width, height from photos where event_id = :e and organization_id = :org",
        { e: id, org },
      )
      .map((r) => [r.id, r]),
  );
  const shape = FORMATS[draft.format];
  return (
    <div className="max-w-5xl">
      <p className="mb-1 text-sm">
        <Link className="text-muted underline" href={`/events/${id}/instagram`}>
          Instagram posts for {event.name}
        </Link>
      </p>
      <h1 className="display mb-1 text-2xl">Instagram post</h1>
      <p className="mb-4 text-sm text-muted">
        {event.name} · {longDate(event.event_date)}
      </p>
      <Notice error={param(sp, "error")} notice={param(sp, "notice")} />

      <p className="mb-4 text-sm text-muted" data-testid="ig-status">
        <strong className="text-text">Nothing is posted from here yet.</strong> Choose
        the photos and caption, press Save, then download the pack and post it yourself.
        Instagram is public, so only choose photos you are allowed to share publicly.
      </p>

      <form action={saveInstagramPostAction} className="space-y-5">
        <input type="hidden" name="id" value={draft.id} />
        <section className="card p-4">
          <h2 className="mb-2 font-semibold">1. Choose the photos</h2>
          <PhotoPicker
            photos={all.map((p) => ({ id: p.id, filename: p.original_filename }))}
            chosen={draft.photo_ids}
          />
          <p className="mt-2 text-xs text-muted">
            The post shows them in the order they were taken.
          </p>
        </section>

        <section className="card p-4">
          <h2 className="mb-2 font-semibold">2. Pick the shape</h2>
          <div className="flex flex-wrap gap-6 text-sm">
            <fieldset>
              <legend className="label">Shape</legend>
              {(Object.keys(FORMATS) as Format[]).map((f) => (
                <label key={f} className="mb-1 flex items-center gap-2">
                  <input
                    type="radio"
                    name="format"
                    value={f}
                    defaultChecked={draft.format === f}
                    data-testid={`ig-format-${f}`}
                  />
                  {FORMATS[f].label}
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend className="label">How the photo fits</legend>
              {(Object.keys(FITS) as Fit[]).map((f) => (
                <label key={f} className="mb-1 flex items-center gap-2">
                  <input
                    type="radio"
                    name="fit"
                    value={f}
                    defaultChecked={draft.fit === f}
                    data-testid={`ig-fit-${f}`}
                  />
                  {FITS[f]}
                </label>
              ))}
            </fieldset>
          </div>
        </section>

        <section className="card p-4">
          <h2 className="mb-2 font-semibold">3. Write the caption</h2>
          <CaptionField initial={draft.caption} />
          <p className="mt-2 text-xs text-muted">
            It starts from the game&apos;s details. Add player names or hashtags
            yourself if you want them.
          </p>
        </section>

        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" type="submit" data-testid="ig-save">
            Save
          </button>
        </div>
      </form>

      <section className="card mt-6 p-4" data-testid="ig-preview">
        <h2 className="mb-1 font-semibold">4. The pictures</h2>
        {chosen.length === 0 ? (
          <p className="text-sm text-muted">
            Choose at least one photo above and press Save to see the pictures.
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted">
              {count(chosen.length, "picture")}, each {shape.width} × {shape.height}{" "}
              pixels, in this order. These are exactly what the pack contains, with no
              camera data or location in them.
            </p>
            <ol className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {chosen.map((p, i) => {
                const s = sizes.get(p.id);
                const soft =
                  s?.width != null &&
                  s.height != null &&
                  wouldEnlarge(s.width, s.height, draft.format, draft.fit);
                return (
                  <li key={p.id}>
                    <img
                      src={`/api/instagram/${draft.id}/frame/${i + 1}?v=${encodeURIComponent(draft.updated_at)}`}
                      alt={`Picture ${i + 1} of ${chosen.length}`}
                      loading="lazy"
                      className="w-full rounded border border-line"
                      data-testid="ig-frame"
                    />
                    <p className="mt-1 text-xs text-muted">
                      {i + 1} of {chosen.length}
                      {soft ? (
                        <span className="text-amber-200" data-testid="ig-soft">
                          {" "}
                          · small photo, may look a little soft
                        </span>
                      ) : null}
                    </p>
                  </li>
                );
              })}
            </ol>
            <div className="flex flex-wrap items-center gap-3">
              <a
                className="btn-primary"
                href={`/api/instagram/${draft.id}/pack`}
                data-testid="ig-pack"
              >
                Download the pack (ZIP)
              </a>
              <span className="text-sm text-muted">
                The pictures (01, 02, …) and the caption as a text file.
              </span>
            </div>
            <p className="mt-3 text-sm text-muted" data-testid="ig-how">
              To post: unzip it, open instagram.com in your browser, click Create (+),
              choose the pictures in order, and paste the caption (Copy the caption,
              above).
            </p>
          </>
        )}
      </section>

      <form action={deleteInstagramPostAction} className="mt-6">
        <input type="hidden" name="id" value={draft.id} />
        <button className="text-sm text-red-300 underline" type="submit">
          Delete this Instagram post (your photos stay)
        </button>
      </form>
    </div>
  );
}
