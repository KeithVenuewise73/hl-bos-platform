-- ===========================================================================
-- 0060_review_video — short video clips beside the photos of a game
--
-- A clip (a play in football, a shift in hockey) is reviewed, approved and published exactly like a
-- photo, in the same game folder. So a clip IS a review.photos row, with three extra things:
--
--     video_path        <batch>/<fingerprint>-video.mp4   the web-ready clip (private bucket)
--     video_bytes       its size
--     duration_seconds  its length
--
-- and its web_path / thumb_path are a POSTER FRAME (a still taken from the clip) and its thumbnail, the
-- same files every photo has. That keeps everything that already works for photos working for clips
-- with no second copy of it: counting a folder's waiting/approved/rejected, approving and rejecting,
-- moving between folders, deleting what is not approved, the team page's rules (approved AND filed under
-- a public team), and the thumbnails everywhere.
--
-- A clip's file_hash is the SHA-256 of the ORIGINAL file (as with photos), so sending the same clip
-- twice adds nothing, and DateSort can ask which of its originals 5Star already holds.
--
-- Same lock-down as before: service role only, through the media-review Edge Function. The clip
-- itself goes in the private bucket, and is copied to the public bucket only when it is approved and
-- filed under a public team. No camera details or location are kept: DateSort strips them.
--
-- Nothing here drops or deletes. The functions that gain video columns are NEW functions
-- (folder_items, public_wanted_v2, public_unwanted_v2); the old ones keep working.
--
-- rollback:
--   remove review.photos.video_path / video_bytes / duration_seconds and the functions
--   review.folder_items, review.public_wanted_v2, review.public_unwanted_v2.
-- ===========================================================================

alter table review.photos add column if not exists video_path text;
alter table review.photos add column if not exists video_bytes bigint
  check (video_bytes is null or video_bytes > 0);
alter table review.photos add column if not exists duration_seconds numeric(8, 2)
  check (duration_seconds is null or duration_seconds > 0);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'photos_video_path_pinned'
                  and conrelid = 'review.photos'::regclass) then
    alter table review.photos add constraint photos_video_path_pinned
      check (video_path is null or video_path = batch_id::text || '/' || file_hash || '-video.mp4');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'photos_video_whole'
                  and conrelid = 'review.photos'::regclass) then
    -- a clip has its file, its size and its length; a photo has none of them
    alter table review.photos add constraint photos_video_whole
      check ((video_path is null) = (video_bytes is null) and (video_path is null) = (duration_seconds is null));
  end if;
end $$;

-- The buckets take MP4 clips too, up to 50 MB each.
update storage.buckets
   set file_size_limit = 52428800,
       allowed_mime_types = array['image/jpeg', 'video/mp4']
 where id in ('review-photos', 'review-public');

-- Record sent photos AND clips. An item with "kind": "video" also needs its clip in the bucket, and
-- carries "video_bytes" and "duration". Same rules as before otherwise: every file must really be
-- there, a repeat is skipped, and the number added is returned.
create or replace function review.commit_photos(p_batch uuid, p_photos jsonb)
returns integer language plpgsql set search_path = '' as $$
declare p jsonb; f uuid; n integer := 0; wp text; tp text; vp text; h text; added integer; vid boolean;
begin
  select folder_id into f from review.batches where id = p_batch;
  if f is null then
    raise exception 'that send was not found' using errcode = '22023';
  end if;
  for p in select * from jsonb_array_elements(p_photos) loop
    h := p->>'hash';
    vid := coalesce(p->>'kind', 'photo') = 'video';
    wp := p_batch::text || '/' || h || '-web.jpg';
    tp := p_batch::text || '/' || h || '-thumb.jpg';
    vp := case when vid then p_batch::text || '/' || h || '-video.mp4' else null end;
    if not exists (select 1 from storage.objects where bucket_id = 'review-photos' and name = wp)
       or not exists (select 1 from storage.objects where bucket_id = 'review-photos' and name = tp)
       or (vid and not exists (select 1 from storage.objects where bucket_id = 'review-photos' and name = vp)) then
      raise exception 'the files for % are not uploaded', left(coalesce(h, ''), 12) using errcode = '22023';
    end if;
    if vid and (nullif(p->>'video_bytes', '')::bigint is null or nullif(p->>'duration', '')::numeric is null) then
      raise exception 'a clip needs its size and its length' using errcode = '22023';
    end if;
    insert into review.photos
      (batch_id, folder_id, file_hash, filename, taken_at, date_estimated, width, height,
       sharpness, brightness, flags, web_bytes, web_path, thumb_path,
       video_path, video_bytes, duration_seconds)
    values (
      p_batch, f, h, p->>'filename', nullif(p->>'taken_at', '')::timestamp,
      coalesce((p->>'date_estimated')::boolean, false),
      nullif(p->>'width', '')::integer, nullif(p->>'height', '')::integer,
      nullif(p->>'sharpness', '')::real, nullif(p->>'brightness', '')::real,
      coalesce(array(select jsonb_array_elements_text(p->'flags')), '{}'::text[]),
      (p->>'web_bytes')::bigint, wp, tp,
      vp, case when vid then (p->>'video_bytes')::bigint end,
      case when vid then (p->>'duration')::numeric(8, 2) end)
    on conflict (file_hash) do nothing;
    get diagnostics added = row_count;
    n := n + added;
  end loop;
  return n;
end $$;

-- A folder's photos and clips for the owner, with each clip's file and length.
create or replace function review.folder_items(
  p_folder uuid, p_status text, p_limit integer default 60, p_offset integer default 0)
returns table (id uuid, filename text, taken_at timestamp, date_estimated boolean, width integer,
               height integer, flags text[], status text, reason text,
               web_path text, thumb_path text, total bigint,
               video_path text, duration_seconds numeric)
language sql stable set search_path = '' as $$
  select p.id, p.filename, p.taken_at, p.date_estimated, p.width, p.height, p.flags,
         p.status, p.reason, p.web_path, p.thumb_path, count(*) over (),
         p.video_path, p.duration_seconds
    from review.photos p
   where p.folder_id = p_folder and (p_status = 'all' or p.status = p_status)
   order by p.taken_at nulls last, p.filename, p.id
   limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)
$$;

-- Approved items that should be public and are not yet copied (a clip also lists its video file).
create or replace function review.public_wanted_v2()
returns table (id uuid, web_path text, thumb_path text, video_path text)
language sql stable set search_path = '' as $$
  select p.id, p.web_path, p.thumb_path, p.video_path
    from review.photos p
    join review.folders f on f.id = p.folder_id
    join review.teams t on t.id = f.team_id
   where p.status = 'approved' and t.visibility = 'public' and p.public_at is null
$$;

-- Copied items that no longer qualify and must come down (a clip also lists its video file).
create or replace function review.public_unwanted_v2()
returns table (id uuid, web_path text, thumb_path text, video_path text)
language sql stable set search_path = '' as $$
  select p.id, p.web_path, p.thumb_path, p.video_path
    from review.photos p
   where p.public_at is not null
     and not exists (
       select 1 from review.folders f join review.teams t on t.id = f.team_id
        where f.id = p.folder_id and p.status = 'approved' and t.visibility = 'public')
$$;

-- "N of M public photos have a large copy" counts only still photos: a clip has no large copy.
create or replace function review.large_settings()
returns table (enabled boolean, large_photos bigint, public_photos bigint)
language sql stable set search_path = '' as $$
  select s.large_downloads,
         (select count(*) from review.photos where public_at is not null and large_path is not null),
         (select count(*) from review.photos where public_at is not null and video_path is null)
    from review.settings s where s.id
$$;

-- A team's public page: now says, per item, whether it is a clip, how long, and where its file is.
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
                                'video', (p.video_path is not null),
                                'duration', p.duration_seconds,
                                'video_path', p.video_path,
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
       and p.proname in ('commit_photos', 'folder_items', 'public_wanted_v2', 'public_unwanted_v2',
                         'large_settings', 'public_team')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
