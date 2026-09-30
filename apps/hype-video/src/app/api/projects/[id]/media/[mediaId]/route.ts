import { NextResponse } from "next/server";

import { isId } from "@/lib/media.ts";
import { store } from "@/lib/store.ts";

export const dynamic = "force-dynamic";

/**
 * Serve an uploaded file back to this app's own pages. The Content-Type is
 * the one detected from the file's bytes at upload, never what the uploader
 * claimed, and nothing is cached outside this browser.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; mediaId: string }> },
): Promise<Response> {
  const { id, mediaId } = await params;
  if (!isId(id) || !isId(mediaId)) return new NextResponse(null, { status: 404 });
  const project = await store().get(id);
  const item = project?.media.find((m) => m.id === mediaId);
  if (item === undefined) return new NextResponse(null, { status: 404 });
  try {
    const bytes = await store().readMedia(id, item);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": item.mimeType,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
