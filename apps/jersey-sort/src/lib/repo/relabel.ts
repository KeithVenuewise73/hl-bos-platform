/**
 * Fixing which game a photo is labelled with: move photos to another game, or
 * start a new game from them (two sports or two games on one day).
 * Any approval given under the old label is dropped: they go back to pending.
 * Only the owner may do this, because it changes what the website would show.
 */

import type { Db } from "../db-core.ts";
import { NotAllowed, resetAfterRelabel, type Role } from "./approvals.ts";
import { createEvent, getEvent, type EventInput } from "./events.ts";
import { ownedPhotoIds } from "./photos.ts";

function mustBeOwner(role: Role): void {
  if (role !== "owner")
    throw new NotAllowed("Only the owner can change which game a photo belongs to.");
}

/** Move these photos into an existing game of this organization. Returns how many moved. */
export function movePhotos(
  db: Db,
  org: string,
  role: Role,
  photoIds: readonly string[],
  toEventId: string,
): number {
  mustBeOwner(role);
  if (getEvent(db, org, toEventId) === undefined)
    throw new NotAllowed("That game was not found.");
  const mine = ownedPhotoIds(db, org, photoIds);
  db.tx(() => {
    for (const id of mine) {
      db.run(
        "update photos set event_id = :e where id = :id and organization_id = :org and event_id <> :e",
        { e: toEventId, id, org },
      );
    }
    resetAfterRelabel(db, org, mine);
  });
  return mine.length;
}

/** Start a new game and put these photos in it. Returns the new game's id. */
export function createGameFromPhotos(
  db: Db,
  org: string,
  userId: string,
  role: Role,
  photoIds: readonly string[],
  game: EventInput,
): string {
  mustBeOwner(role);
  return db.tx(() => {
    const eventId = createEvent(db, org, userId, game);
    movePhotos(db, org, role, photoIds, eventId);
    return eventId;
  });
}
