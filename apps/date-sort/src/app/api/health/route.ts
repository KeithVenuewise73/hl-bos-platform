export const dynamic = "force-dynamic";

/** Health as the Control Center and DateSort.bat ask it. */
export function GET(): Response {
  return Response.json(
    { status: "ok", app: "date-sort", storage: "none", network: "none" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
