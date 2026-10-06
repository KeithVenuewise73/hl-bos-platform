import Link from "next/link";
import { notFound } from "next/navigation";

import { reanalyzeAction, retryFailedAction } from "@/actions/events.ts";
import { photoAction } from "@/actions/review.ts";
import {
  DetectionEditor,
  editorTeams,
  FlagButton,
} from "@/components/DetectionEditor.tsx";
import { Notice, param, type SearchParams } from "@/components/Notice.tsx";
import { db } from "@/lib/db.ts";
import { bytes, longDate, longDateTime, STATUS_LABEL } from "@/lib/format.ts";
import {
  getPhoto,
  neighbours,
  photoDetections,
  photoPlayers,
} from "@/lib/repo/photos.ts";
import { getSettings } from "@/lib/repo/settings.ts";
import { requireUser } from "@/lib/session.ts";

export const dynamic = "force-dynamic";

export default async function PhotoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const { id } = await params;
  const d = db();
  const org = user.organizationId;
  const photo = getPhoto(d, org, user.userId, id);
  if (photo === undefined) notFound();
  const sp = await searchParams;
  const t = getSettings(d, org).thresholds;
  const detections = photoDetections(d, org, id);
  const players = photoPlayers(d, org, id, t.medium);
  const { prev, next } = neighbours(d, org, photo);
  const here = `/photos/${id}`;
  const favorite = photo.favorite === 1;

  const meta: Array<[string, string | null]> = [
    ["File", photo.original_filename],
    [
      "Taken",
      `${longDateTime(photo.captured_at)}${photo.captured_at_source === "upload" ? " (inferred from upload — the file has no date)" : ""}`,
    ],
    [
      "Uploaded",
      `${new Date(photo.uploaded_at).toLocaleString("en-US")}${photo.uploaded_by_name ? ` by ${photo.uploaded_by_name}` : ""}`,
    ],
    [
      "Size",
      `${photo.width ?? "?"} × ${photo.height ?? "?"} · ${bytes(photo.file_size)} · ${photo.mime_type}`,
    ],
    [
      "Camera",
      [photo.camera_make, photo.camera_model].filter(Boolean).join(" ") || null,
    ],
    ["Lens", photo.lens],
    [
      "Exposure",
      [
        photo.exposure_time
          ? photo.exposure_time < 1
            ? `1/${Math.round(1 / photo.exposure_time)}s`
            : `${photo.exposure_time}s`
          : null,
        photo.f_number ? `f/${photo.f_number}` : null,
        photo.iso ? `ISO ${photo.iso}` : null,
        photo.focal_length ? `${photo.focal_length}mm` : null,
      ]
        .filter(Boolean)
        .join(" · ") || null,
    ],
    ["Status", STATUS_LABEL[photo.status] ?? photo.status],
    [
      "Athletes",
      photo.athletes_present === null
        ? "Not determined"
        : photo.athletes_present === 1
          ? `Yes${photo.athlete_count ? ` (${photo.athlete_count})` : ""}`
          : "None seen",
    ],
    ["Analysis note", photo.analysis_notes],
    ["Fingerprint", `SHA-256 ${photo.file_hash.slice(0, 16)}…`],
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <Link className="text-muted hover:text-text" href={`/events/${photo.event_id}`}>
          ← {photo.event_name}
        </Link>
        <span className="ml-auto flex gap-2">
          {prev ? (
            <Link
              className="btn-ghost"
              href={`/photos/${prev}`}
              aria-label="Previous photo"
            >
              ←
            </Link>
          ) : null}
          {next ? (
            <Link
              className="btn-ghost"
              href={`/photos/${next}`}
              aria-label="Next photo"
            >
              →
            </Link>
          ) : null}
        </span>
      </div>
      <Notice error={param(sp, "error")} notice={param(sp, "notice")} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="overflow-hidden rounded-xl bg-black">
          {photo.has_thumbnail === 1 ? (
            <img
              src={`/api/photos/${id}/preview`}
              alt={photo.original_filename}
              className="mx-auto max-h-[78vh] w-auto"
            />
          ) : (
            <p className="p-10 text-center text-muted">
              No preview could be made from this file. The original is kept and can be
              downloaded.
            </p>
          )}
        </div>
        <aside className="space-y-4">
          <div className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-2">
              {photo.sport} · {longDate(photo.event_date)}
            </p>
            <h1 className="display mt-1 text-xl leading-tight">{photo.event_name}</h1>
            <div className="mt-3 flex flex-wrap gap-2">
              <form action={photoAction}>
                <input
                  type="hidden"
                  name="op"
                  value={favorite ? "unfavorite" : "favorite"}
                />
                <input type="hidden" name="photoId" value={id} />
                <input type="hidden" name="returnTo" value={here} />
                <button
                  className={favorite ? "btn-primary" : "btn-ghost"}
                  type="submit"
                  aria-pressed={favorite}
                >
                  {favorite ? "★ Favorited" : "☆ Favorite"}
                </button>
              </form>
              <a className="btn-ghost" href={`/api/photos/${id}/original?download=1`}>
                Download original
              </a>
            </div>
          </div>

          <section className="card p-4">
            <h2 className="mb-2 font-semibold">Jersey numbers</h2>
            {photo.status === "queued" || photo.status === "processing" ? (
              <p className="mb-2 text-sm text-brand-2">
                Analysis is {photo.status === "queued" ? "waiting to start" : "running"}
                . You can still add numbers by hand.
              </p>
            ) : null}
            {photo.status === "failed" ? (
              <div className="mb-3 rounded-md border border-low/50 bg-low/10 p-2 text-sm">
                <p>Analysis failed: {photo.error}</p>
                <form action={retryFailedAction} className="mt-2">
                  <input type="hidden" name="photoId" value={id} />
                  <input type="hidden" name="returnTo" value={here} />
                  <button className="btn-danger" type="submit">
                    Retry
                  </button>
                </form>
              </div>
            ) : null}
            <DetectionEditor
              photoId={id}
              detections={detections}
              thresholds={t}
              returnTo={here}
              teams={editorTeams(photo)}
            />
          </section>

          <section className="card p-4">
            <h2 className="mb-2 font-semibold">Players</h2>
            {players.length === 0 ? (
              <p className="text-sm text-muted">
                No named player. Players are matched by jersey number for{" "}
                {photo.team_name}, {photo.season_name}, or tagged with Select photos →
                Assign.
              </p>
            ) : (
              <ul className="space-y-2">
                {players.map((p) => (
                  <li
                    key={`${p.id}-${p.via}`}
                    className="flex flex-wrap items-center gap-2 text-sm"
                  >
                    <Link className="font-semibold underline" href={`/players/${p.id}`}>
                      {p.jersey_number ? `#${p.jersey_number} — ` : ""}
                      {p.name}
                    </Link>
                    <span className="text-xs text-muted">
                      {p.via === "tag" ? "tagged by hand" : "by jersey number"}
                    </span>
                    {p.via === "tag" ? (
                      <form action={photoAction}>
                        <input type="hidden" name="op" value="untag_player" />
                        <input type="hidden" name="photoId" value={id} />
                        <input type="hidden" name="playerId" value={p.id} />
                        <input type="hidden" name="returnTo" value={here} />
                        <button className="text-xs text-low underline" type="submit">
                          untag
                        </button>
                      </form>
                    ) : null}
                    <form action={photoAction}>
                      <input type="hidden" name="op" value="profile_photo" />
                      <input type="hidden" name="photoId" value={id} />
                      <input type="hidden" name="playerId" value={p.id} />
                      <input type="hidden" name="returnTo" value={here} />
                      <button className="text-xs text-muted underline" type="submit">
                        use as profile photo
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-4">
            <h2 className="mb-2 font-semibold">Review</h2>
            <div className="flex flex-wrap gap-2">
              <FlagButton
                photoId={id}
                op="reviewed"
                label="✓ Mark reviewed"
                returnTo={here}
              />
              <FlagButton
                photoId={id}
                op="no_jersey"
                label="No jersey visible"
                returnTo={here}
              />
              {photo.unusable === 1 ? (
                <FlagButton
                  photoId={id}
                  op="usable"
                  label="Mark usable again"
                  returnTo={here}
                />
              ) : (
                <FlagButton
                  photoId={id}
                  op="unusable"
                  label="Mark unusable"
                  returnTo={here}
                />
              )}
              <form action={reanalyzeAction}>
                <input type="hidden" name="photoId" value={id} />
                <input type="hidden" name="returnTo" value={here} />
                <button className="btn-ghost" type="submit">
                  Re-analyze
                </button>
              </form>
            </div>
            {photo.reviewed_at ? (
              <p className="mt-2 text-xs text-muted">
                Reviewed {new Date(photo.reviewed_at).toLocaleString("en-US")}
              </p>
            ) : null}
          </section>

          <section className="card p-4">
            <h2 className="mb-2 font-semibold">Details</h2>
            <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-sm">
              {meta
                .filter(([, v]) => v !== null && v !== "")
                .map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted">{k}</dt>
                    <dd className="break-words">{v}</dd>
                  </div>
                ))}
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
