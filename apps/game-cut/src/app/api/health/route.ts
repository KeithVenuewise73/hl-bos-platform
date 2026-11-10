export const dynamic = "force-dynamic";

/** Health as the Control Center asks it. */
export function GET(): Response {
  return Response.json(
    { status: "ok", app: "game-cut", storage: "none", network: "none" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
