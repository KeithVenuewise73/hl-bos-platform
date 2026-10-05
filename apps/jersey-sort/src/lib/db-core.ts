/**
 * The local relational store: SQLite, built into Node (node:sqlite).
 *
 * Its tables mirror the `jerseysort` Postgres schema in supabase migration
 * 0052 table for table and column for column. The app runs on this store
 * until that migration is approved and applied; switching is a new
 * implementation of the queries in ./repo, not a redesign.
 *
 * Organization scoping is enforced in every query in ./repo — each one takes
 * the organization id from the signed-in session, never from the request.
 * That is this store's equivalent of the RLS policies in 0052.
 *
 * Free of `server-only` so tests can open an in-memory copy.
 */

import { DatabaseSync, type SQLInputValue } from "node:sqlite";

export type Params = Record<string, SQLInputValue>;

export interface Db {
  readonly raw: DatabaseSync;
  all<T>(sql: string, params?: Params): T[];
  get<T>(sql: string, params?: Params): T | undefined;
  run(sql: string, params?: Params): { changes: number };
  tx<T>(fn: () => T): T;
}

export const SCHEMA_VERSION = 1;

const SCHEMA = `
create table if not exists organizations (
  id text primary key,
  name text not null check (length(name) between 1 and 120),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table if not exists users (
  id text primary key,
  email text not null unique collate nocase,
  display_name text not null,
  password_hash text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table if not exists memberships (
  organization_id text not null references organizations(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  role text not null check (role in ('owner','member')),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  primary key (organization_id, user_id)
);

create table if not exists sessions (
  token_hash text primary key,
  user_id text not null references users(id) on delete cascade,
  organization_id text not null references organizations(id) on delete cascade,
  expires_at text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table if not exists organization_settings (
  organization_id text primary key references organizations(id) on delete cascade,
  high_threshold real not null default 0.85,
  medium_threshold real not null default 0.60,
  provider text,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  check (medium_threshold > 0 and medium_threshold < high_threshold and high_threshold <= 1)
);

create table if not exists teams (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  name text not null collate nocase,
  sport text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (organization_id, name)
);

create table if not exists seasons (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  name text not null collate nocase,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (organization_id, name)
);

create table if not exists events (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  name text not null,
  sport text not null,
  team_id text not null references teams(id),
  season_id text not null references seasons(id),
  opponent text,
  event_date text not null,
  location text,
  notes text,
  created_by text references users(id) on delete set null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists events_org_date on events (organization_id, event_date desc);
create index if not exists events_team_season on events (team_id, season_id);

create table if not exists photos (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  event_id text not null references events(id) on delete cascade,
  uploaded_by text references users(id) on delete set null,
  original_filename text not null,
  storage_path text not null,
  thumbnail_path text,
  preview_path text,
  captured_at text not null,
  captured_at_source text not null check (captured_at_source in ('exif','upload')),
  uploaded_at text not null,
  width integer,
  height integer,
  mime_type text not null,
  file_size integer not null,
  file_hash text not null,
  status text not null check (status in ('uploaded','queued','processing','completed','needs_review','failed')),
  error text,
  attempts integer not null default 0,
  athletes_present integer,
  athlete_count integer,
  analysis_notes text,
  no_jersey_visible integer not null default 0,
  unusable integer not null default 0,
  reviewed_at text,
  reviewed_by text references users(id) on delete set null,
  skipped_at text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (organization_id, file_hash)
);
create index if not exists photos_event on photos (event_id, captured_at);
create index if not exists photos_org_status on photos (organization_id, status);
create index if not exists photos_org_captured on photos (organization_id, captured_at);
create index if not exists photos_org_uploaded on photos (organization_id, uploaded_at desc);

create table if not exists photo_metadata (
  photo_id text primary key references photos(id) on delete cascade,
  camera_make text,
  camera_model text,
  lens text,
  iso integer,
  exposure_time real,
  f_number real,
  focal_length real,
  orientation integer,
  exif_json text
);

create table if not exists photo_detections (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  photo_id text not null references photos(id) on delete cascade,
  detection_type text not null default 'jersey_number' check (detection_type = 'jersey_number'),
  detected_value text not null check (detected_value glob '[0-9]' or detected_value glob '[1-9][0-9]' or detected_value = '00'),
  confidence real not null check (confidence >= 0 and confidence <= 1),
  bounding_box text,
  location text,
  method text not null check (method in ('vision_model','ocr','manual')),
  provider text not null,
  provider_model text,
  status text not null check (status in ('suggested','confirmed','rejected')),
  user_confirmed integer not null generated always as (status = 'confirmed') virtual,
  created_by text references users(id) on delete set null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists detections_photo on photo_detections (photo_id, detected_value);
create index if not exists detections_org_value on photo_detections (organization_id, detected_value, status);

create table if not exists players (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  team_id text not null references teams(id),
  season_id text not null references seasons(id),
  sport text,
  position text,
  graduation_year integer check (graduation_year between 1990 and 2100),
  profile_photo_id text references photos(id) on delete set null,
  created_by text references users(id) on delete set null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists players_org on players (organization_id, last_name, first_name);

-- A number belongs to a player for one TEAM and one SEASON only. Next season
-- #24 may be somebody else, and last season's photos must stay with whoever
-- wore it then.
create table if not exists player_numbers (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  player_id text not null references players(id) on delete cascade,
  team_id text not null references teams(id),
  season_id text not null references seasons(id),
  jersey_number text not null check (jersey_number glob '[0-9]' or jersey_number glob '[1-9][0-9]' or jersey_number = '00'),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (organization_id, team_id, season_id, jersey_number)
);
create index if not exists player_numbers_player on player_numbers (player_id);

create table if not exists photo_player_tags (
  organization_id text not null references organizations(id) on delete cascade,
  photo_id text not null references photos(id) on delete cascade,
  player_id text not null references players(id) on delete cascade,
  created_by text references users(id) on delete set null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  primary key (photo_id, player_id)
);
create index if not exists tags_player on photo_player_tags (player_id);

create table if not exists albums (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  created_by text references users(id) on delete set null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table if not exists album_photos (
  album_id text not null references albums(id) on delete cascade,
  photo_id text not null references photos(id) on delete cascade,
  added_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  primary key (album_id, photo_id)
);

create table if not exists favorites (
  organization_id text not null references organizations(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  photo_id text not null references photos(id) on delete cascade,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  primary key (user_id, photo_id)
);
create index if not exists favorites_photo on favorites (photo_id);

create table if not exists ai_analysis_jobs (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  photo_id text not null references photos(id) on delete cascade,
  provider text not null,
  provider_model text,
  status text not null check (status in ('running','succeeded','failed')),
  error text,
  result_json text,
  started_at text not null,
  finished_at text
);
create index if not exists jobs_photo on ai_analysis_jobs (photo_id, started_at desc);

-- The review queue is a VIEW, not a table: a photo is in it exactly when its
-- status says so, so the queue cannot drift from the photos it describes.
create view if not exists review_queue as
  select id as photo_id, organization_id, event_id, skipped_at, uploaded_at
  from photos where status = 'needs_review';
`;

export function openDb(file: string): Db {
  const raw = new DatabaseSync(file, { enableForeignKeyConstraints: true });
  raw.exec("pragma journal_mode = wal; pragma busy_timeout = 5000;");
  raw.exec(SCHEMA);
  raw.exec(`pragma user_version = ${SCHEMA_VERSION}`);
  return wrap(raw);
}

/**
 * node:sqlite throws on a named parameter the statement does not use. Shared
 * filter builders bind a common set (org, user, thresholds) whether or not a
 * given query needs all of them, so each call binds only what its SQL names.
 */
const NAMES = /:([A-Za-z_][A-Za-z0-9_]*)/g;
const namesCache = new Map<string, Set<string>>();
export function bindable(sql: string, params: Params): Params {
  let names = namesCache.get(sql);
  if (names === undefined) {
    names = new Set([...sql.matchAll(NAMES)].map((m) => m[1] ?? ""));
    if (namesCache.size > 2000) namesCache.clear();
    namesCache.set(sql, names);
  }
  const out: Params = {};
  for (const name of names) out[name] = params[name] ?? null;
  return out;
}

function wrap(raw: DatabaseSync): Db {
  let depth = 0;
  return {
    raw,
    // node:sqlite returns NULL-PROTOTYPE rows. React refuses to pass those
    // from a server component to a client component, so every row is copied
    // into a plain object here, once, for every query.
    all<T>(sql: string, params: Params = {}) {
      return raw
        .prepare(sql)
        .all(bindable(sql, params))
        .map((row) => ({ ...row })) as T[];
    },
    get<T>(sql: string, params: Params = {}) {
      const row = raw.prepare(sql).get(bindable(sql, params));
      return (row === undefined ? undefined : { ...row }) as T | undefined;
    },
    run(sql: string, params: Params = {}) {
      const r = raw.prepare(sql).run(bindable(sql, params));
      return { changes: Number(r.changes) };
    },
    tx<T>(fn: () => T): T {
      // Nested calls join the outer transaction.
      if (depth > 0) return fn();
      depth += 1;
      raw.exec("begin immediate");
      try {
        const out = fn();
        raw.exec("commit");
        return out;
      } catch (error) {
        raw.exec("rollback");
        throw error;
      } finally {
        depth -= 1;
      }
    },
  };
}

export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
