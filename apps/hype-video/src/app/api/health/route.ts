import { NextResponse } from "next/server";

import { writerStatus } from "@/lib/ai.ts";
import { store } from "@/lib/store.ts";

// A cached health check reports the health of the past.
export const dynamic = "force-dynamic";

/**
 * Health, as the Control Center asks it. "ok" only when the store can
 * actually be read; the counts come from the store, never from a constant.
 */
export async function GET(): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  try {
    const projects = await store().list();
    return NextResponse.json(
      {
        status: "ok",
        storage: "local-json",
        writer: writerStatus().aiConfigured ? "claude" : "template-writer",
        projects: projects.length,
      },
      { headers },
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        detail: error instanceof Error ? error.message : "Store unreadable.",
      },
      { status: 503, headers },
    );
  }
}
