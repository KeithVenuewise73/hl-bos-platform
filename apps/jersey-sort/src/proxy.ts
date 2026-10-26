import { NextResponse, type NextRequest } from "next/server";

/**
 * A fast front door: a request with no session cookie at all is sent to sign
 * in with a real 307 before any page renders. This is a convenience, not the
 * security boundary — every page, action and API route still validates the
 * session against the database itself (requireUser / currentUser), so a
 * forged or expired cookie gets past this door and is refused there.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};

const OPEN = new Set(["/login", "/signup"]);

export function proxy(request: NextRequest): NextResponse {
  if (OPEN.has(request.nextUrl.pathname)) return NextResponse.next();
  if (request.cookies.has("jerseysort_session")) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  // Keep the way back (DateSort's import link must survive signing in).
  // Only this app's own path is kept; sign-in checks it again (safeNext).
  const wanted = request.nextUrl.pathname + request.nextUrl.search;
  url.search = wanted === "/" ? "" : `?next=${encodeURIComponent(wanted)}`;
  return NextResponse.redirect(url, 307);
}
