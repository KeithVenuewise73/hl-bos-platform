-- ===========================================================================
-- 0058_review_delete_folder — delete a folder that has nothing in it
--
-- Splitting a day into two games, or sending a day twice, can leave a folder with
-- no photos in it. The owner needs to be able to remove it. This is deliberately
-- narrow: a folder that still holds ANY photo (waiting, approved or rejected)
-- cannot be deleted. Move the photos out first (move_photos). A photo is never
-- lost by deleting a folder.
--
-- Same lock-down as the rest of the review area: service role only, via the
-- media-review Edge Function. Applied under the owner's standing approval; WRITTEN
-- AND TESTED before it was applied.
--
-- rollback:
--   drop function if exists review.delete_empty_folder(uuid);
-- ===========================================================================

create or replace function review.delete_empty_folder(p_folder uuid)
returns void language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from review.folders where id = p_folder) then
    raise exception 'that folder was not found' using errcode = '22023';
  end if;
  if exists (select 1 from review.photos where folder_id = p_folder) then
    raise exception 'that folder still has photos in it: move them to another folder first'
      using errcode = '22023';
  end if;
  -- Its send records (batches) have no photos left to describe; they go with it.
  delete from review.folders where id = p_folder;
end $$;

revoke all on function review.delete_empty_folder(uuid) from public, anon, authenticated;
grant execute on function review.delete_empty_folder(uuid) to service_role;
