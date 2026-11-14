-- ===========================================================================
-- 0057_review_publish — approved photos appear on their team's public page
--
-- Approving a photo (0055) only marks it approved. This is the step that makes it
-- visible: a photo is PUBLIC exactly when it is
--
--     approved  AND  in a folder filed under a team  AND  that team's page is public.
--
-- Anything else is private: a waiting or rejected photo, a folder with no team, a
-- team switched to private. When a photo stops qualifying (rejected, sent back to
-- waiting, moved, its team made private) it is taken down again.
--
-- Public photos are COPIED into a separate public bucket (review-public) by the
-- Edge Function; the originals stay in the private review-photos bucket. The copy
-- carries the same camera-detail-free web image DateSort made. public_at records
-- when a photo was copied; the Edge Function keeps the bucket and public_at in step
-- (see review.public_wanted / public_unwanted).
--
-- Visitors read the public pages through two functions that return ONLY photos that
-- have been copied. Same lock-down as before: not API-exposed, service role only,
-- via the media-review Edge Function. WRITTEN AND TESTED, NOT APPLIED.
--
-- rollback:
--   delete from storage.objects where bucket_id = 'review-public';
--   delete from storage.buckets where id = 'review-public';
--   drop function if exists review.public_team(text);
--   drop function if exists review.public_teams();
--   drop function if exists review.clear_public(uuid[]);
--   drop function if exists review.mark_public(uuid[]);
--   drop function if exists review.public_unwanted();
--   drop function if exists review.public_wanted();
--   drop index if exists review.photos_public;
--   alter table review.photos drop column if exists public_at;
-- ===========================================================================

alter table review.photos add column if not exists public_at timestamptz;
create index if not exists photos_public on review.photos (folder_id) where public_at is not null;

-- Approved photos that should be public and are not yet copied.
create or replace function review.public_wanted()
returns table (id uuid, web_path text, thumb_path text)
language sql stable set search_path = '' as $$
  select p.id, p.web_path, p.thumb_path
    from review.photos p
    join review.folders f on f.id = p.folder_id
    join review.teams t on t.id = f.team_id
   where p.status = 'approved' and t.visibility = 'public' and p.public_at is null
$$;

-- Copied photos that no longer qualify and must come down.
create or replace function review.public_unwanted()
returns table (id uuid, web_path text, thumb_path text)
language sql stable set search_path = '' as $$
  select p.id, p.web_path, p.thumb_path
    from review.photos p
   where p.public_at is not null
     and not exists (
       select 1 from review.folders f join review.teams t on t.id = f.team_id
        where f.id = p.folder_id and p.status = 'approved' and t.visibility = 'public')
$$;

-- Record that these photos have been copied. Only a photo that qualifies can be marked.
create or replace function review.mark_public(p_ids uuid[])
returns integer language plpgsql set search_path = '' as $$
declare n integer;
begin
  update review.photos p set public_at = now()
   where p.id = any (p_ids) and p.public_at is null and p.status = 'approved'
     and exists (select 1 from review.folders f join review.teams t on t.id = f.team_id
                  where f.id = p.folder_id and t.visibility = 'public');
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function review.clear_public(p_ids uuid[])
returns integer language plpgsql set search_path = '' as $$
declare n integer;
begin
  update review.photos set public_at = null where id = any (p_ids) and public_at is not null;
  get diagnostics n = row_count;
  return n;
end $$;

-- The public teams: those with at least one public photo, newest first photo as the cover.
create or replace function review.public_teams()
returns table (slug text, name text, albums bigint, photos bigint, cover_thumb text)
language sql stable set search_path = '' as $$
  select t.slug, t.name,
         count(distinct f.id), count(p.id),
         (select p2.thumb_path from review.photos p2 join review.folders f2 on f2.id = p2.folder_id
           where f2.team_id = t.id and p2.public_at is not null
           order by f2.event_date desc, p2.taken_at nulls last, p2.id limit 1)
    from review.teams t
    join review.folders f on f.team_id = t.id
    join review.photos p on p.folder_id = f.id and p.public_at is not null
   where t.visibility = 'public'
   group by t.id
   order by t.name
$$;

-- One team's public page: its albums (newest first) with their public photos in the order taken.
-- Null when there is no such public team.
create or replace function review.public_team(p_slug text)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'team', jsonb_build_object('slug', t.slug, 'name', t.name),
    'albums', coalesce((
      select jsonb_agg(a.album order by a.event_date desc, a.name)
        from (
          select f.name, f.event_date,
                 jsonb_build_object('id', f.id, 'name', f.name, 'sport', f.sport,
                   'event_date', to_char(f.event_date, 'YYYY-MM-DD'),
                   'photos', (select jsonb_agg(jsonb_build_object(
                                'id', p.id, 'filename', p.filename,
                                'taken_at', to_char(p.taken_at, 'YYYY-MM-DD"T"HH24:MI:SS'),
                                'width', p.width, 'height', p.height,
                                'web_path', p.web_path, 'thumb_path', p.thumb_path)
                              order by p.taken_at nulls last, p.filename, p.id)
                                from review.photos p where p.folder_id = f.id and p.public_at is not null)) as album
            from review.folders f
           where f.team_id = t.id
             and exists (select 1 from review.photos p where p.folder_id = f.id and p.public_at is not null)
        ) a), '[]'::jsonb))
    from review.teams t where t.slug = p_slug and t.visibility = 'public'
$$;

do $$
declare f text;
begin
  for f in
    select p.oid::regprocedure::text from pg_proc p
     where p.pronamespace = 'review'::regnamespace
       and p.proname in ('public_wanted', 'public_unwanted', 'mark_public', 'clear_public', 'public_teams', 'public_team')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- --- Storage ----------------------------------------------------------------
--
--   review-public  PUBLIC  <batch>/<fingerprint>-web.jpg and -thumb.jpg, only for
--                          photos that are approved and on a public team's page.
--
-- Anyone can read this bucket by address, which is the point; nobody can write to it
-- but the service role (no storage policy admits anon or authenticated to write).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('review-public', 'review-public', true, 15728640, array['image/jpeg'])
on conflict (id) do nothing;
