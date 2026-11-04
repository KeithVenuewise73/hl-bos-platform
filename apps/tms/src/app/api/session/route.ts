import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/guard.ts";
import { userById } from "@/lib/demo.ts";

/**
 * Demo sign-in: choose a synthetic person. No password — local demo only.
 *
 * Answers JSON and lets the page navigate, rather than redirecting. Next
 * rewrites a redirect's Location to an absolute URL on "localhost" even when
 * the app is opened at 127.0.0.1; the browser's CSP (form-action 'self') then
 * blocks the cross-host hop and sign-in silently did nothing. Found by the
 * browser test.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const body = (await req.json().catch(() => ({}))) as { user?: unknown };
  const id = typeof body.user === "string" ? body.user : "";
  if (!userById(id)) {
    const res = NextResponse.json({ error: "Unknown demo user." }, { status: 400 });
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
  });
  return res;
}
