import { config } from "@/lib/config.ts";
import { db } from "@/lib/db.ts";
import { galleryPhotoFiles } from "@/lib/repo/galleries.ts";
import { getObject } from "@/lib/storage.ts";
import { visitor } from "@/lib/visitor.ts";

export const dynamic = "force-dynamic";

/**
 * A team gallery's photo: only to a visitor let in by this gallery's link and
 * password, and only a photo in a game assigned to this gallery. Anything
 * else is 404, which does not even confirm the photo exists.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ link: string; id: string; variant: string }> },
): Promise<Response> {
  const { link, id, variant } = await ctx.params;
  const gallery = await visitor(link);
  if (gallery === undefined) return new Response("Not found.", { status: 404 });
  const row = galleryPhotoFiles(db(), gallery, id);
  if (row === undefined) return new Response("Not found.", { status: 404 });

  let rel: string | null;
  let type: string;
  if (variant === "thumb") {
    rel = row.thumbnail_path;
    type = "image/webp";
  } else if (variant === "preview") {
    rel = row.preview_path;
    type = "image/jpeg";
  } else if (variant === "original") {
    rel = row.storage_path;
    type = row.mime_type;
  } else {
    return new Response("Not found.", { status: 404 });
  }
  if (rel === null) return new Response("Not found.", { status: 404 });
  let bytes: Buffer;
  try {
    bytes = await getObject(config().dataDir, rel);
  } catch {
    return new Response("The file is missing from storage.", { status: 410 });
  }
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Content-Length": String(bytes.length),
    // Never kept by a shared cache: switching a link off must take effect.
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex",
  };
  if (
    variant === "original" &&
    new URL(request.url).searchParams.get("download") === "1"
  ) {
    const ascii = row.original_filename
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\]/g, "_");
    headers["Content-Disposition"] =
      `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(row.original_filename)}`;
  }
  return new Response(new Uint8Array(bytes), { headers });
}
