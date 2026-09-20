import { allowed } from "@/lib/gate";
import { readPhoto } from "@/lib/photos";
import { detectFormat } from "@/lib/upload";

/**
 * Serves an uploaded photograph back to the page that uploaded it.
 *
 * The file lives outside `public/` deliberately — anything under public/ is
 * served by filename to anyone who can reach the server, and these are
 * photographs of somebody's family. This route reads it through the same
 * validated-id path the writer used.
 *
 * The content type is taken from the BYTES, not from the request. Echoing a
 * caller-supplied type back as a Content-Type header is how a stored file gets
 * served as something it is not.
 *
 * It checks the access code itself. This route has a URL of its own and never
 * renders a layout, so the unlock screen in front of the pages does not cover
 * it -- and an id that leaked into a phone's history would otherwise be a
 * photograph anyone on the network could fetch.
 */

const TYPES: Readonly<Record<string, string>> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
};

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!(await allowed())) return new Response("Not found", { status: 404 });

  const { id } = await context.params;
  const extension = new URL(request.url).searchParams.get("ext") ?? "";
  const bytes = await readPhoto(id, extension);
  if (bytes === null) return new Response("Not found", { status: 404 });

  const format = detectFormat(bytes);
  if (format === null) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": TYPES[format] ?? "application/octet-stream",
      "Content-Disposition": "inline",
      // This is a private photograph on a local machine. Nothing caches it and
      // nothing else may embed it.
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
