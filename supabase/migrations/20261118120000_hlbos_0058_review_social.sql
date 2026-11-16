-- ===========================================================================
-- 0058_review_social — post approved photos to the owner's Instagram and Facebook
--
-- The owner picks up to 10 approved, public photos from one game, writes a caption,
-- chooses Instagram and/or Facebook, and presses Post. That press is the approval:
-- nothing here ever posts by itself, and there is no schedule.
--
-- What is recorded, and why it can be trusted:
--   * accounts   the channels, by NAME of the secret that holds each login token.
--                A token is never stored in the database. An Instagram account
--                must carry the id of the Facebook Page it is linked to (the API
--                cannot post to a personal Instagram account).
--   * posts      the caption, the photos (a snapshot of each file's path, so the
--                record survives a photo later being deleted), who approved it and
--                when.
--   * targets    one row per post x account: pending, publishing, published or
--                failed. A target is 'published' ONLY with the id Instagram or
--                Facebook returned: the database refuses a published row with no
--                id, so a success cannot be invented.
--   * attempts   what was sent and what came back, one row per request. The service
--                only ever adds to it.
--
-- Same lock-down as the rest of the review area: not API-exposed, RLS forced with no
-- policy, service role only, via the media-review Edge Function.
--
-- rollback: remove the five tables and the functions below (review.social_*).
-- ===========================================================================

create table if not exists review.social_accounts (
  id                  uuid primary key default gen_random_uuid(),
  platform            text not null check (platform in ('instagram', 'facebook_page')),
  -- The Facebook Page id, or the Instagram professional account id.
  external_account_id text not null check (external_account_id ~ '^[0-9]{5,30}$'),
  display_name        text not null check (length(display_name) between 1 and 120),
  -- An Instagram account posts through its linked Facebook Page.
  facebook_page_id    text check (facebook_page_id is null or facebook_page_id ~ '^[0-9]{5,30}$'),
  -- The NAME of the Edge Function secret that holds this channel's login token.
  token_secret_name   text not null check (token_secret_name ~ '^[A-Z][A-Z0-9_]{2,60}$'),
  status              text not null default 'active' check (status in ('active', 'disabled')),
  created_at          timestamptz not null default now(),
  unique (platform, external_account_id),
  check (platform <> 'instagram' or facebook_page_id is not null)
);

create table if not exists review.social_posts (
  id          uuid primary key default gen_random_uuid(),
  folder_id   uuid references review.folders(id) on delete set null,
  caption     text not null check (length(btrim(caption)) between 1 and 2200),
  status      text not null default 'approved'
              check (status in ('approved', 'publishing', 'published', 'partly_published', 'failed', 'cancelled')),
  approved_by uuid not null,
  approved_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create table if not exists review.social_post_photos (
  post_id   uuid not null references review.social_posts(id) on delete cascade,
  position  integer not null check (position between 0 and 9),
  -- Kept even if the photo is later removed from the review area.
  photo_id  uuid references review.photos(id) on delete set null,
  filename  text not null,
  web_path  text not null,
  width     integer,
  height    integer,
  primary key (post_id, position)
);

create table if not exists review.social_targets (
  id               uuid primary key default gen_random_uuid(),
  post_id          uuid not null references review.social_posts(id) on delete cascade,
  account_id       uuid not null references review.social_accounts(id) on delete restrict,
  status           text not null default 'pending'
                   check (status in ('pending', 'publishing', 'published', 'failed')),
  external_post_id text,
  permalink        text,
  error            text check (error is null or length(error) <= 1000),
  attempts         integer not null default 0,
  started_at       timestamptz,
  finished_at      timestamptz,
  unique (post_id, account_id),
  -- A success is only ever what the platform said: its id.
  check (status <> 'published' or (external_post_id is not null and length(external_post_id) > 0)),
  check (status = 'published' or permalink is null)
);

create table if not exists review.social_attempts (
  id          uuid primary key default gen_random_uuid(),
  target_id   uuid not null references review.social_targets(id) on delete cascade,
  phase       text not null,
  ok          boolean not null,
  http_status integer,
  request     jsonb,
  response    jsonb,
  error       text,
  created_at  timestamptz not null default now()
);
create index if not exists social_attempts_target on review.social_attempts (target_id, created_at);
create index if not exists social_posts_recent on review.social_posts (created_at desc);

do $$
declare t text;
begin
  foreach t in array array['social_accounts', 'social_posts', 'social_post_photos', 'social_targets', 'social_attempts'] loop
    execute format('alter table review.%I enable row level security', t);
    execute format('alter table review.%I force row level security', t);
    execute format('revoke all on review.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on review.%I to service_role', t);
  end loop;
end $$;

-- --- Posting ----------------------------------------------------------------

create or replace function review.social_accounts_list()
returns table (id uuid, platform text, display_name text, status text)
language sql stable set search_path = '' as $$
  select a.id, a.platform, a.display_name, a.status
    from review.social_accounts a order by a.platform, a.display_name
$$;

-- The owner pressed Post: record the post (approved), its photos in order, and one
-- pending target per chosen account. Only photos that are approved AND already on
-- the public page can be posted (the platform fetches them from their public address).
-- Instagram refuses a picture taller than 4:5 or wider than 1.91:1, so that is checked
-- here, in words, instead of failing later.
create or replace function review.social_create_post(
  p_photos uuid[], p_caption text, p_accounts uuid[], p_by uuid)
returns uuid language plpgsql set search_path = '' as $$
declare post uuid; n integer; ig boolean; folder uuid; bad text; i integer;
begin
  if p_photos is null or cardinality(p_photos) < 1 or cardinality(p_photos) > 10 then
    raise exception 'a post has 1 to 10 photos' using errcode = '22023';
  end if;
  if (select count(distinct x) from unnest(p_photos) x) <> cardinality(p_photos) then
    raise exception 'a photo can only be in a post once' using errcode = '22023';
  end if;
  if p_caption is null or length(btrim(p_caption)) = 0 or length(p_caption) > 2200 then
    raise exception 'a caption is 1 to 2,200 characters' using errcode = '22023';
  end if;
  if p_accounts is null or cardinality(p_accounts) < 1 then
    raise exception 'choose where to post' using errcode = '22023';
  end if;
  select count(*) into n from review.social_accounts where id = any (p_accounts) and status = 'active';
  if n <> (select count(distinct x) from unnest(p_accounts) x) then
    raise exception 'one of those accounts is not set up or is switched off' using errcode = '22023';
  end if;
  select count(*) into n from review.photos
   where id = any (p_photos) and status = 'approved' and public_at is not null;
  if n <> cardinality(p_photos) then
    raise exception 'only approved photos that are already on the public page can be posted' using errcode = '22023';
  end if;
  select count(distinct folder_id), min(folder_id::text)::uuid into n, folder from review.photos where id = any (p_photos);
  if n <> 1 then
    raise exception 'post photos from one game at a time' using errcode = '22023';
  end if;
  ig := exists (select 1 from review.social_accounts where id = any (p_accounts) and platform = 'instagram');
  if ig then
    select string_agg(filename, ', ') into bad from review.photos
     where id = any (p_photos) and width is not null and height is not null
       and (width::numeric / height < 0.8 or width::numeric / height > 1.91);
    if bad is not null then
      raise exception 'Instagram cannot take these pictures because of their shape (taller than 4:5 or wider than 1.91:1): %', bad
        using errcode = '22023';
    end if;
  end if;

  insert into review.social_posts (folder_id, caption, approved_by)
  values (folder, btrim(p_caption), p_by) returning id into post;
  -- In the order the owner chose them.
  for i in 1 .. cardinality(p_photos) loop
    insert into review.social_post_photos (post_id, position, photo_id, filename, web_path, width, height)
    select post, i - 1, p.id, p.filename, p.web_path, p.width, p.height
      from review.photos p where p.id = p_photos[i];
  end loop;
  insert into review.social_targets (post_id, account_id)
  select post, a from (select distinct unnest(p_accounts) a) s;
  return post;
end $$;

-- Take ONE pending target to work on (one at a time, so a slow Instagram upload never
-- outruns a request). Returns nothing when none is pending.
create or replace function review.social_claim_target(p_post uuid)
returns table (target_id uuid, platform text, external_account_id text, display_name text,
               facebook_page_id text, token_secret_name text, caption text, attempt_no integer)
language plpgsql set search_path = '' as $$
declare t review.social_targets;
begin
  select * into t from review.social_targets
   where post_id = p_post and status = 'pending'
   order by id limit 1 for update skip locked;
  if not found then return; end if;
  update review.social_targets set status = 'publishing', attempts = attempts + 1, started_at = now()
   where id = t.id;
  update review.social_posts set status = 'publishing' where id = p_post and status = 'approved';
  return query
    select t.id, a.platform, a.external_account_id, a.display_name, a.facebook_page_id,
           a.token_secret_name, p.caption, t.attempts + 1
      from review.social_accounts a, review.social_posts p
     where a.id = t.account_id and p.id = p_post;
end $$;

create or replace function review.social_post_photo_paths(p_post uuid)
returns table (web_path text, filename text)
language sql stable set search_path = '' as $$
  select web_path, filename from review.social_post_photos where post_id = p_post order by position
$$;

create or replace function review.social_record_attempt(
  p_target uuid, p_phase text, p_ok boolean, p_http integer, p_request jsonb, p_response jsonb, p_error text)
returns void language sql set search_path = '' as $$
  insert into review.social_attempts (target_id, phase, ok, http_status, request, response, error)
  values (p_target, p_phase, p_ok, p_http, p_request, p_response, left(p_error, 1000))
$$;

-- Record the outcome. A published target needs the id the platform returned (the table
-- refuses one without). Then the post's own status follows from its targets.
create or replace function review.social_finish_target(
  p_target uuid, p_published boolean, p_external text, p_permalink text, p_error text)
returns text language plpgsql set search_path = '' as $$
declare post uuid; pending integer; ok integer; bad integer; s text;
begin
  update review.social_targets
     set status = case when p_published then 'published' else 'failed' end,
         external_post_id = case when p_published then p_external end,
         permalink = case when p_published then p_permalink end,
         error = case when p_published then null else left(coalesce(p_error, 'it did not post'), 1000) end,
         finished_at = now()
   where id = p_target returning post_id into post;
  if post is null then
    raise exception 'that post was not found' using errcode = '22023';
  end if;
  select count(*) filter (where status in ('pending', 'publishing')),
         count(*) filter (where status = 'published'),
         count(*) filter (where status = 'failed')
    into pending, ok, bad from review.social_targets where post_id = post;
  s := case when pending > 0 then 'publishing'
            when bad = 0 then 'published'
            when ok = 0 then 'failed'
            else 'partly_published' end;
  update review.social_posts set status = s where id = post;
  return s;
end $$;

-- A request that never came back leaves a target 'publishing'. It may or may not be
-- live, so it is never retried automatically: it is marked failed with that warning,
-- for the owner to check the account.
create or replace function review.social_fail_stale(p_post uuid, p_minutes integer default 10)
returns integer language plpgsql set search_path = '' as $$
declare n integer; t uuid;
begin
  n := 0;
  for t in select id from review.social_targets
            where post_id = p_post and status = 'publishing'
              and started_at < now() - make_interval(mins => p_minutes) loop
    perform review.social_finish_target(t, false, null,
      null, 'No answer came back, so it may or may not be live. Check the account before posting again.');
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function review.social_post_status(p_post uuid)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'status', p.status, 'caption', p.caption,
    'approved_at', p.approved_at,
    'photos', (select count(*) from review.social_post_photos where post_id = p.id),
    'targets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'account', a.display_name, 'platform', a.platform, 'status', t.status,
        'permalink', t.permalink, 'error', t.error) order by a.platform)
        from review.social_targets t join review.social_accounts a on a.id = t.account_id
       where t.post_id = p.id), '[]'::jsonb))
    from review.social_posts p where p.id = p_post
$$;

create or replace function review.social_recent_posts(p_limit integer default 30)
returns table (id uuid, status text, caption text, approved_at timestamptz, folder_name text,
               photos bigint, targets jsonb)
language sql stable set search_path = '' as $$
  select p.id, p.status, p.caption, p.approved_at, f.name,
         (select count(*) from review.social_post_photos where post_id = p.id),
         coalesce((select jsonb_agg(jsonb_build_object('account', a.display_name, 'platform', a.platform,
                     'status', t.status, 'permalink', t.permalink, 'error', t.error) order by a.platform)
                     from review.social_targets t join review.social_accounts a on a.id = t.account_id
                    where t.post_id = p.id), '[]'::jsonb)
    from review.social_posts p left join review.folders f on f.id = p.folder_id
   order by p.created_at desc limit least(greatest(p_limit, 1), 100)
$$;

-- Which of these photos have already been posted, and where: so the owner is warned
-- before posting the same picture twice.
create or replace function review.social_already_posted(p_photos uuid[])
returns table (photo_id uuid, platform text, account text, posted_at timestamptz)
language sql stable set search_path = '' as $$
  select pp.photo_id, a.platform, a.display_name, t.finished_at
    from review.social_post_photos pp
    join review.social_targets t on t.post_id = pp.post_id and t.status = 'published'
    join review.social_accounts a on a.id = t.account_id
   where pp.photo_id = any (p_photos)
$$;

do $$
declare f text;
begin
  for f in
    select p.oid::regprocedure::text from pg_proc p
     where p.pronamespace = 'review'::regnamespace and p.proname like 'social\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
