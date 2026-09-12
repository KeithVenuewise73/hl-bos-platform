import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/supabase";

/**
 * Liveness and configuration, in one place.
 *
 * `database: "not configured"` is a real answer, not an error: the app runs
 * without a project and says so everywhere rather than pretending to have data.
 */
export function GET() {
  return NextResponse.json({
    app: "filmstudy",
    status: "ok",
    database: supabaseConfigured() ? "configured" : "not configured",
    phase: 1,
  });
}
