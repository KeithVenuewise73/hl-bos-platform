import type { Db } from "../db-core.ts";
import { IN_GALLERY } from "./sql.ts";

export interface DashboardStats {
  photos: number;
  events: number;
  players: number;
  numbers: number;
  needsReview: number;
  processing: number;
  failed: number;
}

export function dashboardStats(db: Db, org: string, medium: number): DashboardStats {
  return (
    db.get<DashboardStats>(
      `select
         (select count(*) from photos where organization_id = :org) as photos,
         (select count(*) from events where organization_id = :org) as events,
         (select count(*) from players where organization_id = :org) as players,
         (select count(distinct d.detected_value) from photo_detections d join photos p on p.id = d.photo_id
           where d.organization_id = :org and p.unusable = 0 and ${IN_GALLERY("d")}) as numbers,
         (select count(*) from photos where organization_id = :org and status = 'needs_review') as needsReview,
         (select count(*) from photos where organization_id = :org and status in ('uploaded','queued','processing')) as processing,
         (select count(*) from photos where organization_id = :org and status = 'failed') as failed`,
      { org, medium },
    ) ?? {
      photos: 0,
      events: 0,
      players: 0,
      numbers: 0,
      needsReview: 0,
      processing: 0,
      failed: 0,
    }
  );
}

export function recentUploads(db: Db, org: string, limit = 12) {
  return db.all<{
    id: string;
    original_filename: string;
    event_name: string;
    uploaded_at: string;
    status: string;
  }>(
    `select p.id, p.original_filename, e.name as event_name, p.uploaded_at, p.status
       from photos p join events e on e.id = p.event_id
      where p.organization_id = :org order by p.uploaded_at desc, p.id limit :limit`,
    { org, limit },
  );
}

export interface Progress {
  total: number;
  done: number;
  queued: number;
  processing: number;
  failed: number;
  needsReview: number;
}

/** Analysis progress for one event, or the whole organization. */
export function progress(db: Db, org: string, eventId: string | null): Progress {
  return (
    db.get<Progress>(
      `select count(*) as total,
              coalesce(sum(status in ('completed','needs_review','failed')), 0) as done,
              coalesce(sum(status in ('uploaded','queued')), 0) as queued,
              coalesce(sum(status = 'processing'), 0) as processing,
              coalesce(sum(status = 'failed'), 0) as failed,
              coalesce(sum(status = 'needs_review'), 0) as needsReview
         from photos where organization_id = :org and (:event is null or event_id = :event)`,
      { org, event: eventId },
    ) ?? { total: 0, done: 0, queued: 0, processing: 0, failed: 0, needsReview: 0 }
  );
}

export function members(db: Db, org: string) {
  return db.all<{ id: string; display_name: string; email: string; role: string }>(
    `select u.id, u.display_name, u.email, m.role from memberships m join users u on u.id = m.user_id
      where m.organization_id = :org order by m.created_at`,
    { org },
  );
}

export function teamsAndSports(db: Db, org: string) {
  return {
    teams: db.all<{ id: string; name: string }>(
      "select id, name from teams where organization_id = :org order by name",
      { org },
    ),
    sports: db
      .all<{ sport: string }>(
        "select distinct sport from events where organization_id = :org order by sport",
        { org },
      )
      .map((r) => r.sport),
    seasons: db
      .all<{ name: string }>(
        "select name from seasons where organization_id = :org order by name desc",
        { org },
      )
      .map((r) => r.name),
  };
}
