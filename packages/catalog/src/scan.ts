/**
 * Repository scanner.
 *
 * Reads the repository from disk and reports what physically exists — schemas,
 * tables, migrations, edge functions, apps, packages, tests. This is the ground
 * truth the curated registry is reconciled against. It invents nothing: if a
 * schema is not in a migration file, it is not "discovered".
 *
 * Governance principle (Atlas): every repository scan updates the catalog's
 * completeness picture. An asset that exists on disk but is not registered
 * shows up as a gap, not as silent coverage.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export interface DiscoveredInventory {
  /** Distinct schema names created across all migrations. */
  schemas: string[];
  /** Total `create table` statements across all migrations. */
  tables: number;
  /** Migration file names (sorted). */
  migrations: string[];
  /** Edge-function directory names (includes `_shared`). */
  edgeFunctions: string[];
  /** App directory names under `apps/`. */
  apps: string[];
  /** Package directory names under `packages/`. */
  packages: string[];
  /** Count of database + package test files found. */
  testFiles: number;
}

const APPLICATION_SCHEMAS = new Set([
  "platform",
  "identity",
  "audit",
  "events",
  "entitlements",
  "integrations",
  "ai",
  "workflows",
  "visibility",
  "billing",
  "storage_meta",
  "comms",
  "discovery",
  "sales",
  "provisioning",
  "hlvs",
  "bti",
  "intake",
  "social",
]);

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

async function safeReaddirDirs(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * Scan the repository at `root` (the folder containing `supabase/`, `apps/`,
 * `packages/`). Missing folders degrade to empty results rather than throwing,
 * so the console never crashes on a partial checkout.
 */
export async function scanRepository(root: string): Promise<DiscoveredInventory> {
  const migrationsDir = path.join(root, "supabase", "migrations");
  const migrationFiles = (await safeReaddir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const schemas = new Set<string>();
  let tables = 0;

  const schemaRe = /create\s+schema\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi;
  const tableRe =
    /create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)\.[a-z_][a-z0-9_]*/gi;

  for (const file of migrationFiles) {
    let sql: string;
    try {
      sql = await readFile(path.join(migrationsDir, file), "utf8");
    } catch {
      continue;
    }
    for (const m of sql.matchAll(schemaRe)) {
      const name = m[1];
      if (name && APPLICATION_SCHEMAS.has(name)) schemas.add(name);
    }
    for (const m of sql.matchAll(tableRe)) {
      const schema = m[1];
      if (schema && APPLICATION_SCHEMAS.has(schema)) tables += 1;
    }
  }

  const fnEntries = await safeReaddirDirs(path.join(root, "supabase", "functions"));
  const edgeFunctions = fnEntries.filter((n) => n !== "tests").sort();

  const apps = (await safeReaddirDirs(path.join(root, "apps"))).sort();
  const packages = (await safeReaddirDirs(path.join(root, "packages"))).sort();

  const dbTests = (await safeReaddir(path.join(root, "supabase", "tests"))).filter(
    (f) => f.endsWith(".sql"),
  ).length;

  let pkgTests = 0;
  for (const pkg of packages) {
    pkgTests += await countTestsRecursive(path.join(root, "packages", pkg, "src"));
  }

  return {
    schemas: [...schemas].sort(),
    tables,
    migrations: migrationFiles,
    edgeFunctions,
    apps,
    packages,
    testFiles: dbTests + pkgTests,
  };
}

async function countTestsRecursive(dir: string): Promise<number> {
  let count = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      count += await countTestsRecursive(path.join(dir, e.name));
    } else if (e.name.endsWith(".test.ts")) {
      count += 1;
    }
  }
  return count;
}
