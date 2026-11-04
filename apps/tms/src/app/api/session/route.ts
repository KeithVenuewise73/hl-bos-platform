import { NextResponse } from "next/server";
import { SESSION_COOKIE, signSession, verifyPassword } from "@/lib/auth.ts";

/** Sign in with e-mail and password (isolated environment; see lib/auth.ts). */
export async function POST(req: Request): Promise<NextResponse> {
  const body = (await req.json().catch(() => ({}))) as {
    email?: unknown;
    password?: unknown;
  };
  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  const user = await verifyPassword(email, password);
  if (!user)
    return NextResponse.json(
      { error: "E-mail or password is not right." },
      { status: 401 },
    );
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, signSession(user), {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
  });
  return res;
}

export function DELETE(): NextResponse {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
