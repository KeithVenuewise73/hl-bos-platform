import { config } from "@/lib/config.ts";
import { db } from "@/lib/db.ts";
import { getObject } from "@/lib/storage.ts";
import { currentUser } from "@/lib/session.ts";

export const dynamic = "force-dynamic";

/**
 * The ONLY way an image leaves this app. Signed-in members of the photo's
 * organization only; anyone else gets 404 (not 403, which would confirm the
 * photo exists). `original` is the untouched upload; `?download=1` saves it
 * under its original filename.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; variant: string }> },
): Promise<Response> {
  const user = await currentUser();
  if (user === null) return new Response("Sign in.", { status: 401 });
  const { id, variant } = await ctx.params;
  const row = db().get<{
    storage_path: string;
    thumbnail_path: string | null;
    preview_path: string | null;
    mime_type: string;
    original_filename: string;
  }>(
    "select storage_path, thumbnail_path, preview_path, mime_type, original_filename from photos where id = :id and organization_id = :org",
    { id, org: user.organizationId },
  );
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
  if (rel === null) return new Response("This photo has no preview.", { status: 404 });

  let bytes: Buffer;
  try {
    bytes = await getObject(config().dataDir, rel);
  } catch {
    return new Response("The file is missing from storage.", { status: 410 });
  }
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Content-Length": String(bytes.length),
    // Private: never stored by a shared cache. Derivatives never change.
    "Cache-Control":
      variant === "original"
        ? "private, no-store"
        : "private, max-age=86400, immutable",
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
