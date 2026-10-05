import { isEmptySearch, parseSearch, type ParsedSearch } from "@hl-bos/jersey-sort";

import type { Db, Params } from "../db-core.ts";
import { CAPTURE_DAY, IN_GALLERY, PHOTO_OF_PLAYER, PHOTOS_OF_PLAYERS } from "./sql.ts";

export interface PhotoFilters {
  readonly eventId?: string | undefined;
  readonly teamId?: string | undefined;
  readonly sport?: string | undefined;
  readonly number?: string | undefined;
  readonly playerId?: string | undefined;
  /** high | medium | low | unidentified | nojersey */
  readonly confidence?: string | undefined;
  /** reviewed | unreviewed */
  readonly review?: string | undefined;
  readonly status?: string | undefined;
  readonly favoritesOnly?: boolean | undefined;
  readonly uploadedBy?: string | undefined;
  readonly day?: string | undefined; // YYYY-MM-DD
  readonly albumId?: string | undefined;
  readonly q?: string | undefined;
  readonly includeUnusable?: boolean | undefined;
}

export interface PhotoTile {
  id: string;
  event_id: string;
  event_name: string;
  original_filename: string;
  captured_at: string;
  captured_at_source: "exif" | "upload";
  status: string;
  width: number | null;
  height: number | null;
  unusable: number;
  no_jersey_visible: number;
  favorite: number;
  has_thumbnail: number;
}

export interface TileDetection {
  photo_id: string;
  id: string;
  detected_value: string;
  confidence: number;
  status: "suggested" | "confirmed" | "rejected";
  method: string;
}

/**
 * Build the WHERE clause for a gallery. Every condition is parameterised;
 * the organization comes from the session and is always the first one.
 */
export function buildPhotoWhere(
  org: string,
  userId: string,
  medium: number,
  high: number,
  f: PhotoFilters,
): { where: string; params: Params; search: ParsedSearch | null } {
  const clauses = ["p.organization_id = :org"];
  const params: Params = { org, user: userId, medium, high };

  if (f.includeUnusable !== true && f.confidence !== undefined)
    clauses.push("p.unusable = 0");
  if (f.eventId) {
    clauses.push("p.event_id = :eventId");
    params["eventId"] = f.eventId;
  }
  if (f.teamId) {
    clauses.push("e.team_id = :teamId");
    params["teamId"] = f.teamId;
  }
  if (f.sport) {
    clauses.push("e.sport = :sport collate nocase");
    params["sport"] = f.sport;
  }
  if (f.number) {
    clauses.push(
      `p.unusable = 0 and exists (select 1 from photo_detections d where d.photo_id = p.id and d.detected_value = :number and ${IN_GALLERY("d")})`,
    );
    params["number"] = f.number;
  }
  if (f.playerId) {
    clauses.push(PHOTO_OF_PLAYER("p", ":playerId"));
    params["playerId"] = f.playerId;
  }
  switch (f.confidence) {
    case "high":
      clauses.push(
        "exists (select 1 from photo_detections d where d.photo_id = p.id and (d.status = 'confirmed' or (d.status = 'suggested' and d.confidence >= :high)))",
      );
      break;
    case "medium":
      clauses.push(
        "exists (select 1 from photo_detections d where d.photo_id = p.id and d.status = 'suggested' and d.confidence >= :medium and d.confidence < :high)",
      );
      break;
    case "low":
      clauses.push(
        "exists (select 1 from photo_detections d where d.photo_id = p.id and d.status = 'suggested' and d.confidence < :medium)",
      );
      break;
    case "unidentified":
      clauses.push(
        `p.status in ('completed','needs_review') and p.no_jersey_visible = 0 and p.unusable = 0
         and not exists (select 1 from photo_detections d where d.photo_id = p.id and ${IN_GALLERY("d")})`,
      );
      break;
    case "nojersey":
      clauses.push("p.no_jersey_visible = 1");
      break;
    default:
      break;
  }
  if (f.review === "reviewed") clauses.push("p.reviewed_at is not null");
  if (f.review === "unreviewed") clauses.push("p.reviewed_at is null");
  if (f.status) {
    clauses.push("p.status = :status");
    params["status"] = f.status;
  }
  if (f.favoritesOnly === true) {
    clauses.push(
      "exists (select 1 from favorites fv where fv.photo_id = p.id and fv.user_id = :user)",
    );
  }
  if (f.uploadedBy) {
    clauses.push("p.uploaded_by = :uploadedBy");
    params["uploadedBy"] = f.uploadedBy;
  }
  if (f.day) {
    clauses.push(`${CAPTURE_DAY("p")} = :day`);
    params["day"] = f.day;
  }
  if (f.albumId) {
    clauses.push(
      "exists (select 1 from album_photos ap where ap.photo_id = p.id and ap.album_id = :albumId)",
    );
    params["albumId"] = f.albumId;
  }

  let search: ParsedSearch | null = null;
  if (f.q !== undefined && f.q.trim().length > 0) {
    search = parseSearch(f.q);
    if (!isEmptySearch(search)) {
      search.numbers.forEach((n, i) => {
        clauses.push(
          `exists (select 1 from photo_detections d where d.photo_id = p.id and d.detected_value = :qn${i} and ${IN_GALLERY("d")})`,
        );
        params[`qn${i}`] = n;
      });
      search.dates.forEach((d, i) => {
        clauses.push(
          `(cast(substr(p.captured_at, 6, 2) as integer) = :qm${i}
            and (:qd${i} is null or cast(substr(p.captured_at, 9, 2) as integer) = :qd${i})
            and (:qy${i} is null or cast(substr(p.captured_at, 1, 4) as integer) = :qy${i}))`,
        );
        params[`qm${i}`] = d.month;
        params[`qd${i}`] = d.day;
        params[`qy${i}`] = d.year;
      });
      search.terms.forEach((term, i) => {
        const key = `qt${i}`;
        params[key] = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
        const like = (col: string) => `${col} like :${key} escape '\\'`;
        clauses.push(`(
          ${like("e.name")} or ${like("e.sport")} or ${like("coalesce(e.opponent,'')")} or ${like("coalesce(e.location,'')")}
          or ${like("t.name")} or ${like("s.name")} or ${like("p.original_filename")}
          or p.id in (${PHOTOS_OF_PLAYERS(`pl.organization_id = :org and ${like("(pl.first_name || ' ' || pl.last_name)")}`)})
        )`);
      });
    }
  }

  return { where: clauses.join("\n and "), params, search };
}

const FROM = `
  from photos p
  join events e on e.id = p.event_id
  join teams t on t.id = e.team_id
  join seasons s on s.id = e.season_id`;

export const PAGE_SIZE = 120;

export function listPhotos(
  db: Db,
  org: string,
  userId: string,
  thresholds: { high: number; medium: number },
  filters: PhotoFilters,
  page = 1,
  pageSize = PAGE_SIZE,
): {
  tiles: PhotoTile[];
  total: number;
  detections: Map<string, TileDetection[]>;
  search: ParsedSearch | null;
} {
  const { where, params, search } = buildPhotoWhere(
    org,
    userId,
    thresholds.medium,
    thresholds.high,
    filters,
  );
  const total =
    db.get<{ n: number }>(`select count(*) as n ${FROM} where ${where}`, params)?.n ??
    0;
  const offset = Math.max(0, (page - 1) * pageSize);
  const tiles = db.all<PhotoTile>(
    `select p.id, p.event_id, e.name as event_name, p.original_filename, p.captured_at, p.captured_at_source,
            p.status, p.width, p.height, p.unusable, p.no_jersey_visible,
            exists (select 1 from favorites fv where fv.photo_id = p.id and fv.user_id = :user) as favorite,
            (p.thumbnail_path is not null) as has_thumbnail
       ${FROM}
      where ${where}
      order by p.captured_at, p.original_filename
      limit :limit offset :offset`,
    { ...params, limit: pageSize, offset },
  );
  return {
    tiles,
    total,
    detections: detectionsFor(
      db,
      org,
      tiles.map((t) => t.id),
    ),
    search,
  };
}

export function detectionsFor(
  db: Db,
  org: string,
  photoIds: readonly string[],
): Map<string, TileDetection[]> {
  const out = new Map<string, TileDetection[]>();
  if (photoIds.length === 0) return out;
  const params: Params = { org };
  const keys = photoIds.map((id, i) => {
    params[`p${i}`] = id;
    return `:p${i}`;
  });
  const rows = db.all<TileDetection>(
    `select photo_id, id, detected_value, confidence, status, method from photo_detections
      where organization_id = :org and status != 'rejected' and photo_id in (${keys.join(",")})
      order by confidence desc`,
    params,
  );
  for (const r of rows) {
    const list = out.get(r.photo_id) ?? [];
    list.push(r);
    out.set(r.photo_id, list);
  }
  return out;
}

export interface PhotoDetail extends PhotoTile {
  organization_id: string;
  storage_path: string;
  thumbnail_path: string | null;
  preview_path: string | null;
  mime_type: string;
  file_size: number;
  file_hash: string;
  uploaded_at: string;
  uploaded_by_name: string | null;
  error: string | null;
  attempts: number;
  athletes_present: number | null;
  athlete_count: number | null;
  analysis_notes: string | null;
  reviewed_at: string | null;
  event_date: string;
  team_id: string;
  team_name: string;
  season_id: string;
  season_name: string;
  sport: string;
  opponent: string | null;
  camera_make: string | null;
  camera_model: string | null;
  lens: string | null;
  iso: number | null;
  exposure_time: number | null;
  f_number: number | null;
  focal_length: number | null;
}

export function getPhoto(
  db: Db,
  org: string,
  userId: string,
  id: string,
): PhotoDetail | undefined {
  return db.get<PhotoDetail>(
    `select p.*, e.name as event_name, e.event_date, e.team_id, t.name as team_name, e.season_id, s.name as season_name,
            e.sport, e.opponent, u.display_name as uploaded_by_name,
            m.camera_make, m.camera_model, m.lens, m.iso, m.exposure_time, m.f_number, m.focal_length,
            exists (select 1 from favorites fv where fv.photo_id = p.id and fv.user_id = :user) as favorite,
            (p.thumbnail_path is not null) as has_thumbnail
       ${FROM}
       left join users u on u.id = p.uploaded_by
       left join photo_metadata m on m.photo_id = p.id
      where p.id = :id and p.organization_id = :org`,
    { id, org, user: userId },
  );
}

export interface FullDetection extends TileDetection {
  location: string | null;
  provider: string;
  provider_model: string | null;
  bounding_box: string | null;
  user_confirmed: number;
  created_at: string;
}

export function photoDetections(db: Db, org: string, photoId: string): FullDetection[] {
  return db.all<FullDetection>(
    `select photo_id, id, detected_value, confidence, status, method, location, provider, provider_model,
            bounding_box, user_confirmed, created_at
       from photo_detections where organization_id = :org and photo_id = :photoId
      order by status = 'rejected', confidence desc`,
    { org, photoId },
  );
}

/** Players this photo is filed under, and how. */
export function photoPlayers(
  db: Db,
  org: string,
  photoId: string,
  medium: number,
): Array<{
  id: string;
  name: string;
  jersey_number: string | null;
  via: "tag" | "number";
}> {
  return db.all(
    `select pl.id, pl.first_name || ' ' || pl.last_name as name, null as jersey_number, 'tag' as via
       from photo_player_tags t join players pl on pl.id = t.player_id
      where t.photo_id = :photoId and t.organization_id = :org
     union
     select pl.id, pl.first_name || ' ' || pl.last_name, pn.jersey_number, 'number'
       from photos p
       join events e on e.id = p.event_id
       join photo_detections d on d.photo_id = p.id
       join player_numbers pn on pn.team_id = e.team_id and pn.season_id = e.season_id and pn.jersey_number = d.detected_value
       join players pl on pl.id = pn.player_id
      where p.id = :photoId and p.organization_id = :org and p.unusable = 0 and ${IN_GALLERY("d")}`,
    { photoId, org, medium },
  );
}

/** The photos either side of this one in its event, for next/previous. */
export function neighbours(
  db: Db,
  org: string,
  photo: { event_id: string; captured_at: string; original_filename: string },
) {
  const params = {
    org,
    e: photo.event_id,
    c: photo.captured_at,
    f: photo.original_filename,
  };
  const prev = db.get<{ id: string }>(
    `select id from photos where organization_id = :org and event_id = :e
       and (captured_at < :c or (captured_at = :c and original_filename < :f))
     order by captured_at desc, original_filename desc limit 1`,
    params,
  );
  const next = db.get<{ id: string }>(
    `select id from photos where organization_id = :org and event_id = :e
       and (captured_at > :c or (captured_at = :c and original_filename > :f))
     order by captured_at, original_filename limit 1`,
    params,
  );
  return { prev: prev?.id ?? null, next: next?.id ?? null };
}

export function dateGroups(
  db: Db,
  org: string,
): Array<{ day: string; photos: number; events: number; inferred: number }> {
  return db.all(
    `select ${CAPTURE_DAY("p")} as day, count(*) as photos, count(distinct p.event_id) as events,
            sum(p.captured_at_source = 'upload') as inferred
       from photos p where p.organization_id = :org
      group by day order by day desc`,
    { org },
  );
}

/** Of the given ids, those that belong to this organization. Bulk actions start here. */
export function ownedPhotoIds(db: Db, org: string, ids: readonly string[]): string[] {
  if (ids.length === 0) return [];
  const params: Params = { org };
  const keys = ids.slice(0, 1000).map((id, i) => {
    params[`p${i}`] = id;
    return `:p${i}`;
  });
  return db
    .all<{ id: string }>(
      `select id from photos where organization_id = :org and id in (${keys.join(",")})`,
      params,
    )
    .map((r) => r.id);
}
