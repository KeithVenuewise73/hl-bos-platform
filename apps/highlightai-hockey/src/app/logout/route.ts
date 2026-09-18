import { NextResponse } from "next/server";

import { serverSupabase } from "@/lib/session.ts";

export const dynamic = "force-dynamic";

/** Sign out, then land back on the sign-in screen. */
export async function POST(request: Request): Promise<Response> {
  const client = await serverSupabase();
  if (client !== null) await client.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
