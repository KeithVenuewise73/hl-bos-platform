/**
 * The analysis queue.
 *
 * The queue IS the photos table: a photo with status 'queued' is waiting.
 * Claiming one is a single UPDATE … RETURNING, so two workers can never take
 * the same photo. A photo left 'processing' by a crash or restart is put back
 * to 'queued' when the worker starts. Every attempt is recorded in
 * ai_analysis_jobs with its provider, result or error.
 *
 * Human decisions survive re-analysis: a number someone confirmed or rejected
 * is never re-suggested or overwritten; only the previous AI suggestions are
 * replaced.
 *
 * Free of `server-only`; the provider is passed in, so tests run it with a
 * scripted provider and the real database code.
 */

import {
  analyzePhoto,
  type ConfidenceThresholds,
  type ImageAnalysisProvider,
} from "@hl-bos/jersey-sort";

import { newId, nowIso, type Db } from "./db-core.ts";
import { recomputeStatus } from "./repo/review.ts";
import { getSettings } from "./repo/settings.ts";
import { getObject } from "./storage.ts";

export interface QueueDeps {
  readonly db: Db;
  readonly dataDir: string;
  /** Resolve the provider for an organization; null = "no automatic analysis". Throws if unavailable. */
  readonly provider: (org: string) => ImageAnalysisProvider | null;
}

export function recoverInterrupted(db: Db): number {
  return db.run("update photos set status = 'queued' where status = 'processing'")
    .changes;
}

export function claimNext(db: Db): { id: string; organization_id: string } | undefined {
  return db.get<{ id: string; organization_id: string }>(
    `update photos set status = 'processing', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      where id = (select id from photos where status = 'queued' order by uploaded_at, id limit 1)
      returning id, organization_id`,
  );
}

export async function processPhoto(
  deps: QueueDeps,
  photoId: string,
  org: string,
): Promise<void> {
  const { db } = deps;
  const photo = db.get<{
    preview_path: string | null;
    width: number | null;
    height: number | null;
  }>(
    "select preview_path, width, height from photos where id = :id and organization_id = :org",
    { id: photoId, org },
  );
  if (photo === undefined) return;
  const thresholds: ConfidenceThresholds = getSettings(db, org).thresholds;

  let provider: ImageAnalysisProvider | null;
  try {
    provider = deps.provider(org);
  } catch (e) {
    fail(
      db,
      photoId,
      e instanceof Error ? e.message : "The analysis provider is not available.",
    );
    return;
  }

  if (provider === null) {
    db.tx(() => {
      db.run(
        `update photos set status = 'needs_review', athletes_present = null, athlete_count = null,
           analysis_notes = 'Automatic analysis is switched off; add numbers by hand.', error = null,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where id = :id`,
        { id: photoId },
      );
      recomputeStatus(db, org, photoId, thresholds);
    });
    return;
  }

  const jobId = newId();
  db.run(
    `insert into ai_analysis_jobs (id, organization_id, photo_id, provider, provider_model, status, started_at)
     values (:id, :org, :photo, :p, :m, 'running', :t)`,
    {
      id: jobId,
      org,
      photo: photoId,
      p: provider.info.id,
      m: provider.info.model,
      t: nowIso(),
    },
  );

  try {
    if (photo.preview_path === null)
      throw new Error("This photo has no preview to analyse.");
    const bytes = await getObject(deps.dataDir, photo.preview_path);
    const analysis = await analyzePhoto(
      provider,
      {
        bytes,
        mimeType: "image/jpeg",
        width: photo.width ?? 0,
        height: photo.height ?? 0,
      },
      thresholds,
    );
    db.tx(() => {
      db.run(
        "delete from photo_detections where photo_id = :id and status = 'suggested' and method != 'manual'",
        { id: photoId },
      );
      const decided = new Set(
        db
          .all<{ v: string }>(
            "select detected_value as v from photo_detections where photo_id = :id",
            { id: photoId },
          )
          .map((r) => r.v),
      );
      for (const d of analysis.detections) {
        if (decided.has(d.value)) continue;
        db.run(
          `insert into photo_detections (id, organization_id, photo_id, detected_value, confidence, bounding_box, location,
             method, provider, provider_model, status)
           values (:id, :org, :photo, :v, :c, :box, :loc, :method, :p, :m, 'suggested')`,
          {
            id: newId(),
            org,
            photo: photoId,
            v: d.value,
            c: d.confidence,
            box: d.box === null ? null : JSON.stringify(d.box),
            loc: d.location,
            method: d.method,
            p: analysis.provider,
            m: analysis.providerModel,
          },
        );
      }
      db.run(
        `update photos set status = 'needs_review', error = null, attempts = attempts + 1,
           athletes_present = :ap, athlete_count = :ac, analysis_notes = :notes,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where id = :id`,
        {
          id: photoId,
          ap:
            analysis.athletesPresent === null ? null : analysis.athletesPresent ? 1 : 0,
          ac: analysis.athleteCount,
          notes: analysis.notes,
        },
      );
      recomputeStatus(db, org, photoId, thresholds);
      db.run(
        "update ai_analysis_jobs set status = 'succeeded', finished_at = :t, result_json = :r where id = :id",
        {
          id: jobId,
          t: nowIso(),
          r: JSON.stringify({
            detections: analysis.detections,
            rejected: analysis.rejected,
            notes: analysis.notes,
          }),
        },
      );
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Analysis failed.";
    db.run(
      "update ai_analysis_jobs set status = 'failed', finished_at = :t, error = :e where id = :id",
      {
        id: jobId,
        t: nowIso(),
        e: message.slice(0, 1000),
      },
    );
    fail(db, photoId, message);
  }
}

function fail(db: Db, photoId: string, message: string): void {
  db.run(
    `update photos set status = 'failed', error = :e, attempts = attempts + 1,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where id = :id`,
    { id: photoId, e: message.slice(0, 1000) },
  );
}

/** Retry: failed photos (all, one event, or one photo) go back in the queue. */
export function retryFailed(
  db: Db,
  org: string,
  scope: { eventId?: string; photoId?: string },
): number {
  return db.run(
    `update photos set status = 'queued', error = null
      where organization_id = :org and status = 'failed' and preview_path is not null
        and (:event is null or event_id = :event) and (:photo is null or id = :photo)`,
    { org, event: scope.eventId ?? null, photo: scope.photoId ?? null },
  ).changes;
}

/** Re-analyse photos (e.g. after switching provider). Human decisions are kept. */
export function reanalyze(
  db: Db,
  org: string,
  scope: { eventId?: string; photoId?: string },
): number {
  return db.run(
    `update photos set status = 'queued', error = null
      where organization_id = :org and status in ('completed','needs_review','failed') and preview_path is not null
        and (:event is null or event_id = :event) and (:photo is null or id = :photo)`,
    { org, event: scope.eventId ?? null, photo: scope.photoId ?? null },
  ).changes;
}

/** Drain the queue with `concurrency` workers. Resolves when nothing is queued. */
export async function drain(deps: QueueDeps, concurrency: number): Promise<number> {
  let processed = 0;
  const loop = async () => {
    for (;;) {
      const next = claimNext(deps.db);
      if (next === undefined) return;
      await processPhoto(deps, next.id, next.organization_id);
      processed += 1;
    }
  };
  await Promise.all(Array.from({ length: concurrency }, loop));
  return processed;
}
