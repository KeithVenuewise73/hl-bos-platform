// Security packages S-A, S-B1, S-B2 and S-C (supabase/proposed/security/), applied to the
// PRODUCTION-EQUIVALENT schema to show what each one changes for every role, that the
// one real reader of the JobScout views (the service-role dashboard) keeps working, that
// trigger functions keep firing, and that each rollback restores today's privileges.
// Nothing here touches a hosted project. Runs when HLBOS_LOCAL_PG is set.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { psql, type LocalPg } from "./local-pg.ts";

const ENV = process.env["HLBOS_LOCAL_PG"];
const ROOT = path.resolve(import.meta.dirname, "../../..");
const pkg = (f: string) =>
  readFileSync(path.join(ROOT, "supabase/proposed/security", f), "utf8");

/** Every EXECUTE/SELECT privilege the three API roles hold on the objects these packages touch. */
const PRIVS = `select md5(string_agg(x, '|' order by x)) from (
  select r||' exec '||p.oid::regprocedure::text||'='||has_function_privilege(r, p.oid, 'execute') x
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
       unnest(array['anon','authenticated','service_role']) r
  where p.prosecdef and n.nspname in ('graph','dma','disco','barberos','transform_audit','platform','playtime')
  union all
  select r||' select '||v||'='||has_table_privilege(r, v, 'select')
  from unnest(array['jobscout.v_shortlist','jobscout.v_last_runs','disco.v_opportunity_board']) v,
       unnest(array['anon','authenticated','service_role']) r) t`;

/** The package's own list (production has exactly these 35; the local copy also carries
 *  disco._perftest_page, which production does not — one of the known fingerprint differences). */
const S_A_LIST = [
  ...pkg("sec_a_anon_definer_functions.sql").matchAll(
    /'([a-z_]+\.[a-z_0-9]+\([^']*\))'/g,
  ),
].map((m) => m[1]);
const ANON_DEFINER = `select count(*) from unnest(array[${S_A_LIST.map((f) => `'${f}'`).join(",")}]) f
  where to_regprocedure(f) is not null and has_function_privilege('anon', f::regprocedure, 'execute')`;

describe.skipIf(!ENV)("Security packages on the production-equivalent schema", () => {
  const i = (ENV ?? "/tmp:0").lastIndexOf(":");
  const pg: LocalPg = {
    host: (ENV ?? "/tmp:0").slice(0, i),
    port: (ENV ?? "/tmp:0").slice(i + 1),
    user: "postgres",
    database: "hlbos_security_test",
  };
  const db = (sql: string) => psql(pg, sql).trim();
  /** Run as a role; returns output or the error text. */
  const as = (role: string, sql: string) => {
    try {
      return db(`set role ${role}; ${sql}`);
    } catch (e) {
      return `ERROR ${String((e as { stderr?: unknown }).stderr ?? e)}`;
    }
  };
  let today = "";

  beforeAll(() => {
    psql(
      pg,
      `drop database if exists ${pg.database};\ncreate database ${pg.database};`,
      "postgres",
    );
    execFileSync(
      "bash",
      [path.join(ROOT, "scripts/local-test/build-prod-equivalent.sh"), pg.database],
      {
        env: { ...process.env, PGHOST: pg.host, PGPORT: pg.port, PGUSER: pg.user },
        stdio: "pipe",
      },
    );
    // Synthetic JobScout rows so view reads are observable.
    psql(
      pg,
      `insert into jobscout.companies (name) values ('Synthetic Co');
       insert into jobscout.resumes (label, content) values ('synthetic', 'synthetic');
       insert into jobscout.jobs (company_id, ats_job_id, title, is_open) values (1, 's1', 'Synthetic job', true);
       insert into jobscout.scores (job_id, resume_id, fit_score) values (1, 1, 50);
       insert into jobscout.runs (kind, ok, report) values ('score', true, '{}');`,
    );
    today = db(PRIVS);
  }, 300_000);

  it("S-B2 before: the public (anon) role can read the JobScout shortlist — the exposure", () => {
    expect(as("anon", "select count(*) from jobscout.v_shortlist")).toBe("1");
    expect(as("anon", "select count(*) from jobscout.v_last_runs")).toBe("1");
  });

  it("S-B2: the dashboard's service role still reads both views; anon and authenticated are refused", () => {
    psql(pg, pkg("sec_b2_jobscout_views.sql"));
    expect(as("service_role", "select count(*) from jobscout.v_shortlist")).toBe("1");
    expect(as("service_role", "select count(*) from jobscout.v_last_runs")).toBe("1");
    expect(as("anon", "select count(*) from jobscout.v_shortlist")).toMatch(
      /permission denied/,
    );
    expect(as("authenticated", "select count(*) from jobscout.v_last_runs")).toMatch(
      /permission denied/,
    );
    // rollback exactly as written in the package header
    psql(
      pg,
      `alter view jobscout.v_shortlist reset (security_invoker);
       alter view jobscout.v_last_runs reset (security_invoker);
       grant select on jobscout.v_shortlist, jobscout.v_last_runs to anon;`,
    );
    expect(db(PRIVS)).toBe(today);
  });

  it("S-A: anon loses EXECUTE on all 35 definer functions; nobody else's access changes", () => {
    expect(S_A_LIST).toHaveLength(35);
    expect(db(ANON_DEFINER)).toBe("35");
    const others = () =>
      db(`select md5(string_agg(x, '|' order by x)) from (
          select r||' '||p.oid::regprocedure::text||'='||has_function_privilege(r, p.oid, 'execute') x
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace, unnest(array['authenticated','service_role']) r
          where p.prosecdef and n.nspname in ('graph','dma','disco','barberos','transform_audit','platform','playtime')) t`);
    const before = others();
    psql(pg, pkg("sec_a_anon_definer_functions.sql"));
    expect(db(ANON_DEFINER)).toBe("0");
    expect(others()).toBe(before);
  });

  it("S-A: trigger functions still fire for a writer without EXECUTE (the new-user trigger)", () => {
    psql(
      pg,
      // roles are cluster-wide, so a previous run may have left it
      `do $$ begin if not exists (select 1 from pg_roles where rolname = 'trigger_probe') then create role trigger_probe; end if; end $$; grant usage on schema auth to trigger_probe; grant insert on auth.users to trigger_probe;`,
    );
    expect(
      db(
        `select has_function_privilege('trigger_probe', 'playtime.handle_new_user()', 'execute')`,
      ),
    ).toBe("f");
    as(
      "trigger_probe",
      `insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000b1', 'probe@example.test')`,
    );
    expect(
      db(
        `select count(*) from playtime.profiles where id = '00000000-0000-4000-8000-0000000000b1'`,
      ),
    ).toBe("1");
  });

  it("S-B1: nobody but the owner can read the opportunity board before or after; the owner sees the same rows", () => {
    const rows = db(`select count(*) from disco.v_opportunity_board`);
    for (const r of ["anon", "authenticated", "service_role"])
      expect(
        db(`select has_table_privilege('${r}', 'disco.v_opportunity_board', 'select')`),
      ).toBe("f");
    psql(pg, pkg("sec_b_definer_views.sql"));
    expect(db(`select count(*) from disco.v_opportunity_board`)).toBe(rows);
    expect(
      db(
        `select array_to_string(reloptions, ',') from pg_class where oid = 'disco.v_opportunity_board'::regclass`,
      ),
    ).toBe("security_invoker=true");
  });

  it("S-C: the six functions get a fixed search_path and return the same results", () => {
    const probe = `select disco.derive_search_pattern('Route optimisation for fleets')`;
    const before = db(probe);
    psql(pg, pkg("sec_c_search_path.sql"));
    expect(db(probe)).toBe(before);
    expect(
      db(`select count(*) from pg_proc where oid in (
        'disco.assert_weights_total()'::regprocedure, 'disco.compute_opportunity_score(jsonb,numeric)'::regprocedure,
        'disco.counter_evidence_penalty(uuid)'::regprocedure, 'disco.derive_search_pattern(text)'::regprocedure,
        'hlvs.non_exceptionable_rules()'::regprocedure, 'vstudio.portfolio_domain_value(text,text,jsonb)'::regprocedure)
        and proconfig @> array['search_path=public, extensions, pg_temp']`),
    ).toBe("6");
  });
});
