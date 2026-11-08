/**
 * Instagram drafts: a post being put together from one game's photos.
 *
 * A draft belongs to one organization and one game, and may only hold photos
 * of THAT game that are usable. Nothing here posts anything; see
 * ../instagram-core.ts.
 */

import { newId, nowIso, type Db } from "../db-core.ts";
import {
  captionProblems,
  isFit,
  isFormat,
  MAX_PHOTOS,
  type Fit,
  type Format,
} from "../instagram-core.ts";
import { ValidationError } from "./events.ts";

export interface Draft {
  readonly id: string;
  readonly event_id: string;
  readonly caption: string;
  readonly format: Format;
  readonly fit: Fit;
  readonly photo_ids: readonly string[];
  readonly created_at: string;
  readonly updated_at: string;
}

interface Row {
  id: string;
  event_id: string;
  caption: string;
  format: string;
  fit: string;
  photo_ids: string;
  created_at: string;
  updated_at: string;
}

const COLUMNS = "id, event_id, caption, format, fit, photo_ids, created_at, updated_at";

function parse(r: Row): Draft {
  let ids: unknown;
  try {
    ids = JSON.parse(r.photo_ids);
  } catch {
    ids = [];
  }
  return {
    id: r.id,
    event_id: r.event_id,
    caption: r.caption,
    format: isFormat(r.format) ? r.format : "portrait",
    fit: isFit(r.fit) ? r.fit : "fill",
    photo_ids: Array.isArray(ids)
      ? ids.filter((x): x is string => typeof x === "string")
      : [],
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

/** A new, empty draft for a game of this organization. */
export function createDraft(
  db: Db,
  org: string,
  userId: string,
  eventId: string,
  caption: string,
): string {
  if (
    db.get("select 1 from events where id = :e and organization_id = :org", {
      e: eventId,
      org,
    }) === undefined
  ) {
    throw new ValidationError("That game was not found.");
  }
  const id = newId();
  db.run(
    `insert into instagram_drafts (id, organization_id, event_id, caption, created_by)
     values (:id, :org, :e, :c, :u)`,
    { id, org, e: eventId, c: caption.slice(0, 5000), u: userId },
  );
  return id;
}

export function getDraft(db: Db, org: string, id: string): Draft | undefined {
  const r = db.get<Row>(
    `select ${COLUMNS} from instagram_drafts where id = :id and organization_id = :org`,
    { id, org },
  );
  return r === undefined ? undefined : parse(r);
}

export function listDrafts(db: Db, org: string, eventId: string): Draft[] {
  return db
    .all<Row>(
      `select ${COLUMNS} from instagram_drafts
        where organization_id = :org and event_id = :e
        order by updated_at desc, id`,
      { org, e: eventId },
    )
    .map(parse);
}

/**
 * The usable photos of a game, in the order they appear in a post: when they
 * were taken, then by file name. (The same order as the game's own pages.)
 */
export function draftablePhotos(
  db: Db,
  org: string,
  eventId: string,
): {
  id: string;
  original_filename: string;
  storage_path: string;
  mime_type: string;
}[] {
  return db.all(
    `select id, original_filename, storage_path, mime_type from photos
      where event_id = :e and organization_id = :org and unusable = 0 and preview_path is not null
      order by captured_at, original_filename`,
    { e: eventId, org },
  );
}

export interface DraftInput {
  readonly caption: string;
  readonly format: string;
  readonly fit: string;
  readonly photoIds: readonly string[];
}

/** Save a draft exactly as given, or say in plain words what is wrong. */
export function saveDraft(db: Db, org: string, id: string, input: DraftInput): void {
  const draft = getDraft(db, org, id);
  if (draft === undefined)
    throw new ValidationError("That Instagram post was not found.");
  if (!isFormat(input.format)) throw new ValidationError("Choose a picture shape.");
  if (!isFit(input.fit))
    throw new ValidationError("Choose how the photos fit the picture.");
  const wanted = new Set(input.photoIds);
  if (wanted.size > MAX_PHOTOS) {
    throw new ValidationError(
      `An Instagram post holds at most ${MAX_PHOTOS} pictures; ${wanted.size} are chosen.`,
    );
  }
  // Only this game's usable photos, in the post's order (not the order sent).
  const allowed = draftablePhotos(db, org, draft.event_id).map((p) => p.id);
  const unknown = [...wanted].filter((p) => !allowed.includes(p));
  if (unknown.length > 0) {
    throw new ValidationError(
      "One of the chosen photos is not a usable photo of this game, so nothing was saved.",
    );
  }
  const problems = captionProblems(input.caption);
  if (problems.length > 0) throw new ValidationError(problems.join(" "));
  db.run(
    `update instagram_drafts
        set caption = :c, format = :f, fit = :t, photo_ids = :p, updated_at = :now
      where id = :id and organization_id = :org`,
    {
      id,
      org,
      c: input.caption,
      f: input.format,
      t: input.fit,
      p: JSON.stringify(allowed.filter((p) => wanted.has(p))),
      now: nowIso(),
    },
  );
}

export function deleteDraft(db: Db, org: string, id: string): void {
  db.run("delete from instagram_drafts where id = :id and organization_id = :org", {
    id,
    org,
  });
}

/** The draft's photos that still exist and are usable, in post order. */
export function draftPhotos(
  db: Db,
  org: string,
  draft: Draft,
): {
  id: string;
  original_filename: string;
  storage_path: string;
  mime_type: string;
}[] {
  const have = new Map(draftablePhotos(db, org, draft.event_id).map((p) => [p.id, p]));
  return draft.photo_ids.flatMap((id) => {
    const p = have.get(id);
    return p === undefined ? [] : [p];
  });
}
