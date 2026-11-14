// The ReviewStore over Postgres: one call per migration-0055 function. Takes a
// `postgres` (porsager) tagged-template client, so the deployed function and a
// local integration run share exactly this code.
// deno-lint-ignore-file no-explicit-any
import type { ReviewStore } from "./core.ts";

/** The publisher's registered fingerprint (null until DateSort connects). */
export async function publisherFingerprint(sql: any): Promise<string | null> {
  const r = await sql`select publisher_key_sha256 from review.service_settings()`;
  return r[0]?.publisher_key_sha256 ?? null;
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
      return { batchId: String(r[0].batch_id), known: (r[0].known ?? []) as string[] };
    },
    async commitPhotos(batchId, photos) {
      const r =
        await sql`select review.commit_photos(${batchId}::uuid, ${sql.json(photos)}) as n`;
      return Number(r[0]?.n ?? 0);
    },
    async folders() {
      return [
        ...(await sql`select id, name, sport, to_char(event_date, 'YYYY-MM-DD') as event_date,
                             team_id, team_name, waiting::int, approved::int, rejected::int, same_day::int
                        from review.folders_overview()`),
      ];
    },
    async folderPhotos(folder, status, limit, offset) {
      return [
        ...(await sql`select id, filename, to_char(taken_at, 'YYYY-MM-DD"T"HH24:MI:SS') as taken_at,
                             date_estimated, width, height, flags, status, reason,
                             web_path, thumb_path, total::int
                        from review.folder_photos(${folder}::uuid, ${status}, ${limit}, ${offset})`),
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
  };
}
