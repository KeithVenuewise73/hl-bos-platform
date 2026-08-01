import { NextResponse } from "next/server";

// Public, unauthenticated health check for Coolify. No secrets, no data.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    app: "venture-studio",
    time: new Date().toISOString(),
    commit:
      process.env["SOURCE_COMMIT"] ?? process.env["COOLIFY_GIT_COMMIT_SHA"] ?? null,
  });
}
