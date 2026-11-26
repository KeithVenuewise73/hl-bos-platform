// The ReviewStore over Postgres: one call per migration-0055 function. Takes a
// `postgres` (porsager) tagged-template client, so the deployed function and a
// local integration run share exactly this code.
// deno-lint-ignore-file no-explicit-any
import type { FolderRow, ReviewStore } from "./core.ts";

/** The publisher's registered fingerprint (null until DateSort connects). */
export async function publisherFingerprint(sql: any): Promise<string | null> {
  const r = await sql`select publisher_key_sha256 from review.service_settings()`;
  return r[0]?.publisher_key_sha256 ?? null;
}

/** An error the owner is shown in plain words (the service turns 22023 / 23505 into a 400). */
function plain(message: string, code = "22023"): Error {
  return Object.assign(new Error(message), { code });
}

export function pgStore(sql: any): ReviewStore {
  return {
    async registerPublisher(sha) {
      const r = await sql`select review.register_publisher(${sha}) as result`;
      return String(r[0]?.result ?? "closed");
    },
    async createBatch(p) {
      const r = await sql`select batch_id, known from review.create_batch(
        ${p.name}, ${p.sport}, ${p.date}::date, ${p.source}, ${p.photos}, ${p.videos}, ${p.hashes}::text[])`;
      const known = (r[0].known ?? []) as string[];
      const need =
        known.length === 0
          ? []
          : await sql`select file_hash, batch_id from review.large_needed(${known}::text[])`;
      return {
        batchId: String(r[0].batch_id),
        known,
        needLarge: [...need].map((n: any) => ({
          hash: String(n.file_hash),
          batch_id: String(n.batch_id),
        })),
      };
    },
    async statusDays() {
      return [
        ...(await sql`select to_char(f.event_date, 'YYYY-MM-DD') as date,
                             (count(p.id) filter (where p.video_path is null))::int as photos,
                             (count(p.id) filter (where p.video_path is not null))::int as clips,
                             (count(p.id) filter (where p.status = 'waiting'))::int as waiting,
                             (count(p.id) filter (where p.status = 'approved'))::int as approved,
                             (count(p.id) filter (where p.status = 'rejected'))::int as rejected
                        from review.folders f
                        left join review.photos p on p.folder_id = f.id
                       group by f.event_date
                       order by f.event_date`),
      ] as never;
    },
    async gamesOn(date) {
      return [
        ...(await sql`select f.name as name, coalesce(f.sport, '') as sport, t.name as team,
                             (count(p.id) filter (where p.video_path is null))::int as photos,
                             (count(p.id) filter (where p.video_path is not null))::int as clips
                        from review.folders f
                        left join review.teams t on t.id = f.team_id
                        left join review.photos p on p.folder_id = f.id
                       where f.event_date = ${date}::date
                       group by f.id, t.name
                       order by (count(p.id)) desc, f.name`),
      ] as never;
    },
    async knownHashes(hashes) {
      const r = await sql`select file_hash from review.photos
        where file_hash = any(${hashes}::text[])`;
      return [...r].map((x: any) => String(x.file_hash));
    },
    async videoIds(ids) {
      const r = await sql`select id from review.photos
        where id = any(${ids}::uuid[]) and video_path is not null`;
      return [...r].map((x: any) => String(x.id));
    },
    async commitPhotos(batchId, photos) {
      const r =
        await sql`select review.commit_photos(${batchId}::uuid, ${sql.json(photos)}) as n`;
      return Number(r[0]?.n ?? 0);
    },
    async folders() {
      const rows = [
        ...(await sql`select id, name, sport, to_char(event_date, 'YYYY-MM-DD') as event_date,
                             team_id, team_name, waiting::int, approved::int, rejected::int, same_day::int
                        from review.folders_overview()`),
      ];
      // How many of each folder's items are short clips, so the owner page can offer a Videos tab.
      const clips: any[] = await sql`select folder_id::text as id,
                                     count(*) filter (where status = 'waiting')::int as w,
                                     count(*) filter (where status = 'approved')::int as a,
                                     count(*) filter (where status = 'rejected')::int as r
                                from review.photos
                               where video_path is not null
                               group by folder_id`;
      const byId = new Map(clips.map((c: any) => [String(c.id), c]));
      return rows.map((f) => {
        const c = byId.get(String(f.id));
        return {
          ...f,
          clips_waiting: Number(c?.w ?? 0),
          clips_approved: Number(c?.a ?? 0),
          clips_rejected: Number(c?.r ?? 0),
        };
      }) as FolderRow[];
    },
    async folderPhotos(folder, status, limit, offset, kind = "all") {
      if (kind !== "all") {
        // Same listing as review.folder_items, narrowed to clips or to photos.
        return [
          ...(await sql`select id, filename, to_char(taken_at, 'YYYY-MM-DD"T"HH24:MI:SS') as taken_at,
                               date_estimated, width, height, flags, status, reason,
                               web_path, thumb_path, (count(*) over ())::int as total,
                               video_path, duration_seconds::float8
                          from review.photos
                         where folder_id = ${folder}::uuid
                           and (${status} = 'all' or status = ${status})
                           and ((${kind} = 'video') = (video_path is not null))
                         order by taken_at nulls last, filename, id
                         limit ${Math.min(Math.max(limit, 1), 200)} offset ${Math.max(offset, 0)}`),
        ];
      }
      return [
        ...(await sql`select id, filename, to_char(taken_at, 'YYYY-MM-DD"T"HH24:MI:SS') as taken_at,
                             date_estimated, width, height, flags, status, reason,
                             web_path, thumb_path, total::int, video_path, duration_seconds::float8
                        from review.folder_items(${folder}::uuid, ${status}, ${limit}, ${offset})`),
      ];
    },
    async decide(ids, status, reason, by) {
      const r =
        await sql`select review.decide(${ids}::uuid[], ${status}, ${reason}, ${by}::uuid) as n`;
      return Number(r[0]?.n ?? 0);
    },
    async approveWaiting(folder, by) {
      const r =
        await sql`select review.approve_waiting(${folder}::uuid, ${by}::uuid) as n`;
      return Number(r[0]?.n ?? 0);
    },
    async renameFolder(folder, name) {
      await sql`select review.rename_folder(${folder}::uuid, ${name})`;
    },
    async deleteFolder(folder) {
      // Only a folder with no photo in it; one that has any is refused, so no photo is ever lost.
      //
      // A photo keeps the SEND (batch) it arrived in, and a batch belongs to the folder it was sent
      // to. Deleting a folder deletes its batches and, through them, every photo of those sends even
      // when the photo was moved to another folder since. So first hand each such batch to the folder
      // that now holds its photos; only then can the folder go without taking anything with it.
      await sql.begin(async (tx: any) => {
        await tx`update review.batches b set folder_id = x.fid
          from (select distinct on (p.batch_id) p.batch_id, p.folder_id as fid
                  from review.photos p
                  join review.batches bb on bb.id = p.batch_id
                 where bb.folder_id = ${folder}::uuid and p.folder_id <> ${folder}::uuid
                 order by p.batch_id, p.created_at) x
         where b.id = x.batch_id`;
        const gone = await tx`delete from review.folders f
          where f.id = ${folder}::uuid
            and not exists (select 1 from review.photos p where p.folder_id = f.id)
          returning f.id`;
        if (gone.length === 0) {
          const there =
            await tx`select 1 from review.folders where id = ${folder}::uuid`;
          throw plain(
            there.length > 0
              ? "that folder still has photos in it: move them to another folder first"
              : "that folder was not found",
          );
        }
      });
    },
    async deletePhotos(ids) {
      // Never an approved photo, and never one that is on the public page.
      const rows = await sql`delete from review.photos
        where id = any(${ids}::uuid[]) and status <> 'approved' and public_at is null
        returning web_path, thumb_path, large_path, video_path`;
      return {
        deleted: rows.length,
        paths: rows.flatMap((r: any) =>
          [r.web_path, r.thumb_path, r.large_path, r.video_path].filter(Boolean),
        ),
      };
    },
    async renameTeam(team, name) {
      const n = String(name ?? "").trim();
      if (n.length < 1 || n.length > 120)
        throw plain("a team name is 1 to 120 characters");
      const clash = await sql`select 1 from review.teams
        where lower(name) = lower(${n}) and id <> ${team}::uuid`;
      if (clash.length > 0)
        throw plain("there is already a team with that name", "23505");
      const done =
        await sql`update review.teams set name = ${n} where id = ${team}::uuid returning id`;
      if (done.length === 0) throw plain("that team was not found");
    },
    async movePhotos(ids, folder) {
      const r =
        await sql`select review.move_photos(${ids}::uuid[], ${folder}::uuid) as n`;
      return Number(r[0]?.n ?? 0);
    },
    async newFolderFromPhotos(ids, name, sport, date) {
      const r =
        await sql`select review.new_folder_from_photos(${ids}::uuid[], ${name}, ${sport}, ${date}::date) as id`;
      return String(r[0].id);
    },
    async setFolderTeam(folder, team) {
      await sql`select review.set_folder_team(${folder}::uuid, ${team}::uuid)`;
    },
    async teams() {
      return [
        ...(await sql`select id, slug, name, visibility, folders::int from review.list_teams()`),
      ];
    },
    async createTeam(name) {
      const r = await sql`select review.create_team(${name}) as id`;
      return String(r[0].id);
    },
    async setTeamVisibility(team, visibility) {
      await sql`select review.set_team_visibility(${team}::uuid, ${visibility})`;
    },
    async publicPages() {
      return [
        ...(await sql`select slug, title, blurb, href, menu_label, menu_order, paths, enabled, coming_soon
                        from site.public_pages()`),
      ];
    },
    async ownerPages() {
      return [
        ...(await sql`select slug, title, blurb, href, menu_label, menu_order, paths, enabled, coming_soon,
                             interest::int
                        from site.owner_pages()`),
      ];
    },
    async setPage(slug, enabled, comingSoon) {
      await sql`select site.set_page(${slug}, ${enabled}::boolean, ${comingSoon}::boolean)`;
    },
    async recordInterest(slug, voter) {
      const r = await sql`select site.record_interest(${slug}, ${voter}) as counted`;
      return r[0]?.counted === true;
    },
    async publicWanted() {
      return [
        ...(await sql`select id, web_path, thumb_path, video_path from review.public_wanted_v2()`),
      ];
    },
    async publicUnwanted() {
      return [
        ...(await sql`select id, web_path, thumb_path, video_path from review.public_unwanted_v2()`),
      ];
    },
    async markPublic(ids) {
      const r = await sql`select review.mark_public(${ids}::uuid[]) as n`;
      return Number(r[0]?.n ?? 0);
    },
    async clearPublic(ids) {
      const r = await sql`select review.clear_public(${ids}::uuid[]) as n`;
      return Number(r[0]?.n ?? 0);
    },
    async attachLarge(hash, bytes) {
      const r = await sql`select review.attach_large(${hash}, ${bytes}::bigint) as ok`;
      return r[0]?.ok === true;
    },
    async largeSettings() {
      const r =
        await sql`select enabled, large_photos::int, public_photos::int from review.large_settings()`;
      return r[0] as never;
    },
    async setLargeDownloads(enabled) {
      await sql`select review.set_large_downloads(${enabled}::boolean)`;
    },
    async publicLarge(photo) {
      const r =
        await sql`select large_path, enabled from review.public_large(${photo}::uuid)`;
      return r.length === 0
        ? null
        : {
            path: (r[0].large_path ?? null) as string | null,
            enabled: r[0].enabled === true,
          };
    },
    async socialAccounts() {
      return [
        ...(await sql`select id, platform, display_name, status from review.social_accounts_list()`),
      ];
    },
    async socialAlreadyPosted(photos) {
      return [
        ...(await sql`select photo_id, platform, account, posted_at from review.social_already_posted(${photos}::uuid[])`),
      ];
    },
    async socialCreatePost(photos, caption, accounts, by) {
      const r =
        await sql`select review.social_create_post(${photos}::uuid[], ${caption}, ${accounts}::uuid[], ${by}::uuid) as id`;
      return String(r[0].id);
    },
    async socialFailStale(post) {
      const r = await sql`select review.social_fail_stale(${post}::uuid) as n`;
      return Number(r[0]?.n ?? 0);
    },
    async socialClaim(post) {
      const r = await sql`select * from review.social_claim_target(${post}::uuid)`;
      return r.length === 0 ? null : (r[0] as never);
    },
    async socialPhotoPaths(post) {
      return [
        ...(await sql`select web_path, filename from review.social_post_photo_paths(${post}::uuid)`),
      ];
    },
    async socialRecordAttempt(target, phase, ok, http, request, response, error) {
      await sql`select review.social_record_attempt(${target}::uuid, ${phase}, ${ok}, ${http},
        ${request === null ? null : sql.json(request)}, ${response === null ? null : sql.json(response)}, ${error})`;
    },
    async socialFinish(target, published, external, permalink, error) {
      const r =
        await sql`select review.social_finish_target(${target}::uuid, ${published}, ${external}, ${permalink}, ${error}) as s`;
      return String(r[0].s);
    },
    async socialPostStatus(post) {
      const r = await sql`select review.social_post_status(${post}::uuid) as s`;
      return (r[0]?.s ?? null) as never;
    },
    async socialRecent(limit) {
      return [
        ...(await sql`select id, status, caption, approved_at, folder_name, photos::int, targets
                        from review.social_recent_posts(${limit})`),
      ] as never;
    },
    async publicTeams() {
      return [
        ...(await sql`select slug, name, albums::int, photos::int, cover_thumb from review.public_teams()`),
      ];
    },
    async publicTeam(slug) {
      const r = await sql`select review.public_team(${slug}) as page`;
      return (r[0]?.page ?? null) as never;
    },
  };
}
