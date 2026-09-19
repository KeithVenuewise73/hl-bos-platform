import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { CAST_MEMBER_IDS, INTIMACY_LEVELS } from "./types.js";
import { CREDIT_COSTS } from "./credits.js";

// Migration 0050 carries the engine's vocabulary as Postgres enums. A
// translation layer between the two would be a place for drift to hide, and
// drift here breaks credit settlement silently — a job type the database does
// not recognise cannot be settled at all.
//
// So the two lists are asserted against each other, from the migration file
// itself rather than from a copy of it.

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(
  here,
  "../../../supabase/migrations/20260919120000_hlbos_0050_sceneflow.sql",
);

const sql = readFileSync(MIGRATION, "utf8");

/** Pull the values out of `create type sceneflow.<name> as enum (...)`. */
function enumValues(name: string): string[] {
  const match = new RegExp(
    `create type sceneflow\\.${name} as enum\\s*\\(([^)]*)\\)`,
    "i",
  ).exec(sql);
  if (!match?.[1]) throw new Error(`enum not found in migration: ${name}`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1] as string);
}

describe("migration 0050 mirrors the engine's vocabulary", () => {
  it("member_key matches CAST_MEMBER_IDS exactly", () => {
    expect(enumValues("member_key")).toEqual([...CAST_MEMBER_IDS]);
  });

  it("intimacy_level matches INTIMACY_LEVELS exactly", () => {
    expect(enumValues("intimacy_level")).toEqual([...INTIMACY_LEVELS]);
  });

  it("generation_type covers every type the credit table prices", () => {
    expect(enumValues("generation_type").sort()).toEqual(
      Object.keys(CREDIT_COSTS).sort(),
    );
  });

  it("caps the cast at eight by the type itself, not by a validation", () => {
    expect(enumValues("member_key")).toHaveLength(8);
  });
});

describe("migration 0050 keeps its structural refusals", () => {
  // Each of these is proved behaviourally by supabase/tests/50_sceneflow.sql
  // against a real PostgreSQL. These assertions are the cheap tripwire that
  // notices if one is deleted from the file during a refactor.
  const required = [
    "casts_ready_requires_attestation",
    "generation_jobs_blocked_is_free",
    "scenes_ready_has_image",
    "credit_ledger_debit_is_negative",
    "cast_references_path_owner_scoped",
    "scenes_image_owner_scoped",
  ];

  for (const constraint of required) {
    it(`still declares ${constraint}`, () => {
      expect(sql).toContain(constraint);
    });
  }

  it("grants UPDATE on scenes at column level only", () => {
    expect(sql).toContain(
      "grant update (favorite) on sceneflow.scenes to authenticated",
    );
    expect(sql).not.toMatch(/grant [^;]*\bupdate\b(?!\s*\()[^;]*on sceneflow\.scenes/);
  });

  it("gives moderation_events no grant of any kind", () => {
    expect(sql).not.toMatch(/grant[^;]*on sceneflow\.moderation_events/);
  });
});
