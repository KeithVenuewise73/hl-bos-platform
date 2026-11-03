/**
 * Team galleries: a private page, behind a link and a team password, that
 * shows one team or group ONLY the events assigned to it.
 *
 * Two sides, kept apart:
 *   - the owner's side takes the organization from the signed-in session,
 *     like every other query in ./repo;
 *   - the visitor's side takes nothing but the link's token and an access
 *     cookie, and every photo it serves is checked to belong to an event
 *     assigned to that gallery. A visitor can never reach another gallery's
 *     photos, or any photo of the organization that was not assigned.
 *
 * The link token is 128 random bits. It is stored as is, so the owner can
 * copy the link again at any time; the password is what guards it (scrypt,
 * like account passwords). A new link stops the old one; a new password ends
 * every visit already open.
 */

import { createHash, randomBytes } from "node:crypto";

import { hashPassword, verifyPassword } from "../auth-core.ts";
import { newId, nowIso, type Db } from "../db-core.ts";
import { ValidationError } from "./events.ts";

/** The cookie that lets a visitor into ONE gallery (sent only to its pages). */
export const accessCookie = (linkToken: string) => `jsg_${linkToken}`;

/** How long a visitor stays let in after entering the password. */
export const ACCESS_DAYS = 30;

const newToken = () => randomBytes(16).toString("base64url");
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export function validateGalleryPassword(password: string): string | null {
  if (password.length < 6) return "Use at least 6 characters for the team password.";
  if (password.length > 200) return "That password is too long.";
  return null;
}

// --- owner's side ----------------------------------------------------------

export interface GallerySummary {
  readonly id: string;
  readonly group_name: string | null;
  readonly name: string;
  readonly token: string;
  readonly active: number;
  readonly events: number;
  readonly photos: number;
  readonly created_at: string;
}

export function createGallery(
  db: Db,
  org: string,
  userId: string,
  input: { group: string; name: string; password: string },
): string {
  const name = input.name.trim().slice(0, 120);
  if (name.length === 0)
    throw new ValidationError("Name the team or group (for example Varsity).");
  const problem = validateGalleryPassword(input.password);
  if (problem !== null) throw new ValidationError(problem);
  const id = newId();
  db.run(
    `insert into shared_galleries (id, organization_id, group_name, name, token, password_hash, created_by)
     values (:id, :org, :g, :n, :t, :h, :u)`,
    {
      id,
      org,
      g: input.group.trim().slice(0, 120) || null,
      n: name,
      t: newToken(),
      h: hashPassword(input.password),
      u: userId,
    },
  );
  return id;
}

/** Photos a visitor may see: in an assigned event, and not marked unusable. */
const VISIBLE = "p.unusable = 0 and p.preview_path is not null";

export function listGalleries(db: Db, org: string): GallerySummary[] {
  return db.all<GallerySummary>(
    `select g.id, g.group_name, g.name, g.token, g.active, g.created_at,
            (select count(*) from shared_gallery_events ge where ge.gallery_id = g.id) as events,
            (select count(*) from shared_gallery_events ge join photos p on p.event_id = ge.event_id
              where ge.gallery_id = g.id and ${VISIBLE}) as photos
       from shared_galleries g
      where g.organization_id = :org
      order by coalesce(g.group_name, '') collate nocase, g.name collate nocase`,
    { org },
  );
}

export function getGallery(db: Db, org: string, id: string) {
  const g = db.get<{
    id: string;
    group_name: string | null;
    name: string;
    token: string;
    active: number;
  }>(
    "select id, group_name, name, token, active from shared_galleries where id = :id and organization_id = :org",
    { id, org },
  );
  if (g === undefined) return undefined;
  const eventIds = db
    .all<{
      event_id: string;
    }>("select event_id from shared_gallery_events where gallery_id = :id", { id })
    .map((r) => r.event_id);
  return { ...g, eventIds };
}

function mustOwn(db: Db, org: string, id: string): void {
  if (
    db.get("select 1 from shared_galleries where id = :id and organization_id = :org", {
      id,
      org,
    }) === undefined
  ) {
    throw new ValidationError("That team gallery was not found.");
  }
}

/** Exactly these events, and only events of this organization. */
export function setGalleryEvents(
  db: Db,
  org: string,
  id: string,
  eventIds: readonly string[],
): void {
  db.tx(() => {
    mustOwn(db, org, id);
    db.run("delete from shared_gallery_events where gallery_id = :id", { id });
    for (const eventId of new Set(eventIds)) {
      db.run(
        `insert into shared_gallery_events (gallery_id, event_id)
         select :id, e.id from events e where e.id = :e and e.organization_id = :org`,
        { id, e: eventId, org },
      );
    }
    db.run("update shared_galleries set updated_at = :now where id = :id", {
      id,
      now: nowIso(),
    });
  });
}

export function renameGallery(
  db: Db,
  org: string,
  id: string,
  input: { group: string; name: string },
): void {
  const name = input.name.trim().slice(0, 120);
  if (name.length === 0) throw new ValidationError("Name the team or group.");
  mustOwn(db, org, id);
  db.run(
    "update shared_galleries set group_name = :g, name = :n, updated_at = :now where id = :id",
    { id, g: input.group.trim().slice(0, 120) || null, n: name, now: nowIso() },
  );
}

/** A new team password. Everyone already let in must enter the new one. */
export function setGalleryPassword(
  db: Db,
  org: string,
  id: string,
  password: string,
): void {
  const problem = validateGalleryPassword(password);
  if (problem !== null) throw new ValidationError(problem);
  db.tx(() => {
    mustOwn(db, org, id);
    db.run(
      "update shared_galleries set password_hash = :h, updated_at = :now where id = :id",
      { id, h: hashPassword(password), now: nowIso() },
    );
    db.run("delete from shared_gallery_access where gallery_id = :id", { id });
  });
}

/** Switch the link off (nobody gets in) or back on. */
export function setGalleryActive(
  db: Db,
  org: string,
  id: string,
  active: boolean,
): void {
  db.tx(() => {
    mustOwn(db, org, id);
    db.run(
      "update shared_galleries set active = :a, updated_at = :now where id = :id",
      { id, a: active ? 1 : 0, now: nowIso() },
    );
    if (!active)
      db.run("delete from shared_gallery_access where gallery_id = :id", { id });
  });
}

/** A new link. The old one stops working, and every open visit ends. */
export function newGalleryLink(db: Db, org: string, id: string): string {
  const token = newToken();
  db.tx(() => {
    mustOwn(db, org, id);
    db.run("update shared_galleries set token = :t, updated_at = :now where id = :id", {
      id,
      t: token,
      now: nowIso(),
    });
    db.run("delete from shared_gallery_access where gallery_id = :id", { id });
  });
  return token;
}

export function deleteGallery(db: Db, org: string, id: string): void {
  db.run("delete from shared_galleries where id = :id and organization_id = :org", {
    id,
    org,
  });
}

// --- visitor's side --------------------------------------------------------

export interface PublicGallery {
  readonly id: string;
  readonly organizationId: string;
  /** The photographer or studio: the brand on the page. */
  readonly organizationName: string;
  readonly groupName: string | null;
  readonly name: string;
}

interface GalleryRow {
  id: string;
  organization_id: string;
  organization_name: string;
  group_name: string | null;
  name: string;
  password_hash: string;
}

function activeByToken(db: Db, token: string): GalleryRow | undefined {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return undefined;
  return db.get<GalleryRow>(
    `select g.id, g.organization_id, o.name as organization_name, g.group_name, g.name, g.password_hash
       from shared_galleries g join organizations o on o.id = g.organization_id
      where g.token = :t and g.active = 1`,
    { t: token },
  );
}

const toPublic = (g: GalleryRow): PublicGallery => ({
  id: g.id,
  organizationId: g.organization_id,
  organizationName: g.organization_name,
  groupName: g.group_name,
  name: g.name,
});

/** The gallery behind a link, or undefined when there is none or it is off. */
export function galleryForLink(db: Db, token: string): PublicGallery | undefined {
  const g = activeByToken(db, token);
  return g === undefined ? undefined : toPublic(g);
}

/**
 * Check the team password. Returns the raw access token for the cookie, or
 * null. Wrong guesses are counted by the caller (throttle below).
 */
export function unlockGallery(
  db: Db,
  linkToken: string,
  password: string,
): string | null {
  const g = activeByToken(db, linkToken);
  // Hash anyway when there is no gallery, so timing does not reveal links.
  const ok = verifyPassword(
    password,
    g?.password_hash ?? hashPassword("not-a-real-password"),
  );
  if (g === undefined || !ok) return null;
  const access = randomBytes(32).toString("base64url");
  db.run(
    `insert into shared_gallery_access (token_hash, gallery_id, password_hash, expires_at)
     values (:h, :g, :p, :e)`,
    {
      h: tokenHash(access),
      g: g.id,
      p: g.password_hash,
      e: new Date(Date.now() + ACCESS_DAYS * 86_400_000).toISOString(),
    },
  );
  return access;
}

/**
 * The gallery a visitor may see right now: the link must be on, the access
 * cookie must have been granted for THIS gallery, under its current password,
 * and not have expired.
 */
export function visitorGallery(
  db: Db,
  linkToken: string,
  access: string | undefined,
): PublicGallery | undefined {
  if (access === undefined || access.length < 20) return undefined;
  const g = activeByToken(db, linkToken);
  if (g === undefined) return undefined;
  const grant = db.get<{ password_hash: string; expires_at: string }>(
    "select password_hash, expires_at from shared_gallery_access where token_hash = :h and gallery_id = :g",
    { h: tokenHash(access), g: g.id },
  );
  if (grant === undefined || grant.password_hash !== g.password_hash) return undefined;
  if (grant.expires_at < nowIso()) return undefined;
  return toPublic(g);
}

export interface PublicEvent {
  readonly id: string;
  readonly name: string;
  readonly sport: string;
  readonly opponent: string | null;
  readonly event_date: string;
  readonly location: string | null;
  readonly photos: number;
  readonly cover: string | null;
}

export function galleryEvents(db: Db, gallery: PublicGallery): PublicEvent[] {
  return db.all<PublicEvent>(
    `select e.id, e.name, e.sport, e.opponent, e.event_date, e.location,
            (select count(*) from photos p where p.event_id = e.id and ${VISIBLE}) as photos,
            (select p.id from photos p where p.event_id = e.id and ${VISIBLE}
              order by p.captured_at limit 1) as cover
       from shared_gallery_events ge
       join events e on e.id = ge.event_id and e.organization_id = :org
      where ge.gallery_id = :g
      order by e.event_date desc, e.name`,
    { g: gallery.id, org: gallery.organizationId },
  );
}

export function galleryEvent(
  db: Db,
  gallery: PublicGallery,
  eventId: string,
): PublicEvent | undefined {
  return galleryEvents(db, gallery).find((e) => e.id === eventId);
}

export interface PublicPhoto {
  readonly id: string;
  readonly original_filename: string;
  readonly captured_at: string;
  readonly width: number | null;
  readonly height: number | null;
}

export function galleryPhotos(
  db: Db,
  gallery: PublicGallery,
  eventId: string,
): PublicPhoto[] {
  return db.all<PublicPhoto>(
    `select p.id, p.original_filename, p.captured_at, p.width, p.height
       from photos p
       join shared_gallery_events ge on ge.event_id = p.event_id and ge.gallery_id = :g
      where p.event_id = :e and p.organization_id = :org and ${VISIBLE}
      order by p.captured_at, p.original_filename`,
    { g: gallery.id, e: eventId, org: gallery.organizationId },
  );
}

/** One photo's stored files, only when it is in an event of this gallery. */
export function galleryPhotoFiles(db: Db, gallery: PublicGallery, photoId: string) {
  return db.get<{
    storage_path: string;
    thumbnail_path: string | null;
    preview_path: string | null;
    mime_type: string;
    original_filename: string;
    captured_at: string;
    uploaded_at: string;
    file_size: number;
  }>(
    `select p.storage_path, p.thumbnail_path, p.preview_path, p.mime_type, p.original_filename,
            p.captured_at, p.uploaded_at, p.file_size
       from photos p
       join shared_gallery_events ge on ge.event_id = p.event_id and ge.gallery_id = :g
      where p.id = :id and p.organization_id = :org and ${VISIBLE}`,
    { g: gallery.id, id: photoId, org: gallery.organizationId },
  );
}

/**
 * Wrong-password throttle: ten failures per gallery link per 15 minutes. In
 * memory, which is right for one local process.
 */
const failures = new Map<string, number[]>();
export function galleryThrottled(linkToken: string, now = Date.now()): boolean {
  const recent = (failures.get(linkToken) ?? []).filter((t) => now - t < 15 * 60_000);
  failures.set(linkToken, recent);
  return recent.length >= 10;
}
export function recordGalleryFailure(linkToken: string, now = Date.now()): void {
  failures.set(linkToken, [...(failures.get(linkToken) ?? []), now]);
}
