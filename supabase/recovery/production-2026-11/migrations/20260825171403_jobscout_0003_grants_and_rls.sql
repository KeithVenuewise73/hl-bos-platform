-- ============================================================
-- JobScout — who can reach what.
--
-- The dashboard reads with the ANON key, which is public by design: it ships in
-- a browser and anyone who sees it holds it. So the rule here is that anon can
-- read exactly the two views the dashboard renders and write exactly the one
-- column it writes — and cannot touch a base table, above all `resumes`, which
-- holds the full resume text.
--
-- service_role (the edge functions) gets everything and bypasses RLS.
-- ============================================================

-- ---------- service_role: the crawler and scorer ----------
grant usage on schema jobscout to service_role;
grant all privileges on all tables in schema jobscout to service_role;
grant all privileges on all sequences in schema jobscout to service_role;
alter default privileges in schema jobscout
  grant all privileges on tables to service_role;
alter default privileges in schema jobscout
  grant all privileges on sequences to service_role;

-- ---------- RLS on every base table ----------
-- With RLS enabled and no policy for a role, that role sees nothing even if a
-- grant is ever added by accident. Defense in depth against a future mistake.
alter table jobscout.companies    enable row level security;
alter table jobscout.jobs         enable row level security;
alter table jobscout.resumes      enable row level security;
alter table jobscout.scores       enable row level security;
alter table jobscout.applications enable row level security;
alter table jobscout.runs         enable row level security;

-- ---------- anon: the dashboard, and nothing else ----------
grant usage on schema jobscout to anon;

-- Read path. These views are owned by postgres and therefore run with the
-- owner's rights — that is the intended, and the ONLY, read path for anon.
-- Neither view selects from jobscout.resumes.
grant select on jobscout.v_shortlist to anon;
grant select on jobscout.v_last_runs to anon;

-- Write path: the status dropdown, and only that.
grant select, insert, update on jobscout.applications to anon;
grant usage, select on sequence jobscout.applications_id_seq to anon;

create policy applications_anon_read on jobscout.applications
  for select to anon using (true);
create policy applications_anon_insert on jobscout.applications
  for insert to anon with check (true);
create policy applications_anon_update on jobscout.applications
  for update to anon using (true) with check (true);

-- Explicitly NOT granted to anon: companies, jobs, scores, runs, resumes.
-- resumes is the one that matters most — it is the full resume text.