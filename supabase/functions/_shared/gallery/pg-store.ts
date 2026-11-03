// The GalleryStore over Postgres: one call per migration-0053 function. Takes
// a `postgres` (porsager) tagged-template client, so the deployed function and
// a local integration run share exactly this code.
// deno-lint-ignore-file no-explicit-any
import type { GalleryStore } from "./core.ts";

/** The service's own settings (migration 0054): pass secret and publisher fingerprint. */
export async function serviceSettings(
  sql: any,
): Promise<{ accessSecret: string; publisherKeySha256: string | null } | null> {
  const r =
    await sql`select access_secret, publisher_key_sha256 from gallery.service_settings()`;
  const row = r[0];
  if (!row || String(row.access_secret ?? "").length < 32) return null;
  return {
    accessSecret: String(row.access_secret),
    publisherKeySha256: row.publisher_key_sha256 ?? null,
  };
}

export function pgStore(sql: any): GalleryStore {
  return {
    async galleryForLink(link) {
      const rows = await sql`select * from gallery.gallery_for_link(${link})`;
      return rows[0];
    },
    async visitorGames(id) {
      return [
        ...(await sql`select id, slug, title, sport, opponent, location,
                                   to_char(event_date, 'YYYY-MM-DD') as event_date,
                                   photo_count, first_thumb
                              from gallery.visitor_games(${id})`),
      ];
    },
    async visitorPhotos(id, game) {
      return [...(await sql`select * from gallery.visitor_photos(${id}, ${game})`)];
    },
    async publicListing() {
      return [
        ...(await sql`select gallery_slug, brand, group_name, gallery_name, link_token,
                                   game_slug, title, sport, opponent, location,
                                   to_char(event_date, 'YYYY-MM-DD') as event_date,
                                   photo_count, cover_path
                              from gallery.public_listing()`),
      ];
    },
    async publishGallery(p) {
      await sql`select gallery.publish_gallery(${sql.json(p)})`;
    },
    async publishGame(id, game, photos) {
      const r =
        await sql`select gallery.publish_game(${id}, ${sql.json(game)}, ${sql.json(photos)}) as removed`;
      return (r[0]?.removed ?? []) as string[];
    },
    async removeGamesExcept(id, keep) {
      const r =
        await sql`select gallery.remove_games_except(${id}, ${keep}::uuid[]) as removed`;
      return (r[0]?.removed ?? []) as string[];
    },
    async removeGallery(id) {
      const r = await sql`select gallery.remove_gallery(${id}) as removed`;
      return (r[0]?.removed ?? []) as string[];
    },
    async recordFailure(id) {
      const r = await sql`select gallery.record_unlock_failure(${id}) as n`;
      return Number(r[0]?.n ?? 0);
    },
    async registerPublisher(sha) {
      const r = await sql`select gallery.register_publisher(${sha}) as result`;
      return String(r[0]?.result ?? "closed");
    },
    async recentFailures(id) {
      const r = await sql`select gallery.recent_unlock_failures(${id}) as n`;
      return Number(r[0]?.n ?? 0);
    },
  };
}
