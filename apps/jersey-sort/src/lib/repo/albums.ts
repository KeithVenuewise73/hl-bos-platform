import { newId, type Db } from "../db-core.ts";
import { ValidationError } from "./events.ts";

export function createAlbum(
  db: Db,
  org: string,
  userId: string,
  name: string,
  description: string,
): string {
  const n = name.trim().slice(0, 120);
  if (n.length === 0) throw new ValidationError("Name the album.");
  const id = newId();
  db.run(
    "insert into albums (id, organization_id, name, description, created_by) values (:id, :org, :n, :d, :u)",
    {
      id,
      org,
      n,
      d: description.trim().slice(0, 1000) || null,
      u: userId,
    },
  );
  return id;
}

export function listAlbums(db: Db, org: string) {
  return db.all<{
    id: string;
    name: string;
    description: string | null;
    photos: number;
    cover: string | null;
  }>(
    `select a.id, a.name, a.description,
            (select count(*) from album_photos ap where ap.album_id = a.id) as photos,
            (select ap.photo_id from album_photos ap where ap.album_id = a.id order by ap.added_at limit 1) as cover
       from albums a where a.organization_id = :org order by a.created_at desc`,
    { org },
  );
}

export function getAlbum(db: Db, org: string, id: string) {
  return db.get<{ id: string; name: string; description: string | null }>(
    "select id, name, description from albums where id = :id and organization_id = :org",
    { id, org },
  );
}

export function addToAlbum(
  db: Db,
  org: string,
  albumId: string,
  photoIds: readonly string[],
): void {
  db.tx(() => {
    if (getAlbum(db, org, albumId) === undefined)
      throw new ValidationError("That album was not found.");
    for (const photo of photoIds) {
      db.run(
        `insert into album_photos (album_id, photo_id) select :a, id from photos where id = :p and organization_id = :org
         on conflict do nothing`,
        { a: albumId, p: photo, org },
      );
    }
  });
}

export function removeFromAlbum(
  db: Db,
  org: string,
  albumId: string,
  photoIds: readonly string[],
): void {
  db.tx(() => {
    if (getAlbum(db, org, albumId) === undefined)
      throw new ValidationError("That album was not found.");
    for (const photo of photoIds)
      db.run("delete from album_photos where album_id = :a and photo_id = :p", {
        a: albumId,
        p: photo,
      });
  });
}

export function deleteAlbum(db: Db, org: string, id: string): void {
  db.run("delete from albums where id = :id and organization_id = :org", { id, org });
}

export function setFavorite(
  db: Db,
  org: string,
  userId: string,
  photoIds: readonly string[],
  on: boolean,
): void {
  db.tx(() => {
    for (const photo of photoIds) {
      if (on) {
        db.run(
          `insert into favorites (organization_id, user_id, photo_id) select :org, :u, id from photos where id = :p and organization_id = :org
           on conflict do nothing`,
          { org, u: userId, p: photo },
        );
      } else {
        db.run("delete from favorites where user_id = :u and photo_id = :p", {
          u: userId,
          p: photo,
        });
      }
    }
  });
}

export function markReviewed(
  db: Db,
  org: string,
  userId: string,
  photoIds: readonly string[],
): string[] {
  return photoIds.filter(
    (p) =>
      db.run(
        `update photos set reviewed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), reviewed_by = :u where id = :p and organization_id = :org`,
        { u: userId, p, org },
      ).changes > 0,
  );
}
