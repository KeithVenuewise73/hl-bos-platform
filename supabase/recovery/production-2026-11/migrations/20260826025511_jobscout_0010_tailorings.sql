create table if not exists jobscout.tailorings (
  id            bigserial primary key,
  job_id        bigint not null references jobscout.jobs(id) on delete cascade,
  resume_id     bigint not null references jobscout.resumes(id) on delete cascade,
  headline      text,
  bullets       jsonb,
  skills        jsonb,
  cover_letter  text,
  omitted       text,
  resume_text   text,
  verified      boolean not null default false,
  report        jsonb,
  model         text,
  created_at    timestamptz default now(),
  unique (job_id, resume_id)
);

create index if not exists tailorings_job_idx on jobscout.tailorings (job_id);