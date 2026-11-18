-- ===========================================================================
-- 0059_review_large — a LARGE copy of each photo, offered as a download
--
-- Each photo already has a web copy (2,400 px) and a thumbnail. This adds an optional
-- third file, a LARGE copy (3,600 px, camera details and GPS removed like the others),
-- for a "Download large" button. The large copy lives in the PRIVATE bucket only: it is
-- never public by address. A visitor who presses the button asks the Edge Function, which
-- hands out a short-lived download link, and only when ALL of these hold:
--
--     the owner's switch is ON  AND  the photo is on a public page (approved, in a folder
--     under a public team)  AND  a large copy exists.
--
-- Turning the switch off therefore stops every large download at once, with nothing to
-- copy back or remove. Photos sent before this have no large copy until DateSort sends
-- one (large_needed says which); large_path records where it is once it exists.
--
-- Same lock-down as the rest of the review area: service role only, via the Edge Function.
--
-- rollback:
--   remove the columns review.photos.large_path / large_bytes and review.settings.large_downloads,
--   and the review.large_* functions below.
-- ===========================================================================

alter table review.photos add column if not exists large_bytes bigint check (large_bytes is null or large_bytes > 0);
alter table review.photos add column if not exists large_path text
  check (large_path is null or large_path = batch_id::text || '/' || file_hash || '-large.jpg');

alter table review.settings add column if not exists large_downloads boolean not null default true;

-- Which of these photos (by fingerprint) have no large copy yet, and the batch each one
-- was first stored under (its files live under that batch's folder).
create or replace function review.large_needed(p_hashes text[])
returns table (file_hash text, batch_id uuid)
language sql stable set search_path = '' as $$
  select p.file_hash, p.batch_id from review.photos p
   where p.file_hash = any (p_hashes) and p.large_path is null
$$;

-- Record that a photo's large copy has been uploaded. Only when the file really is in
-- the bucket. Returns true when recorded.
create or replace function review.attach_large(p_hash text, p_bytes bigint)
returns boolean language plpgsql set search_path = '' as $$
declare p review.photos;
begin
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'a fingerprint is 64 hex characters' using errcode = '22023';
  end if;
  if p_bytes is null or p_bytes <= 0 then
    raise exception 'a file has a size' using errcode = '22023';
  end if;
  select * into p from review.photos where file_hash = p_hash;
  if not found then return false; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'review-photos'
                  and name = p.batch_id::text || '/' || p_hash || '-large.jpg') then
    return false;
  end if;
  update review.photos set large_bytes = p_bytes,
         large_path = batch_id::text || '/' || file_hash || '-large.jpg'
   where id = p.id;
  return true;
end $$;

-- The switch, and how many public photos have a large copy.
create or replace function review.large_settings()
returns table (enabled boolean, large_photos bigint, public_photos bigint)
language sql stable set search_path = '' as $$
  select s.large_downloads,
         (select count(*) from review.photos where public_at is not null and large_path is not null),
         (select count(*) from review.photos where public_at is not null)
    from review.settings s where s.id
$$;

create or replace function review.set_large_downloads(p_enabled boolean)
returns void language plpgsql set search_path = '' as $$
begin
  if p_enabled is null then
    raise exception 'on or off' using errcode = '22023';
  end if;
  update review.settings set large_downloads = p_enabled where id;
end $$;

-- The private file a visitor may download, or null. Null for anything that does not
-- qualify: switch off, photo not public, no large copy.
create or replace function review.public_large(p_photo uuid)
returns table (large_path text, enabled boolean)
language sql stable set search_path = '' as $$
  select (case when s.large_downloads and p.public_at is not null and p.status = 'approved'
               and exists (select 1 from review.folders f join review.teams t on t.id = f.team_id
                            where f.id = p.folder_id and t.visibility = 'public')
          then p.large_path end), s.large_downloads
    from review.settings s, review.photos p where s.id and p.id = p_photo
$$;

-- A team's public page: now says, per photo, whether a large copy exists, and whether
-- large downloads are switched on.
create or replace function review.public_team(p_slug text)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'team', jsonb_build_object('slug', t.slug, 'name', t.name),
    'large_downloads', (select s.large_downloads from review.settings s where s.id),
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
                                'large', (p.large_path is not null),
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
       and p.proname in ('large_needed', 'attach_large', 'large_settings', 'set_large_downloads', 'public_large', 'public_team')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
