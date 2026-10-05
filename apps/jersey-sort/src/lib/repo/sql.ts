/**
 * SQL fragments shared by every query that decides gallery membership.
 *
 * These implement, in SQL, the rules defined once in
 * @hl-bos/jersey-sort/src/review.ts (galleryNumbers). repo.test.ts holds the
 * two to each other on the same fixtures.
 */

/** A detection that files its photo under its number. Needs :medium bound. */
export const IN_GALLERY = (d: string) =>
  `(${d}.status = 'confirmed' or (${d}.status = 'suggested' and ${d}.confidence >= :medium))`;

/**
 * The ids of every photo of the players matching `plWhere` (a condition on
 * alias `pl`): tagged by hand, or carrying the player's number at an event of
 * the same team AND season. Written as one set, computed once per query, not
 * re-checked photo by photo: that per-photo form took 1.6 s for one player's
 * gallery at 14,000 photos. CROSS JOIN fixes SQLite's join order so the
 * search starts from the detections index for the player's number instead of
 * scanning every photo of every event the team played that season.
 */
export const PHOTOS_OF_PLAYERS = (plWhere: string) => `
  select t.photo_id from photo_player_tags t join players pl on pl.id = t.player_id where ${plWhere}
  union
  select pd.photo_id
    from players pl
    cross join player_numbers pn on pn.player_id = pl.id
    cross join photo_detections pd on pd.organization_id = pl.organization_id and pd.detected_value = pn.jersey_number
    cross join photos pp on pp.id = pd.photo_id and pp.unusable = 0
    cross join events pe on pe.id = pp.event_id and pe.team_id = pn.team_id and pe.season_id = pn.season_id
   where ${plWhere} and ${IN_GALLERY("pd")}`;

/** Photo `p` belongs to the player bound as `playerParam`. */
export const PHOTO_OF_PLAYER = (p: string, playerParam: string) =>
  `${p}.id in (${PHOTOS_OF_PLAYERS(`pl.id = ${playerParam}`)})`;

/** Day of capture, YYYY-MM-DD, from the stored local timestamp. */
export const CAPTURE_DAY = (p: string) => `substr(${p}.captured_at, 1, 10)`;
