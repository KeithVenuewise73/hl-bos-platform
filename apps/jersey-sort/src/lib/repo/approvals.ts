/**
 * Review before publishing: which photos a person has approved for the website.
 *
 * Three states, kept in photo_approvals (local-only, see db-core.ts):
 *   pending   no row. Every photo starts here, old ones too.
 *   approved  only these may be uploaded to 5starsportsmedia.com.
 *   rejected  kept in JerseySort, never published, with an optional reason.
 *
 * Only the OWNER decides. That is checked here, in the data layer, not in the
 * page: a page that hid a button would protect nothing from a request sent
 * some other way. Every query takes the organization from the signed-in
 * session and is scoped to it.
 *
 * A photo can be decided only when it is READY to publish: usable and with its
 * web-size preview made. (Those are exactly the photos publishing would upload.)
 */

import type { Db, Params } from "../db-core.ts";
import { ownedPhotoIds } from "./photos.ts";
import { parseFlags } from "./quality.ts";

export type Role = "owner" | "member";
export type ApprovalStatus = "pending" | "approved" | "rejected";

/** The person is signed in but is not allowed to do this. */
export class NotAllowed extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotAllowed";
  }
}

/** A photo that could be published: usable, with its web-size preview made. */
export const READY = "p.unusable = 0 and p.preview_path is not null";

/**
 * For publishing: only approved photos. Used in a query that names the photos
 * table `photos` with no alias.
 */
export const APPROVED_PHOTO =
  "exists (select 1 from photo_approvals pa where pa.photo_id = photos.id and pa.status = 'approved')";

function mustBeOwner(role: Role, what: string): void {
  if (role !== "owner") {
    throw new NotAllowed(`Only the owner can ${what}.`);
  }
}

export interface ReviewCounts {
  readonly pending: number;
  readonly approved: number;
  readonly rejected: number;
  /** Not ready to publish yet: still being processed, or marked unusable. */
  readonly notReady: number;
}

const COUNTS_SQL = `
  select
    coalesce(sum(case when ${READY} and a.status is null then 1 else 0 end), 0) as pending,
    coalesce(sum(case when ${READY} and a.status = 'approved' then 1 else 0 end), 0) as approved,
    coalesce(sum(case when ${READY} and a.status = 'rejected' then 1 else 0 end), 0) as rejected,
    coalesce(sum(case when ${READY} then 0 else 1 end), 0) as notReady
  from photos p left join photo_approvals a on a.photo_id = p.id`;

export function reviewCounts(db: Db, org: string, eventId: string): ReviewCounts {
  return (
    db.get<ReviewCounts>(
      `${COUNTS_SQL} where p.organization_id = :org and p.event_id = :e`,
      { org, e: eventId },
    ) ?? { pending: 0, approved: 0, rejected: 0, notReady: 0 }
  );
}

export interface GameForReview extends ReviewCounts {
  readonly id: string;
  readonly name: string;
  readonly sport: string;
  readonly teamName: string;
  readonly eventDate: string;
  /** Other games the same day: a day with more than one is worth a second look at its labels. */
  readonly sameDay: number;
}

/** Every game with its review counts, newest first. */
export function gamesForReview(db: Db, org: string): GameForReview[] {
  return db.all<GameForReview>(
    `select e.id, e.name, e.sport, t.name as teamName, e.event_date as eventDate,
            coalesce(sum(case when ${READY} and a.status is null then 1 else 0 end), 0) as pending,
            coalesce(sum(case when ${READY} and a.status = 'approved' then 1 else 0 end), 0) as approved,
            coalesce(sum(case when ${READY} and a.status = 'rejected' then 1 else 0 end), 0) as rejected,
            coalesce(sum(case when p.id is not null and not (${READY}) then 1 else 0 end), 0) as notReady,
            (select count(*) - 1 from events o
              where o.organization_id = e.organization_id and o.event_date = e.event_date) as sameDay
       from events e
       join teams t on t.id = e.team_id
       left join photos p on p.event_id = e.id
       left join photo_approvals a on a.photo_id = p.id
      where e.organization_id = :org
      group by e.id
      order by e.event_date desc, e.name`,
    { org },
  );
}

/** Photos still waiting for a decision, across every game: for a badge. */
export function pendingTotal(db: Db, org: string): number {
  return organizationCounts(db, org).pending;
}
function organizationCounts(db: Db, org: string): ReviewCounts {
  return (
    db.get<ReviewCounts>(`${COUNTS_SQL} where p.organization_id = :org`, { org }) ?? {
      pending: 0,
      approved: 0,
      rejected: 0,
      notReady: 0,
    }
  );
}

export type ReviewFilter = ApprovalStatus | "all";

export interface ReviewTile {
  readonly id: string;
  readonly filename: string;
  readonly capturedAt: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly status: ApprovalStatus;
  readonly reason: string | null;
  /** Quality hints (see quality-core.ts); empty until they have been worked out. */
  readonly flags: readonly string[];
  readonly qualityChecked: boolean;
}

interface TileRow {
  id: string;
  filename: string;
  capturedAt: string;
  width: number | null;
  height: number | null;
  approval: "approved" | "rejected" | null;
  reason: string | null;
  flags: string | null;
}

export const REVIEW_PAGE = 60;

/** One game's photos for review, in the order they were taken. */
export function reviewPhotos(
  db: Db,
  org: string,
  eventId: string,
  filter: ReviewFilter,
  offset = 0,
  limit = REVIEW_PAGE,
): { tiles: ReviewTile[]; total: number } {
  const where =
    filter === "pending"
      ? "and a.status is null"
      : filter === "all"
        ? ""
        : "and a.status = :status";
  const params: Params = { org, e: eventId, status: filter, limit, offset };
  const base = `from photos p
       left join photo_approvals a on a.photo_id = p.id
       left join photo_quality q on q.photo_id = p.id
      where p.organization_id = :org and p.event_id = :e and ${READY} ${where}`;
  const total = db.get<{ n: number }>(`select count(*) as n ${base}`, params)?.n ?? 0;
  const rows = db.all<TileRow>(
    `select p.id, p.original_filename as filename, p.captured_at as capturedAt,
            p.width, p.height, a.status as approval, a.reason, q.flags
       ${base}
      order by p.captured_at, p.id limit :limit offset :offset`,
    params,
  );
  return {
    total,
    tiles: rows.map((r) => ({
      id: r.id,
      filename: r.filename,
      capturedAt: r.capturedAt,
      width: r.width,
      height: r.height,
      status: r.approval ?? "pending",
      reason: r.reason,
      flags: parseFlags(r.flags),
      qualityChecked: r.flags !== null,
    })),
  };
}

export interface DecideResult {
  /** Photos whose decision was written. */
  readonly changed: number;
  /** Photos asked about that were skipped: not this organization's, or not ready to publish. */
  readonly skipped: number;
}

/** Of these ids, the ones that are this organization's and ready to publish. */
function decidable(db: Db, org: string, ids: readonly string[]): string[] {
  const mine = ownedPhotoIds(db, org, ids);
  if (mine.length === 0) return [];
  const params: Params = { org };
  const keys = mine.map((id, i) => {
    params[`p${i}`] = id;
    return `:p${i}`;
  });
  return db
    .all<{ id: string }>(
      `select p.id from photos p where p.organization_id = :org and ${READY} and p.id in (${keys.join(",")})`,
      params,
    )
    .map((r) => r.id);
}

const write = (
  db: Db,
  org: string,
  userId: string,
  ids: readonly string[],
  status: "approved" | "rejected",
  reason: string | null,
): number =>
  db.tx(() => {
    let n = 0;
    for (const id of ids) {
      db.run(
        `insert into photo_approvals (photo_id, organization_id, status, reason, decided_by, decided_at)
         values (:id, :org, :status, :reason, :by, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
         on conflict (photo_id) do update set
           status = excluded.status, reason = excluded.reason,
           decided_by = excluded.decided_by, decided_at = excluded.decided_at`,
        { id, org, status, reason, by: userId },
      );
      n += 1;
    }
    return n;
  });

/** Approve photos for the website. Owner only. */
export function approvePhotos(
  db: Db,
  org: string,
  userId: string,
  role: Role,
  photoIds: readonly string[],
): DecideResult {
  mustBeOwner(role, "approve photos for the website");
  const ids = decidable(db, org, photoIds);
  return {
    changed: write(db, org, userId, ids, "approved", null),
    skipped: photoIds.length - ids.length,
  };
}

/** Reject photos: kept here, never published. Owner only. */
export function rejectPhotos(
  db: Db,
  org: string,
  userId: string,
  role: Role,
  photoIds: readonly string[],
  reason = "",
): DecideResult {
  mustBeOwner(role, "reject photos");
  const ids = decidable(db, org, photoIds);
  const why = reason.trim().slice(0, 200);
  return {
    changed: write(db, org, userId, ids, "rejected", why === "" ? null : why),
    skipped: photoIds.length - ids.length,
  };
}

/** Back to pending: the decision is taken away. Owner only. */
export function resetPhotos(
  db: Db,
  org: string,
  role: Role,
  photoIds: readonly string[],
): number {
  mustBeOwner(role, "change a decision");
  const mine = ownedPhotoIds(db, org, photoIds);
  return db.tx(() => {
    let n = 0;
    for (const id of mine) {
      n += db.run(
        "delete from photo_approvals where photo_id = :id and organization_id = :org",
        {
          id,
          org,
        },
      ).changes;
    }
    return n;
  });
}

/**
 * Approve every photo of a game that is still pending. Rejected photos stay
 * rejected: "approve the rest" never overrides a decision already made.
 * Owner only.
 */
export function approveRemaining(
  db: Db,
  org: string,
  userId: string,
  role: Role,
  eventId: string,
): number {
  mustBeOwner(role, "approve photos for the website");
  const ids = db
    .all<{ id: string }>(
      `select p.id from photos p left join photo_approvals a on a.photo_id = p.id
        where p.organization_id = :org and p.event_id = :e and ${READY} and a.status is null`,
      { org, e: eventId },
    )
    .map((r) => r.id);
  return write(db, org, userId, ids, "approved", null);
}

/**
 * Taking a photo out of one game and putting it in another changes what it is
 * labelled as, so any decision made under the old label no longer holds. Called
 * when photos are moved: they go back to pending.
 */
export function resetAfterRelabel(
  db: Db,
  org: string,
  photoIds: readonly string[],
): void {
  const mine = ownedPhotoIds(db, org, photoIds);
  for (const id of mine) {
    db.run(
      "delete from photo_approvals where photo_id = :id and organization_id = :org",
      {
        id,
        org,
      },
    );
  }
}
