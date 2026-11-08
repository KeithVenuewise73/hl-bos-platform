import { config } from "@/lib/config.ts";
import { db } from "@/lib/db.ts";
import { makeFrame } from "@/lib/instagram-core.ts";
import { draftPhotos, getDraft } from "@/lib/repo/instagram.ts";
import { sniff } from "@/lib/media-core.ts";
import { currentUser } from "@/lib/session.ts";
import { getObject } from "@/lib/storage.ts";

export const dynamic = "force-dynamic";

/** The n-th picture of a draft (1, 2, …), made now from the original, exactly as the pack has it. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ draft: string; n: string }> },
): Promise<Response> {
  const user = await currentUser();
  if (user === null) return new Response("Sign in.", { status: 401 });
  const { draft: id, n } = await params;
  const draft = getDraft(db(), user.organizationId, id);
  if (draft === undefined) return new Response("Not found.", { status: 404 });
  const photo = draftPhotos(db(), user.organizationId, draft)[Number(n) - 1];
  if (photo === undefined || !/^\d+$/.test(n))
    return new Response("Not found.", { status: 404 });
  try {
    const bytes = await getObject(config().dataDir, photo.storage_path);
    const kind = sniff(new Uint8Array(bytes));
    if (kind === null) return new Response("Not a photo.", { status: 422 });
    const frame = await makeFrame(new Uint8Array(bytes), kind, {
      format: draft.format,
      fit: draft.fit,
    });
    return new Response(new Uint8Array(frame.data), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    console.error("[jerseysort] instagram picture failed:", e);
    return new Response("That picture could not be made.", { status: 500 });
  }
}
