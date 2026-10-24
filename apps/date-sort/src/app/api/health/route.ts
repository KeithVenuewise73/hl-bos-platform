export const dynamic = "force-dynamic";

/** Health as the Control Center and DateSort.bat ask it. */
export function GET(): Response {
  return Response.json(
    // network: the only outbound calls are to Anthropic, and only when the
    // person presses "Suggest sports" (api/sport) or saves a Claude key.
    {
      status: "ok",
      app: "date-sort",
      storage: "none",
      network: "anthropic-on-request",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
