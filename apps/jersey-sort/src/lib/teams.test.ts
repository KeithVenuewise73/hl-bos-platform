/**
 * TEAM + NUMBER, end to end through the store: two teams, two jersey shades,
 * the same number on both. And the upgrade that brings an existing database
 * to the two-team schema without losing a row.
 */
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

import {
  DEFAULT_THRESHOLDS,
  type EventTeams,
  type ImageAnalysisProvider,
  type JerseyShade,
  type ProviderReading,
  teamSideFor,
} from "@hl-bos/jersey-sort";
import { describe, expect, it } from "vitest";

import { openDb, SCHEMA_VERSION } from "./db-core.ts";
import { ingestPhoto } from "./ingest.ts";
import { drain } from "./queue-core.ts";
import {
  createEvent,
  type EventInput,
  getEvent,
  numberGroups,
  updateEvent,
} from "./repo/events.ts";
import { listPhotos, photoDetections, photoPlayers } from "./repo/photos.ts";
import { createPlayer } from "./repo/players.ts";
import {
  addNumber,
  assignNumberJersey,
  changeNumber,
  setDetectionJersey,
} from "./repo/review.ts";
import { DETECTION_TEAM } from "./repo/sql.ts";
import { account, freshDb, jpeg } from "./test-helpers.ts";

const GAME: EventInput = {
  name: "Caz vs Wheatfield",
  sport: "Football",
  teamName: "Caz",
  opponent: "Wheatfield",
  homeJersey: "dark",
  awayJersey: "light",
  eventDate: "2026-10-04",
  location: "",
  season: "2026",
  notes: "",
};

/** Answers photo by photo, in upload order. */
function scripted(answers: ProviderReading[][]): ImageAnalysisProvider {
  let i = 0;
  return {
    info: {
      id: "scripted",
      model: "s-1",
      label: "Scripted",
      method: "vision_model",
      understandsContext: true,
    },
    analyze: () =>
      Promise.resolve({
        athletesPresent: true,
        athleteCount: 1,
        readings: answers[i++] ?? [],
      }),
  };
}

const n22 = (jersey?: JerseyShade | "unknown"): ProviderReading => ({
  text: "22",
  confidence: 0.95,
  location: "jersey_back",
  box: null,
  ...(jersey === undefined ? {} : { jersey }),
});

function player(
  db: ReturnType<typeof freshDb>["db"],
  org: string,
  user: string,
  first: string,
  team: string,
) {
  return createPlayer(db, org, user, {
    firstName: first,
    lastName: team,
    jerseyNumber: "22",
    teamName: team,
    sport: "Football",
    season: "2026",
    position: "",
    graduationYear: "",
  });
}

async function game(readings: ProviderReading[][], input: EventInput = GAME) {
  const { db, dataDir } = freshDb();
  const { userId, organizationId: org } = account(db);
  const eventId = createEvent(db, org, userId, input);
  const photos: string[] = [];
  for (let i = 0; i < readings.length; i++) {
    const r = await ingestPhoto(db, dataDir, {
      org,
      userId,
      eventId,
      filename: `p${i}.jpg`,
      // Its own camera time, so its bytes differ and it is not a duplicate.
      bytes: await jpeg("22", {
        exifDate: `2026:10:04 18:00:${String(i).padStart(2, "0")}`,
      }),
    });
    if (!r.ok) throw new Error(r.reason);
    photos.push(r.photoId);
  }
  const provider = scripted(readings);
  await drain({ db, dataDir, provider: () => provider }, 1);
  const cazId = player(db, org, userId, "Caz", "Caz");
  const wfId = player(db, org, userId, "Wheat", "Wheatfield");
  const gallery = (playerId: string) =>
    listPhotos(db, org, userId, DEFAULT_THRESHOLDS, { playerId })
      .tiles.map((t) => t.id)
      .sort();
  return { db, dataDir, org, userId, eventId, photos, cazId, wfId, gallery };
}

describe("an event's two teams", () => {
  it("stores home and away teams with their jerseys", () => {
    const { db } = freshDb();
    const { userId, organizationId: org } = account(db);
    const id = createEvent(db, org, userId, GAME);
    const e = getEvent(db, org, id);
    expect(e).toMatchObject({
      team_name: "Caz",
      opponent: "Wheatfield",
      home_jersey: "dark",
      away_jersey: "light",
    });
    expect(e?.away_team_id).not.toBeNull();
    updateEvent(db, org, id, { ...GAME, homeJersey: "light", awayJersey: "dark" });
    expect(getEvent(db, org, id)).toMatchObject({
      home_jersey: "light",
      away_jersey: "dark",
    });
  });

  it("refuses two teams in the same shade, the same team twice, and a jersey for no team", () => {
    const { db } = freshDb();
    const { userId, organizationId: org } = account(db);
    expect(() => createEvent(db, org, userId, { ...GAME, awayJersey: "dark" })).toThrow(
      "Both teams are set to dark",
    );
    expect(() => createEvent(db, org, userId, { ...GAME, opponent: "caz" })).toThrow(
      "must be different teams",
    );
    expect(() =>
      createEvent(db, org, userId, { ...GAME, opponent: "", awayJersey: "light" }),
    ).toThrow("Enter the away team's name");
    expect(() => createEvent(db, org, userId, { ...GAME, homeJersey: "grey" })).toThrow(
      "Light or Dark",
    );
  });

  it("is refused by the database itself, not only by the form", () => {
    const { db } = freshDb();
    const { userId, organizationId: org } = account(db);
    const id = createEvent(db, org, userId, GAME);
    expect(() =>
      db.run("update events set away_jersey = 'dark' where id = :id", { id }),
    ).toThrow("CHECK constraint failed");
    expect(() =>
      db.run("update events set away_team_id = team_id where id = :id", { id }),
    ).toThrow("CHECK constraint failed");
  });
});

describe("TEAM + NUMBER", () => {
  it("files a dark #22 under Caz's #22 and a light #22 under Wheatfield's", async () => {
    const g = await game([[n22("dark")], [n22("light")]]);
    expect(g.gallery(g.cazId)).toEqual([g.photos[0]]);
    expect(g.gallery(g.wfId)).toEqual([g.photos[1]]);
    expect(
      photoPlayers(g.db, g.org, g.photos[0] ?? "", 0.6).map((p) => p.name),
    ).toEqual(["Caz Caz"]);
  });

  it("files a photo with both #22s under both athletes", async () => {
    const g = await game([[n22("dark"), n22("light")]]);
    expect(g.gallery(g.cazId)).toEqual([g.photos[0]]);
    expect(g.gallery(g.wfId)).toEqual([g.photos[0]]);
    expect(
      photoDetections(g.db, g.org, g.photos[0] ?? "")
        .map((d) => d.team_name)
        .sort(),
    ).toEqual(["Caz", "Wheatfield"]);
  });

  it("never guesses the team of a #22 whose jersey was not seen", async () => {
    const g = await game([[n22("unknown")], [n22()]]);
    expect(g.gallery(g.cazId)).toEqual([]);
    expect(g.gallery(g.wfId)).toEqual([]);
    const groups = numberGroups(g.db, g.org, g.eventId, 0.6);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ value: "22", team_id: null, photo_count: 2 });
  });

  it("splits the event's galleries by team", async () => {
    const g = await game([[n22("dark")], [n22("light")], [n22("dark")], [n22()]]);
    const groups = numberGroups(g.db, g.org, g.eventId, 0.6)
      .map(
        (x) =>
          `${x.team_name ?? "team not known"} #${x.value}: ${x.photo_count} · ${x.player_name ?? "-"}`,
      )
      .sort();
    expect(groups).toEqual([
      "Caz #22: 2 · Caz Caz",
      "Wheatfield #22: 1 · Wheat Wheatfield",
      "team not known #22: 1 · -",
    ]);
  });

  it("follows a correction of the event's colors to every photo at once", async () => {
    const g = await game([[n22("dark")]]);
    updateEvent(g.db, g.org, g.eventId, {
      ...GAME,
      homeJersey: "light",
      awayJersey: "dark",
    });
    expect(g.gallery(g.cazId)).toEqual([]);
    expect(g.gallery(g.wfId)).toEqual([g.photos[0]]);
  });

  it("lets a person say which team a #22 is, keeping the AI's reading inspectable", async () => {
    const g = await game([[n22("unknown")]]);
    const [d] = photoDetections(g.db, g.org, g.photos[0] ?? "");
    setDetectionJersey(g.db, g.org, g.userId, d?.id ?? "", "light", DEFAULT_THRESHOLDS);
    expect(g.gallery(g.wfId)).toEqual([g.photos[0]]);
    expect(g.gallery(g.cazId)).toEqual([]);
    const all = photoDetections(g.db, g.org, g.photos[0] ?? "");
    expect(all.map((x) => `${x.status}:${x.jersey ?? "?"}:${x.method}`).sort()).toEqual(
      ["confirmed:light:manual", "rejected:?:vision_model"],
    );
  });

  it("assigns every team-less #22 of a game in one go, and only those", async () => {
    const g = await game([[n22()], [n22("unknown")], [n22("light")]]);
    const n = assignNumberJersey(
      g.db,
      g.org,
      g.userId,
      g.eventId,
      "22",
      "dark",
      DEFAULT_THRESHOLDS,
    );
    expect(n).toBe(2);
    expect(g.gallery(g.cazId)).toEqual([g.photos[0], g.photos[1]].sort());
    // The one already seen as light stays Wheatfield's.
    expect(g.gallery(g.wfId)).toEqual([g.photos[2]]);
    expect(
      numberGroups(g.db, g.org, g.eventId, 0.6).some((x) => x.team_id === null),
    ).toBe(false);
  });

  it("adds a number for a chosen team, and a misread keeps its team", async () => {
    const g = await game([[]]);
    addNumber(
      g.db,
      g.org,
      g.userId,
      g.photos[0] ?? "",
      "22",
      DEFAULT_THRESHOLDS,
      "dark",
    );
    expect(g.gallery(g.cazId)).toEqual([g.photos[0]]);
    const [d] = photoDetections(g.db, g.org, g.photos[0] ?? "");
    changeNumber(g.db, g.org, g.userId, d?.id ?? "", "23", DEFAULT_THRESHOLDS);
    const live = photoDetections(g.db, g.org, g.photos[0] ?? "").filter(
      (x) => x.status !== "rejected",
    );
    expect(live.map((x) => [x.detected_value, x.jersey])).toEqual([["23", "dark"]]);
  });

  it("refuses a jersey that is not light or dark, in the database", async () => {
    const g = await game([[n22("dark")]]);
    expect(() => g.db.run("update photo_detections set jersey = 'grey'", {})).toThrow(
      "CHECK constraint failed",
    );
  });

  it("keeps how one-team events worked before Home/Away: the event's team", async () => {
    const g = await game([[n22()]], {
      ...GAME,
      opponent: "",
      homeJersey: "",
      awayJersey: "",
    });
    expect(g.gallery(g.cazId)).toEqual([g.photos[0]]);
  });
});

describe("the SQL team rule and the engine's are the same rule", () => {
  it("agrees on every combination of jersey and event colors", () => {
    const { db } = freshDb();
    const { userId, organizationId: org } = account(db);
    const ev = createEvent(db, org, userId, GAME);
    const ids = db.get<{ team_id: string; away_team_id: string }>(
      "select team_id, away_team_id from events where id = :ev",
      { ev },
    );
    const shades = [null, "light", "dark"] as const;
    let checked = 0;
    for (const homeJersey of shades)
      for (const awayJersey of shades)
        for (const hasAwayTeam of [true, false])
          for (const jersey of shades) {
            if (homeJersey !== null && homeJersey === awayJersey) continue;
            const event: EventTeams = { homeJersey, awayJersey, hasAwayTeam };
            const side = teamSideFor(jersey, event);
            const expected =
              side === "home"
                ? ids?.team_id
                : side === "away"
                  ? ids?.away_team_id
                  : null;
            const got = db.get<{ t: string | null }>(
              `select ${DETECTION_TEAM("d", "e")} as t
                 from (select :jersey as jersey) d,
                      (select :team as team_id, :away as away_team_id, :hj as home_jersey, :aj as away_jersey) e`,
              {
                jersey,
                team: ids?.team_id ?? null,
                away: hasAwayTeam ? (ids?.away_team_id ?? null) : null,
                hj: homeJersey,
                aj: awayJersey,
              },
            )?.t;
            expect(got ?? null, JSON.stringify({ event, jersey })).toBe(
              expected ?? null,
            );
            checked += 1;
          }
    expect(checked).toBe(42);
  });
});

describe("upgrading a database made before Home/Away", () => {
  it("adds the new columns in place and keeps every row", () => {
    const { db, dataDir } = freshDb();
    const { userId, organizationId: org } = account(db);
    const id = createEvent(db, org, userId, {
      ...GAME,
      opponent: "",
      homeJersey: "",
      awayJersey: "",
    });
    db.raw.close();

    // Make it a version-1 database: the columns version 2 adds are not there.
    const file = path.join(dataDir, "test.db");
    const v1 = new DatabaseSync(file);
    for (const [table, column] of [
      ["photo_detections", "jersey"],
      ["events", "away_jersey"],
      ["events", "home_jersey"],
      ["events", "away_team_id"],
    ] as const) {
      v1.exec(`alter table ${table} drop column ${column}`);
    }
    v1.exec("pragma user_version = 1");
    v1.exec(`update events set opponent = 'Wheatfield' where id = '${id}'`);
    v1.close();

    const upgraded = openDb(file);
    expect(
      upgraded.get<{ v: number }>("select user_version as v from pragma_user_version")
        ?.v,
    ).toBe(SCHEMA_VERSION);
    expect(getEvent(upgraded, org, id)).toMatchObject({
      name: "Caz vs Wheatfield",
      opponent: "Wheatfield",
      away_team_id: null,
      home_jersey: null,
    });
    // ...and it is usable as a two-team event straight away.
    updateEvent(upgraded, org, id, GAME);
    expect(getEvent(upgraded, org, id)?.away_jersey).toBe("light");
    // Opening it again changes nothing.
    upgraded.raw.close();
    const again = openDb(file);
    expect(getEvent(again, org, id)?.home_jersey).toBe("dark");
  });
});
