import { visualScreenshot } from "@/lib/visual";

/** A visual review's screenshot. Only names the review itself wrote are served. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; review: string; file: string }> },
): Promise<Response> {
  const { review, file } = await params;
  const bytes = await visualScreenshot(review, file);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "image/png",
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
