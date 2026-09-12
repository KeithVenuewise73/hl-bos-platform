import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CALLED_RPCS, SELECTED_COLUMNS } from "./columns";

/**
 * Keeps this app and migration 0048 in step.
 *
 * The row types in lib/types.ts are hand-written, because generating them needs
 * a live Supabase project and this app has to typecheck and build without one.
 * That trade has one failure mode: a column renamed in the migration still
 * typechecks here and blows up in front of a coach.
 *
 * So this test reads the migration and asserts that every column this app
 * SELECTs and every RPC argument it PASSES actually exists. It is the one test
 * in the app that fails when the database changes underneath it, which is
 * exactly when it should.
 */

// Resolved from THIS FILE, not from process.cwd(): the suite runs both from
// inside the app and from the repo root, and a cwd-relative path passes in one
// and silently fails to find the migration in the other.
const MIGRATION = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../../supabase/migrations/20260912090000_hlbos_0048_football_filmstudy.sql",
  ),
  "utf8",
);

/** Column names declared for one `create table if not exists filmstudy.<name>`. */
function columnsOf(table: string): string[] {
  const start = MIGRATION.indexOf(`create table if not exists filmstudy.${table} (`);
  if (start === -1) throw new Error(`table filmstudy.${table} is not in the migration`);

  // Walk to the matching close paren so a nested `check (...)` does not end it.
  const open = MIGRATION.indexOf("(", start);
  let depth = 0;
  let end = open;
  for (let i = open; i < MIGRATION.length; i += 1) {
    const ch = MIGRATION[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  return MIGRATION.slice(open + 1, end)
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        !line.startsWith("--") &&
        !line.startsWith("constraint") &&
        !line.startsWith(")"),
    )
    .map((line) => line.split(/\s+/)[0] ?? "")
    .filter((name) => /^[a-z][a-z0-9_]*$/.test(name));
}

describe("every column this app selects exists in migration 0048", () => {
  for (const [table, wanted] of Object.entries(SELECTED_COLUMNS)) {
    it(`filmstudy.${table}`, () => {
      const declared = new Set(columnsOf(table));
      const missing = wanted.filter((column) => !declared.has(column));
      expect(missing, `missing from filmstudy.${table}`).toEqual([]);
    });
  }
});

/** The parameter list of one filmstudy function, as {name, hasDefault} entries. */
function parametersOf(name: string): { name: string; hasDefault: boolean }[] {
  const signature = MIGRATION.indexOf(`create or replace function filmstudy.${name}(`);
  if (signature === -1) {
    throw new Error(`filmstudy.${name} is not defined in the migration`);
  }

  const open = MIGRATION.indexOf("(", signature);
  let depth = 0;
  let close = open;
  for (let i = open; i < MIGRATION.length; i += 1) {
    const ch = MIGRATION[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }

  // Split on commas outside any nested paren, so a type like numeric(10,3)
  // does not split the parameter it belongs to.
  const parts: string[] = [];
  let buffer = "";
  let nested = 0;
  for (const ch of MIGRATION.slice(open + 1, close)) {
    if (ch === "(") nested += 1;
    if (ch === ")") nested -= 1;
    if (ch === "," && nested === 0) {
      parts.push(buffer);
      buffer = "";
    } else {
      buffer += ch;
    }
  }
  parts.push(buffer);

  return parts
    .map((part) => part.trim())
    .filter((part) => part.startsWith("p_"))
    .map((part) => ({
      name: part.split(/\s+/)[0] ?? "",
      hasDefault: /\bdefault\b/i.test(part),
    }));
}

describe("every RPC this app calls exists, with the arguments it passes", () => {
  for (const [name, args] of Object.entries(CALLED_RPCS)) {
    it(`filmstudy.${name} accepts every argument the app sends`, () => {
      const declared = parametersOf(name).map((p) => p.name);
      const missing = args.filter((arg) => !declared.includes(arg));
      expect(missing, `arguments not accepted by filmstudy.${name}`).toEqual([]);
    });

    // PostgREST resolves a function by the EXACT set of named arguments in the
    // request body. A parameter the app leaves out must therefore carry a
    // DEFAULT, or the call does not resolve and a coach gets a 404 from an
    // action that typechecks perfectly. Neither typecheck nor the pgTAP suite
    // catches this: pgTAP calls these functions positionally.
    it(`filmstudy.${name} defaults every argument the app omits`, () => {
      const unresolvable = parametersOf(name)
        // `args` is a readonly tuple of literals, so widen before the lookup.
        .filter((p) => !(args as readonly string[]).includes(p.name) && !p.hasDefault)
        .map((p) => p.name);
      expect(
        unresolvable,
        `filmstudy.${name} would not resolve over PostgREST: these parameters are neither sent nor defaulted`,
      ).toEqual([]);
    });
  }
});

describe("the migration keeps its structural promises", () => {
  // These are asserted in pgTAP too, against a real database. They are
  // repeated here because this test runs in the fast suite on every commit,
  // and a regression in either is a security regression.
  it("grants no direct write on any filmstudy table", () => {
    expect(MIGRATION).not.toMatch(
      /grant\s+(insert|update|delete)[^;]*on\s+filmstudy\./i,
    );
  });

  it("never grants anything in the schema to anon", () => {
    expect(MIGRATION).not.toMatch(/grant[^;]*\bto\s+anon\b/i);
  });

  it("keeps opponent film unreachable for athletes, structurally", () => {
    expect(MIGRATION).toContain("film_opponent_never_athlete_visible");
  });

  it("gives no tenant path to record an AI prediction", () => {
    expect(MIGRATION).toMatch(
      /revoke all on function filmstudy\.record_prediction[^;]*from public, anon, authenticated;/,
    );
  });
});
