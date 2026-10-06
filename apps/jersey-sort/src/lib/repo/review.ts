/**
 * Every human correction to the AI, and the status recalculation after it.
 *
 * Detections are never deleted by a person: "delete number" marks the row
 * REJECTED, and "change number" rejects the old reading and adds a confirmed
 * manual one. So the record shows what the AI said and what a person decided,
 * and re-running analysis cannot resurrect a number someone threw out.
 *
 * After every change the photo's status is recomputed by `analyzedStatus`
 * from @hl-bos/jersey-sort — the same rule the pipeline uses — so a photo
 * leaves the review queue exactly when the rule says it should.
 */

import {
  analyzedStatus,
  normalizeJerseyNumber,
  type ConfidenceThresholds,
  type JerseyShade,
  type DetectionStatus,
} from "@hl-bos/jersey-sort";

import { newId, type Db } from "../db-core.ts";
import { ValidationError } from "./events.ts";

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

export function recomputeStatus(
  db: Db,
  org: string,
  photoId: string,
  t: ConfidenceThresholds,
): void {
  const photo = db.get<{
    status: string;
    athletes_present: number | null;
    no_jersey_visible: number;
    unusable: number;
    reviewed_at: string | null;
  }>(
    "select status, athletes_present, no_jersey_visible, unusable, reviewed_at from photos where id = :id and organization_id = :org",
    { id: photoId, org },
  );
  // Only analysed photos have a review status. Queued, processing and failed
  // photos keep theirs; a manual tag does not pretend analysis happened.
  if (
    photo === undefined ||
    (photo.status !== "completed" && photo.status !== "needs_review")
  )
    return;
  const detections = db.all<{
    value: string;
    confidence: number;
    status: DetectionStatus;
  }>(
    "select detected_value as value, confidence, status from photo_detections where photo_id = :id",
    { id: photoId },
  );
  const status = analyzedStatus(
    {
      detections,
      athletesPresent:
        photo.athletes_present === null ? null : photo.athletes_present === 1,
      noJerseyVisible: photo.no_jersey_visible === 1,
      unusable: photo.unusable === 1,
      reviewed: photo.reviewed_at !== null,
    },
    t,
  );
  if (status !== photo.status) {
    db.run(`update photos set status = :s, updated_at = ${NOW} where id = :id`, {
      s: status,
      id: photoId,
    });
  }
}

function ownDetection(
  db: Db,
  org: string,
  detectionId: string,
): { photo_id: string; detected_value: string; jersey: JerseyShade | null } {
  const row = db.get<{
    photo_id: string;
    detected_value: string;
    jersey: JerseyShade | null;
  }>(
    "select photo_id, detected_value, jersey from photo_detections where id = :id and organization_id = :org",
    { id: detectionId, org },
  );
  if (row === undefined) throw new ValidationError("That number was not found.");
  return row;
}

export function confirmDetection(
  db: Db,
  org: string,
  detectionId: string,
  t: ConfidenceThresholds,
): string {
  return db.tx(() => {
    const { photo_id } = ownDetection(db, org, detectionId);
    db.run(
      `update photo_detections set status = 'confirmed', updated_at = ${NOW} where id = :id`,
      { id: detectionId },
    );
    recomputeStatus(db, org, photo_id, t);
    return photo_id;
  });
}

export function rejectDetection(
  db: Db,
  org: string,
  detectionId: string,
  t: ConfidenceThresholds,
): string {
  return db.tx(() => {
    const { photo_id } = ownDetection(db, org, detectionId);
    db.run(
      `update photo_detections set status = 'rejected', updated_at = ${NOW} where id = :id`,
      { id: detectionId },
    );
    recomputeStatus(db, org, photo_id, t);
    return photo_id;
  });
}

/**
 * Add a number a person typed. Confirmed by definition; replaces an existing
 * reading of the same number.
 *
 * `jersey` says which team (light or dark jersey) when the person knows it.
 * Without it the number has no team in a two-team game, exactly as an AI
 * reading of an unseen jersey has none. With it, a team-less reading of the
 * same number is retired (rejected, so it stays inspectable) in favour of the
 * person's: "this #22 is the dark #22".
 */
export function addNumber(
  db: Db,
  org: string,
  userId: string,
  photoId: string,
  raw: string,
  t: ConfidenceThresholds,
  jersey: JerseyShade | null = null,
): string {
  const value = normalizeJerseyNumber(raw);
  if (value === null)
    throw new ValidationError("A jersey number is one or two digits, 0–99 or 00.");
  db.tx(() => {
    const owned = db.get(
      "select 1 from photos where id = :id and organization_id = :org",
      { id: photoId, org },
    );
    if (owned === undefined) throw new ValidationError("That photo was not found.");
    const existing = db.get<{ id: string }>(
      jersey === null
        ? "select id from photo_detections where photo_id = :id and detected_value = :v order by status = 'rejected' limit 1"
        : "select id from photo_detections where photo_id = :id and detected_value = :v and jersey = :j order by status = 'rejected' limit 1",
      { id: photoId, v: value, j: jersey },
    );
    if (existing !== undefined) {
      db.run(
        `update photo_detections set status = 'confirmed', updated_at = ${NOW} where id = :id`,
        { id: existing.id },
      );
    } else {
      if (jersey !== null) {
        db.run(
          `update photo_detections set status = 'rejected', updated_at = ${NOW}
            where photo_id = :id and detected_value = :v and jersey is null and status != 'rejected'`,
          { id: photoId, v: value },
        );
      }
      db.run(
        `insert into photo_detections (id, organization_id, photo_id, detected_value, confidence, method, provider, status, created_by, jersey)
         values (:id, :org, :photo, :v, 1, 'manual', 'person', 'confirmed', :user, :j)`,
        { id: newId(), org, photo: photoId, v: value, user: userId, j: jersey },
      );
    }
    // A person who sees a number has decided there is a jersey to see.
    db.run(
      `update photos set no_jersey_visible = 0, updated_at = ${NOW} where id = :id`,
      { id: photoId },
    );
    recomputeStatus(db, org, photoId, t);
  });
  return value;
}

/** Say which team (by jersey) a reading belongs to: "this #22 is the dark #22". */
export function setDetectionJersey(
  db: Db,
  org: string,
  userId: string,
  detectionId: string,
  jersey: JerseyShade,
  t: ConfidenceThresholds,
): string {
  return db.tx(() => {
    const d = ownDetection(db, org, detectionId);
    if (d.jersey !== jersey) {
      db.run(
        `update photo_detections set status = 'rejected', updated_at = ${NOW} where id = :id`,
        { id: detectionId },
      );
    }
    addNumber(db, org, userId, d.photo_id, d.detected_value, t, jersey);
    return d.photo_id;
  });
}

/**
 * "These #24s are Caz's": give every #24 in one event whose team is not
 * known the chosen jersey. One click per number per game for a person
 * working through what local OCR (which cannot see jerseys) found. Each
 * reading is retired and replaced as setDetectionJersey does, so nothing the
 * AI said is rewritten. Returns how many photos it changed.
 */
export function assignNumberJersey(
  db: Db,
  org: string,
  userId: string,
  eventId: string,
  raw: string,
  jersey: JerseyShade,
  t: ConfidenceThresholds,
): number {
  const value = normalizeJerseyNumber(raw);
  if (value === null)
    throw new ValidationError("A jersey number is one or two digits, 0–99 or 00.");
  return db.tx(() => {
    const rows = db.all<{ id: string; photo_id: string }>(
      `select d.id, d.photo_id from photo_detections d join photos p on p.id = d.photo_id
        where p.event_id = :event and p.organization_id = :org and d.detected_value = :v
          and d.jersey is null and d.status != 'rejected'`,
      { event: eventId, org, v: value },
    );
    for (const r of rows) setDetectionJersey(db, org, userId, r.id, jersey, t);
    return new Set(rows.map((r) => r.photo_id)).size;
  });
}

export function changeNumber(
  db: Db,
  org: string,
  userId: string,
  detectionId: string,
  raw: string,
  t: ConfidenceThresholds,
): string {
  return db.tx(() => {
    const { photo_id, jersey } = ownDetection(db, org, detectionId);
    const value = normalizeJerseyNumber(raw);
    if (value === null)
      throw new ValidationError("A jersey number is one or two digits, 0–99 or 00.");
    db.run(
      `update photo_detections set status = 'rejected', updated_at = ${NOW} where id = :id`,
      { id: detectionId },
    );
    // Same athlete, number misread: the jersey (and so the team) carries over.
    addNumber(db, org, userId, photo_id, value, t, jersey);
    return photo_id;
  });
}

/** Take a number off photos (bulk "remove tag"). */
export function removeNumber(
  db: Db,
  org: string,
  photoIds: readonly string[],
  raw: string,
  t: ConfidenceThresholds,
): void {
  const value = normalizeJerseyNumber(raw);
  if (value === null)
    throw new ValidationError("A jersey number is one or two digits, 0–99 or 00.");
  db.tx(() => {
    for (const id of photoIds) {
      db.run(
        `update photo_detections set status = 'rejected', updated_at = ${NOW}
          where photo_id = :id and organization_id = :org and detected_value = :v and status != 'rejected'`,
        { id, org, v: value },
      );
      recomputeStatus(db, org, id, t);
    }
  });
}

export type PhotoFlag = "no_jersey" | "unusable" | "usable" | "reviewed" | "skip";

export function flagPhoto(
  db: Db,
  org: string,
  userId: string,
  photoId: string,
  flag: PhotoFlag,
  t: ConfidenceThresholds,
): void {
  db.tx(() => {
    const owned = db.get(
      "select 1 from photos where id = :id and organization_id = :org",
      { id: photoId, org },
    );
    if (owned === undefined) throw new ValidationError("That photo was not found.");
    const p = { id: photoId, user: userId };
    switch (flag) {
      case "no_jersey":
        db.run(
          `update photo_detections set status = 'rejected', updated_at = ${NOW} where photo_id = :id and status = 'suggested'`,
          { id: photoId },
        );
        db.run(
          `update photos set no_jersey_visible = 1, reviewed_at = ${NOW}, reviewed_by = :user, updated_at = ${NOW} where id = :id`,
          p,
        );
        break;
      case "unusable":
        db.run(
          `update photos set unusable = 1, reviewed_at = ${NOW}, reviewed_by = :user, updated_at = ${NOW} where id = :id`,
          p,
        );
        break;
      case "usable":
        db.run(`update photos set unusable = 0, updated_at = ${NOW} where id = :id`, p);
        break;
      case "reviewed":
        // "Done": what is left is accepted as it stands. Remaining
        // suggestions in the gallery bands are confirmed; low ones that the
        // person did not confirm are rejected, so nothing stays half-decided.
        db.run(
          `update photo_detections set status = case when confidence >= (
              select medium_threshold from organization_settings where organization_id = :org
            ) then 'confirmed' else 'rejected' end, updated_at = ${NOW}
            where photo_id = :id and status = 'suggested'`,
          { id: photoId, org },
        );
        db.run(
          `update photos set reviewed_at = ${NOW}, reviewed_by = :user, skipped_at = null, updated_at = ${NOW} where id = :id`,
          p,
        );
        break;
      case "skip":
        db.run(`update photos set skipped_at = ${NOW} where id = :id`, p);
        return;
    }
    recomputeStatus(db, org, photoId, t);
  });
}

/** Re-sort every analysed photo after thresholds change. */
export function recomputeAll(db: Db, org: string, t: ConfidenceThresholds): number {
  const ids = db.all<{ id: string }>(
    "select id from photos where organization_id = :org and status in ('completed','needs_review')",
    { org },
  );
  db.tx(() => {
    for (const { id } of ids) recomputeStatus(db, org, id, t);
  });
  return ids.length;
}

export interface QueueItem {
  photo_id: string;
  event_id: string;
}

/** The next photo to review: never-skipped first, then oldest skip; in upload order. */
export function nextInQueue(
  db: Db,
  org: string,
  eventId: string | null,
  after: string | null,
): QueueItem | undefined {
  return db.get<QueueItem>(
    `select photo_id, event_id from review_queue
      where organization_id = :org and (:event is null or event_id = :event) and (:after is null or photo_id != :after)
      order by skipped_at is not null, skipped_at, uploaded_at, photo_id
      limit 1`,
    { org, event: eventId, after },
  );
}

export function queueCount(db: Db, org: string, eventId: string | null): number {
  return (
    db.get<{ n: number }>(
      "select count(*) as n from review_queue where organization_id = :org and (:event is null or event_id = :event)",
      { org, event: eventId },
    )?.n ?? 0
  );
}
