import "server-only";
import { readEnvFile } from "./secrets";

/**
 * Read-only Supabase Management API client.
 *
 * Shows what is really there. It never applies a migration -- that is a
 * separate, approved action, not a side effect of loading a dashboard.
 */

export interface SupabaseProject {
  ref: string;
  name: string;
  region: string;
  status: string;
  pgVersion: string;
}

export interface AppliedMigration {
  version: string;
  name: string;
}

export type SupabaseState =
  | { connected: false; reason: string }
  | {
      connected: true;
      project: SupabaseProject;
      applied: AppliedMigration[];
      /** Migrations in the repo that are NOT yet applied. */
      pending: string[];
      /** Plain-English summary of where the database stands. */
      summary: string;
    };

const API = "https://api.supabase.com/v1";

async function sb<T>(path: string, tk: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${tk}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase ${res.status} on ${path}`);
  return (await res.json()) as T;
}

export async function supabaseState(repoMigrations: string[]): Promise<SupabaseState> {
  const env = await readEnvFile();
  const tk = env["SUPABASE_ACCESS_TOKEN"];
  const ref = env["HLBOS_SUPABASE_PROJECT_REF"];

  if (!tk) {
    return {
      connected: false,
      reason:
        "Supabase is not connected yet. Add an access token to see the database status.",
    };
  }
  if (!ref) {
    return { connected: false, reason: "No Supabase project has been chosen yet." };
  }

  try {
    const p = await sb<{
      id: string;
      name: string;
      region: string;
      status: string;
      database?: { version?: string };
    }>(`/projects/${ref}`, tk);

    let applied: AppliedMigration[] = [];
    try {
      applied = await sb<AppliedMigration[]>(
        `/projects/${ref}/database/migrations`,
        tk,
      );
    } catch {
      // A project with no migration history returns an error rather than [].
      applied = [];
    }

    const appliedVersions = new Set(applied.map((m) => m.version));
    const pending = repoMigrations.filter((f) => {
      const v = /^(\d{14})_/.exec(f)?.[1];
      return v ? !appliedVersions.has(v) : false;
    });

    const summary =
      applied.length === 0 && pending.length > 0
        ? `The database is empty. ${pending.length} change${pending.length > 1 ? "s are" : " is"} built and tested but not yet applied.`
        : pending.length === 0
          ? "The database is up to date with everything in the repository."
          : `${pending.length} change${pending.length > 1 ? "s are" : " is"} waiting to be applied.`;

    return {
      connected: true,
      project: {
        ref: p.id,
        name: p.name,
        region: p.region,
        status: p.status,
        pgVersion: p.database?.version ?? "unknown",
      },
      applied,
      pending,
      summary,
    };
  } catch (e) {
    return { connected: false, reason: (e as Error).message };
  }
}
