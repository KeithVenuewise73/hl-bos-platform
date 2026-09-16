import { NextResponse } from "next/server";
import { currentMode } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Health check.
 *
 * Reports the data mode alongside liveness, so an operator can tell at a glance
 * whether a running instance is showing real film or synthetic demo football.
 * An endpoint that says only "ok" would let a demo instance sit in production
 * indefinitely without anybody noticing.
 */
export function GET() {
  const mode = currentMode();
  return NextResponse.json({
    status: "ok",
    dataMode: mode.mode,
    databaseConfigured: mode.supabaseConfigured,
    note: mode.reason,
  });
}
