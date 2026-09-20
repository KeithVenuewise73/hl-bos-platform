import { NextResponse } from "next/server";

// A cached health check reports the health of the past.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Health.
 *
 * Deliberately answerable without the access code: the console polls this to
 * decide whether to show a live link, and a launcher that had to know the code
 * to ask "are you up?" would be a launcher that stores the code.
 *
 * For that reason it says nothing else. Not whether a code is set, not how many
 * photographs are stored, not who is signed in — an unauthenticated endpoint on
 * a home network answers one question and no others.
 */
export function GET(): Response {
  return NextResponse.json(
    { status: "ok", app: "sceneflow" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
