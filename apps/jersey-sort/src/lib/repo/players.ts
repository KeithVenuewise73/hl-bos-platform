import { normalizeJerseyNumber } from "@hl-bos/jersey-sort";

import { newId, type Db } from "../db-core.ts";
import { seasonId, teamId, ValidationError } from "./events.ts";
import { PHOTO_OF_PLAYER, PHOTOS_OF_PLAYERS } from "./sql.ts";

export interface PlayerInput {
  readonly firstName: string;
  readonly lastName: string;
  readonly jerseyNumber: string;
  readonly teamName: string;
  readonly sport: string;
  readonly season: string;
  readonly position: string;
  readonly graduationYear: string;
}

export interface PlayerRow {
  id: string;
  first_name: string;
  last_name: string;
  team_id: string;
  team_name: string;
  season_id: string;
  season_name: string;
  sport: string | null;
  position: string | null;
  graduation_year: number | null;
  profile_photo_id: string | null;
  jersey_number: string | null;
}

export interface PlayerNumber {
  id: string;
  jersey_number: string;
  team_name: string;
  season_name: string;
}

function validate(raw: PlayerInput) {
  const firstName = raw.firstName.trim().slice(0, 60);
  const lastName = raw.lastName.trim().slice(0, 60);
  const teamName = raw.teamName.trim().slice(0, 120);
  const season = raw.season.trim().slice(0, 40);
  if (firstName.length === 0 || lastName.length === 0)
    throw new ValidationError("Enter the player's first and last name.");
  if (teamName.length === 0) throw new ValidationError("Enter the player's team.");
  if (season.length === 0)
    throw new ValidationError("Enter the season (for example 2026).");
  let jersey: string | null = null;
  if (raw.jerseyNumber.trim().length > 0) {
    jersey = normalizeJerseyNumber(raw.jerseyNumber);
    if (jersey === null)
      throw new ValidationError("A jersey number is one or two digits, 0–99 or 00.");
  }
  let year: number | null = null;
  if (raw.graduationYear.trim().length > 0) {
    year = Number(raw.graduationYear);
    if (!Number.isInteger(year) || year < 1990 || year > 2100)
      throw new ValidationError("Graduation year looks wrong.");
  }
  return {
    firstName,
    lastName,
    teamName,
    season,
    jersey,
    year,
    sport: raw.sport.trim().slice(0, 60) || null,
    position: raw.position.trim().slice(0, 60) || null,
  };
}

/** Assign a number for a team + season, refusing one that is already someone else's. */
function assignNumber(
  db: Db,
  org: string,
  playerId: string,
  team: string,
  season: string,
  jersey: string,
): void {
  const taken = db.get<{ name: string; player_id: string }>(
    `select pl.first_name || ' ' || pl.last_name as name, pn.player_id from player_numbers pn join players pl on pl.id = pn.player_id
      where pn.organization_id = :org and pn.team_id = :team and pn.season_id = :season and pn.jersey_number = :j`,
    { org, team, season, j: jersey },
  );
  if (taken !== undefined && taken.player_id !== playerId) {
    throw new ValidationError(
      `#${jersey} is already ${taken.name}'s number for that team and season.`,
    );
  }
  if (taken !== undefined) return;
  db.run(
    `insert into player_numbers (id, organization_id, player_id, team_id, season_id, jersey_number)
     values (:id, :org, :player, :team, :season, :j)`,
    { id: newId(), org, player: playerId, team, season, j: jersey },
  );
}

export function createPlayer(
  db: Db,
  org: string,
  userId: string,
  raw: PlayerInput,
): string {
  const v = validate(raw);
  return db.tx(() => {
    const id = newId();
    const team = teamId(db, org, v.teamName, v.sport);
    const season = seasonId(db, org, v.season);
    db.run(
      `insert into players (id, organization_id, first_name, last_name, team_id, season_id, sport, position, graduation_year, created_by)
       values (:id, :org, :first, :last, :team, :season, :sport, :position, :year, :user)`,
      {
        id,
        org,
        first: v.firstName,
        last: v.lastName,
        team,
        season,
        sport: v.sport,
        position: v.position,
        year: v.year,
        user: userId,
      },
    );
    if (v.jersey !== null) assignNumber(db, org, id, team, season, v.jersey);
    return id;
  });
}

export function updatePlayer(db: Db, org: string, id: string, raw: PlayerInput): void {
  const v = validate(raw);
  db.tx(() => {
    const team = teamId(db, org, v.teamName, v.sport);
    const season = seasonId(db, org, v.season);
    const changed = db.run(
      `update players set first_name = :first, last_name = :last, team_id = :team, season_id = :season, sport = :sport,
         position = :position, graduation_year = :year where id = :id and organization_id = :org`,
      {
        id,
        org,
        first: v.firstName,
        last: v.lastName,
        team,
        season,
        sport: v.sport,
        position: v.position,
        year: v.year,
      },
    );
    if (changed.changes === 0) throw new ValidationError("That player was not found.");
    if (v.jersey !== null) {
      // The number for THIS team + season is replaced; other seasons stay.
      db.run(
        "delete from player_numbers where player_id = :id and team_id = :team and season_id = :season and jersey_number != :j",
        { id, team, season, j: v.jersey },
      );
      assignNumber(db, org, id, team, season, v.jersey);
    }
  });
}

/** Give a player a number for another team or season (next year's #24, say). */
export function addPlayerNumber(
  db: Db,
  org: string,
  playerId: string,
  teamName: string,
  season: string,
  raw: string,
): void {
  const jersey = normalizeJerseyNumber(raw);
  if (jersey === null)
    throw new ValidationError("A jersey number is one or two digits, 0–99 or 00.");
  if (teamName.trim() === "" || season.trim() === "")
    throw new ValidationError("Enter the team and the season.");
  db.tx(() => {
    const owned = db.get(
      "select 1 from players where id = :id and organization_id = :org",
      { id: playerId, org },
    );
    if (owned === undefined) throw new ValidationError("That player was not found.");
    assignNumber(
      db,
      org,
      playerId,
      teamId(db, org, teamName.trim(), null),
      seasonId(db, org, season.trim()),
      jersey,
    );
  });
}

export function removePlayerNumber(db: Db, org: string, numberId: string): void {
  db.run("delete from player_numbers where id = :id and organization_id = :org", {
    id: numberId,
    org,
  });
}

const SELECT = `
  select pl.id, pl.first_name, pl.last_name, pl.team_id, t.name as team_name, pl.season_id, s.name as season_name,
         pl.sport, pl.position, pl.graduation_year, pl.profile_photo_id,
         (select jersey_number from player_numbers pn where pn.player_id = pl.id and pn.team_id = pl.team_id and pn.season_id = pl.season_id) as jersey_number
    from players pl join teams t on t.id = pl.team_id join seasons s on s.id = pl.season_id`;

export function getPlayer(db: Db, org: string, id: string): PlayerRow | undefined {
  return db.get<PlayerRow>(
    `${SELECT} where pl.id = :id and pl.organization_id = :org`,
    { id, org },
  );
}

export function listPlayers(
  db: Db,
  org: string,
  medium: number,
): Array<PlayerRow & { photo_count: number }> {
  const players = db.all<PlayerRow>(
    `${SELECT} where pl.organization_id = :org order by pl.last_name, pl.first_name`,
    { org },
  );
  // One set query per player: rosters are tens of players, and each count is
  // an indexed lookup.
  const countSql = `select count(*) as n from (${PHOTOS_OF_PLAYERS("pl.id = :player and pl.organization_id = :org")})`;
  return players.map((p) => ({
    ...p,
    photo_count: db.get<{ n: number }>(countSql, { player: p.id, org, medium })?.n ?? 0,
  }));
}

export function playerNumbers(db: Db, org: string, playerId: string): PlayerNumber[] {
  return db.all<PlayerNumber>(
    `select pn.id, pn.jersey_number, t.name as team_name, s.name as season_name
       from player_numbers pn join teams t on t.id = pn.team_id join seasons s on s.id = pn.season_id
      where pn.player_id = :id and pn.organization_id = :org order by s.name desc`,
    { id: playerId, org },
  );
}

export function playerEvents(db: Db, org: string, playerId: string, medium: number) {
  return db.all<{ id: string; name: string; event_date: string; photos: number }>(
    `select e.id, e.name, e.event_date, count(*) as photos
       from photos p join events e on e.id = p.event_id
      where p.organization_id = :org and ${PHOTO_OF_PLAYER("p", ":player")}
      group by e.id order by e.event_date desc`,
    { org, player: playerId, medium },
  );
}

export function deletePlayer(db: Db, org: string, id: string): void {
  db.run("delete from players where id = :id and organization_id = :org", { id, org });
}

export function setProfilePhoto(
  db: Db,
  org: string,
  playerId: string,
  photoId: string,
): void {
  const owned = db.get(
    "select 1 from photos where id = :p and organization_id = :org",
    { p: photoId, org },
  );
  if (owned === undefined) throw new ValidationError("That photo was not found.");
  db.run(
    "update players set profile_photo_id = :p where id = :id and organization_id = :org",
    { p: photoId, id: playerId, org },
  );
}

/** Tag photos with a player by hand (bulk "assign player"). */
export function tagPlayer(
  db: Db,
  org: string,
  userId: string,
  photoIds: readonly string[],
  playerId: string,
): void {
  db.tx(() => {
    const owned = db.get(
      "select 1 from players where id = :id and organization_id = :org",
      { id: playerId, org },
    );
    if (owned === undefined) throw new ValidationError("That player was not found.");
    for (const photo of photoIds) {
      db.run(
        `insert into photo_player_tags (organization_id, photo_id, player_id, created_by)
         select :org, id, :player, :user from photos where id = :photo and organization_id = :org
         on conflict do nothing`,
        { org, photo, player: playerId, user: userId },
      );
    }
  });
}

export function untagPlayer(
  db: Db,
  org: string,
  photoIds: readonly string[],
  playerId: string,
): void {
  db.tx(() => {
    for (const photo of photoIds) {
      db.run(
        "delete from photo_player_tags where photo_id = :photo and player_id = :player and organization_id = :org",
        {
          photo,
          player: playerId,
          org,
        },
      );
    }
  });
}
