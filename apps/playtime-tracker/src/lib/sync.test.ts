import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { OutboxItem } from "@hl-bos/playtime-engine";
import { rowFor, table } from "./sync";

/**
 * Does what this app sends match what the database actually has?
 *
 * The rest of the sync path is exercised by the engine's own queue tests, but
 * nothing there can catch the failure that would really hurt: a column renamed
 * in the migration, or a field this client invents, producing a sync that is
 * rejected on every attempt at a field with no signal — where nobody would
 * find out until the game was over.
 *
 * So this test reads migration 0049 itself and checks every key this client
 * would send against the columns that migration creates. It cannot pass while
 * the two disagree.
 */

function migrationSql(): string {
  const dir = path.resolve(__dirname, "../../../../supabase/migrations");
  const file = readdirSync(dir).find((f) => f.includes("playtime_tracker"));
  if (!file) throw new Error("migration 0049 not found");
  return readFileSync(path.join(dir, file), "utf8");
}

/** Column names declared in `create table if not exists playtime.<name> ( … )`. */
function columnsOf(sql: string, tableName: string): Set<string> {
  const start = sql.indexOf(`create table if not exists playtime.${tableName} (`);
  if (start < 0) throw new Error(`table playtime.${tableName} not found in the migration`);
  const open = sql.indexOf("(", start);
  let depth = 0;
  let end = open;
  for (let i = open; i < sql.length; i++) {
    if (sql[i] === "(") depth += 1;
    else if (sql[i] === ")") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  const columns = new Set<string>();
  let nesting = 0;
  for (const raw of sql.slice(open + 1, end).split("\n")) {
    const line = raw.trim();
    // Skip table-level constraints and anything inside a multi-line one.
    const opens = (line.match(/\(/g) ?? []).length;
    const closes = (line.match(/\)/g) ?? []).length;
    const wasNested = nesting > 0;
    nesting += opens - closes;
    if (wasNested) continue;
    if (line === "" || line.startsWith("--")) continue;
    if (/^(constraint|unique|primary key|foreign key|check)\b/i.test(line)) continue;
    const match = /^([a-z_][a-z0-9_]*)\s/.exec(line);
    if (match?.[1]) columns.add(match[1]);
  }
  return columns;
}

const OWNER = "11111111-1111-4111-8111-111111111111";

const item = (kind: OutboxItem["kind"], payload: unknown): OutboxItem => ({
  id: "outbox-1",
  kind,
  recordId: "record-1",
  payload,
  queuedAt: "2026-09-12T18:00:00.000Z",
  attempts: 0,
  nextAttemptAt: 0,
  lastError: null,
});

const SAMPLES: ReadonlyArray<readonly [OutboxItem["kind"], unknown]> = [
  [
    "team",
    {
      id: "t1",
      name: "Orchard Park U12",
      sport: "football",
      archivedAt: null,
      createdAt: "2026-09-12T18:00:00.000Z",
      updatedAt: "2026-09-12T18:00:00.000Z",
    },
  ],
  [
    "player",
    {
      id: "p1",
      teamId: "t1",
      firstName: "Dominic",
      lastName: "Herman",
      jerseyNumber: "22",
      position: "RB",
      active: true,
    },
  ],
  [
    "game",
    {
      id: "g1",
      teamId: "t1",
      opponent: "West Seneca",
      gameDate: "2026-09-12",
      periodCount: 4,
      periodSeconds: 720,
      minimum: { kind: "percent", percent: 25 },
      rosterPlayerIds: ["p1"],
      score: { us: 21, them: 14 },
    },
  ],
  ["game_score", { id: "g1", score: { us: 21, them: 14 } }],
  [
    "game_event",
    {
      id: "e1",
      gameId: "g1",
      type: "player_in",
      at: "2026-09-12T18:00:00.000Z",
      seq: 3,
      playerId: "p1",
    },
  ],
];

describe("every field this app syncs exists in migration 0049", () => {
  const sql = migrationSql();

  for (const [kind, payload] of SAMPLES) {
    it(`${kind} → playtime.${table(kind)}`, () => {
      const columns = columnsOf(sql, table(kind));
      const sent = Object.keys(rowFor(item(kind, payload), OWNER));
      expect(sent.length).toBeGreaterThan(0);
      for (const key of sent) {
        expect(columns, `playtime.${table(kind)} has no column "${key}"`).toContain(key);
      }
    });
  }

  it("always stamps the owner, so a row can never be written unowned", () => {
    for (const [kind, payload] of SAMPLES) {
      expect(rowFor(item(kind, payload), OWNER)["owner_id"]).toBe(OWNER);
    }
  });

  it("maps a percentage target onto minimum_kind and minimum_value", () => {
    const row = rowFor(item("game", {
      id: "g1", teamId: "t1", opponent: "", gameDate: "2026-09-12",
      periodCount: 4, periodSeconds: 720,
      minimum: { kind: "percent", percent: 25 }, rosterPlayerIds: [], score: null,
    }), OWNER);
    expect(row["minimum_kind"]).toBe("percent");
    expect(row["minimum_value"]).toBe(25);
  });

  it("sends no minimum_value when there is no target, rather than zero", () => {
    // The migration's CHECK constraint rejects a 'none' target carrying a
    // value, and 0 would in any case be a different and false claim.
    const row = rowFor(item("game", {
      id: "g1", teamId: "t1", opponent: "", gameDate: "2026-09-12",
      periodCount: 4, periodSeconds: 720,
      minimum: { kind: "none" }, rosterPlayerIds: [], score: null,
    }), OWNER);
    expect(row["minimum_kind"]).toBe("none");
    expect(row["minimum_value"]).toBeNull();
  });

  it("leaves an unrecorded score null instead of inventing 0-0", () => {
    const row = rowFor(item("game_score", { id: "g1", score: null }), OWNER);
    expect(row["score_us"]).toBeNull();
    expect(row["score_them"]).toBeNull();
  });

  it("carries the device-minted event id through as the row's primary key", () => {
    const row = rowFor(item("game_event", {
      id: "the-tap-id", gameId: "g1", type: "game_started",
      at: "2026-09-12T18:00:00.000Z", seq: 0,
    }), OWNER);
    expect(row["id"]).toBe("the-tap-id");
    expect(row["player_id"]).toBeNull();
    expect(row["period"]).toBeNull();
  });
});
