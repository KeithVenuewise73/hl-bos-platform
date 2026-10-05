import type { Db } from "../db-core.ts";
import { newId } from "../db-core.ts";
import { IN_GALLERY } from "./sql.ts";

export interface EventInput {
  readonly name: string;
  readonly sport: string;
  readonly teamName: string;
  readonly opponent: string;
  readonly eventDate: string; // YYYY-MM-DD
  readonly location: string;
  readonly season: string;
  readonly notes: string;
}

export interface EventRow {
  id: string;
  name: string;
  sport: string;
  team_id: string;
  team_name: string;
  season_id: string;
  season_name: string;
  opponent: string | null;
  event_date: string;
  location: string | null;
  notes: string | null;
  created_at: string;
}

export interface EventSummary extends EventRow {
  photo_count: number;
  review_count: number;
  processing_count: number;
  failed_count: number;
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

const trimTo = (s: string, n: number) => s.trim().slice(0, n);

export function validateEventInput(raw: EventInput): EventInput {
  const name = trimTo(raw.name, 160);
  const sport = trimTo(raw.sport, 60);
  const teamName = trimTo(raw.teamName, 120);
  if (name.length === 0) throw new ValidationError("Give the event a name.");
  if (sport.length === 0) throw new ValidationError("Choose the sport.");
  if (teamName.length === 0) throw new ValidationError("Enter your team's name.");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(raw.eventDate) ||
    Number.isNaN(Date.parse(raw.eventDate))
  ) {
    throw new ValidationError("Enter the event date.");
  }
  const season = trimTo(raw.season, 40) || raw.eventDate.slice(0, 4);
  return {
    name,
    sport,
    teamName,
    opponent: trimTo(raw.opponent, 120),
    eventDate: raw.eventDate,
    location: trimTo(raw.location, 160),
    season,
    notes: trimTo(raw.notes, 2000),
  };
}

/** Find-or-create a team by name within the organization. */
export function teamId(
  db: Db,
  org: string,
  name: string,
  sport: string | null,
): string {
  const existing = db.get<{ id: string }>(
    "select id from teams where organization_id = :org and name = :name",
    { org, name },
  );
  if (existing !== undefined) return existing.id;
  const id = newId();
  db.run(
    "insert into teams (id, organization_id, name, sport) values (:id, :org, :name, :sport)",
    {
      id,
      org,
      name,
      sport,
    },
  );
  return id;
}

export function seasonId(db: Db, org: string, name: string): string {
  const existing = db.get<{ id: string }>(
    "select id from seasons where organization_id = :org and name = :name",
    { org, name },
  );
  if (existing !== undefined) return existing.id;
  const id = newId();
  db.run("insert into seasons (id, organization_id, name) values (:id, :org, :name)", {
    id,
    org,
    name,
  });
  return id;
}

export function createEvent(
  db: Db,
  org: string,
  userId: string,
  raw: EventInput,
): string {
  const input = validateEventInput(raw);
  return db.tx(() => {
    const id = newId();
    db.run(
      `insert into events (id, organization_id, name, sport, team_id, season_id, opponent, event_date, location, notes, created_by)
       values (:id, :org, :name, :sport, :team, :season, :opponent, :date, :location, :notes, :user)`,
      {
        id,
        org,
        name: input.name,
        sport: input.sport,
        team: teamId(db, org, input.teamName, input.sport),
        season: seasonId(db, org, input.season),
        opponent: input.opponent || null,
        date: input.eventDate,
        location: input.location || null,
        notes: input.notes || null,
        user: userId,
      },
    );
    return id;
  });
}

export function updateEvent(db: Db, org: string, id: string, raw: EventInput): void {
  const input = validateEventInput(raw);
  db.tx(() => {
    const changed = db.run(
      `update events set name = :name, sport = :sport, team_id = :team, season_id = :season, opponent = :opponent,
         event_date = :date, location = :location, notes = :notes, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       where id = :id and organization_id = :org`,
      {
        id,
        org,
        name: input.name,
        sport: input.sport,
        team: teamId(db, org, input.teamName, input.sport),
        season: seasonId(db, org, input.season),
        opponent: input.opponent || null,
        date: input.eventDate,
        location: input.location || null,
        notes: input.notes || null,
      },
    );
    if (changed.changes === 0) throw new ValidationError("That event was not found.");
  });
}

const EVENT_SELECT = `
  select e.id, e.name, e.sport, e.team_id, t.name as team_name, e.season_id, s.name as season_name,
         e.opponent, e.event_date, e.location, e.notes, e.created_at
    from events e join teams t on t.id = e.team_id join seasons s on s.id = e.season_id`;

export function getEvent(db: Db, org: string, id: string): EventRow | undefined {
  return db.get<EventRow>(
    `${EVENT_SELECT} where e.id = :id and e.organization_id = :org`,
    { id, org },
  );
}

export function listEvents(db: Db, org: string, limit = 200): EventSummary[] {
  return db.all<EventSummary>(
    `select x.*,
        (select count(*) from photos p where p.event_id = x.id) as photo_count,
        (select count(*) from photos p where p.event_id = x.id and p.status = 'needs_review') as review_count,
        (select count(*) from photos p where p.event_id = x.id and p.status in ('uploaded','queued','processing')) as processing_count,
        (select count(*) from photos p where p.event_id = x.id and p.status = 'failed') as failed_count
       from (${EVENT_SELECT} where e.organization_id = :org) x
      order by x.event_date desc, x.created_at desc
      limit :limit`,
    { org, limit },
  );
}

export interface EventStats {
  photos: number;
  needsReview: number;
  numbers: number;
  namedPlayers: number;
  favorites: number;
  unidentified: number;
}

export function eventStats(
  db: Db,
  org: string,
  eventId: string,
  medium: number,
  userId: string,
): EventStats {
  const row = db.get<EventStats>(
    `select
       (select count(*) from photos p where p.event_id = :e and p.organization_id = :org) as photos,
       (select count(*) from photos p where p.event_id = :e and p.organization_id = :org and p.status = 'needs_review') as needsReview,
       (select count(distinct d.detected_value) from photo_detections d join photos p on p.id = d.photo_id
         where p.event_id = :e and p.organization_id = :org and p.unusable = 0 and ${IN_GALLERY("d")}) as numbers,
       (select count(distinct pn.player_id) from photo_detections d join photos p on p.id = d.photo_id
          join events ev on ev.id = p.event_id
          join player_numbers pn on pn.team_id = ev.team_id and pn.season_id = ev.season_id and pn.jersey_number = d.detected_value
         where p.event_id = :e and p.organization_id = :org and p.unusable = 0 and ${IN_GALLERY("d")}) as namedPlayers,
       (select count(*) from favorites f join photos p on p.id = f.photo_id where p.event_id = :e and f.user_id = :user) as favorites,
       (select count(*) from photos p where p.event_id = :e and p.organization_id = :org
          and p.status in ('completed','needs_review') and p.no_jersey_visible = 0 and p.unusable = 0
          and not exists (select 1 from photo_detections d where d.photo_id = p.id and ${IN_GALLERY("d")})) as unidentified`,
    { e: eventId, org, medium, user: userId },
  );
  return (
    row ?? {
      photos: 0,
      needsReview: 0,
      numbers: 0,
      namedPlayers: 0,
      favorites: 0,
      unidentified: 0,
    }
  );
}

export interface NumberGroup {
  value: string;
  photo_count: number;
  needs_review: number;
  player_id: string | null;
  player_name: string | null;
}

/** Jersey galleries for one event (or the whole organization when eventId is null). */
export function numberGroups(
  db: Db,
  org: string,
  eventId: string | null,
  medium: number,
): NumberGroup[] {
  return db.all<NumberGroup>(
    `select d.detected_value as value,
            count(distinct p.id) as photo_count,
            count(distinct case when p.status = 'needs_review' then p.id end) as needs_review,
            max(pl.id) as player_id,
            max(pl.first_name || ' ' || pl.last_name) as player_name
       from photo_detections d
       join photos p on p.id = d.photo_id
       join events ev on ev.id = p.event_id
       left join player_numbers pn on pn.organization_id = p.organization_id and pn.team_id = ev.team_id
            and pn.season_id = ev.season_id and pn.jersey_number = d.detected_value and :event is not null
       left join players pl on pl.id = pn.player_id
      where p.organization_id = :org and (:event is null or p.event_id = :event)
        and p.unusable = 0 and ${IN_GALLERY("d")}
      group by d.detected_value`,
    { org, event: eventId, medium },
  );
}

export function deleteEvent(db: Db, org: string, id: string): string[] {
  return db.tx(() => {
    const paths = db.all<{
      storage_path: string;
      thumbnail_path: string | null;
      preview_path: string | null;
    }>(
      "select storage_path, thumbnail_path, preview_path from photos where event_id = :id and organization_id = :org",
      { id, org },
    );
    db.run("delete from events where id = :id and organization_id = :org", { id, org });
    return paths
      .flatMap((p) => [p.storage_path, p.thumbnail_path, p.preview_path])
      .filter((x): x is string => x !== null);
  });
}
